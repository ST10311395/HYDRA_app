/**
 * Duplicate-submit and retry safety (physical-phone review §12, §17, §18, §22, §33): double taps
 * and retries after a timeout must never create duplicate jobs, enquiries, leave or shifts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, db } from '../src/db/pool';
import { addDays, todayIso } from '../src/utils/dates';
import { SITE, api, driveJob, loginAll, resetDatabase, type Fixture, type Tokens } from './helpers';

let f: Fixture;
let t: Tokens;

beforeAll(async () => {
  f = await resetDatabase();
  t = await loginAll(f);
});
afterAll(async () => {
  await closePool();
});

const jobBody = () => ({ serviceTypeId: f.serviceTypeId, siteAddress: '4 Retry Road, Durban', description: 'Lights trip when the geyser starts', contactConfirmed: true, siteLocation: SITE });

describe('Idempotency-Key on authenticated writes', () => {
  it('a retried service request with the same key replays the first job instead of creating another', async () => {
    const key = 'm-retry-job-0001';
    const first = await api(t.customerA).post('/jobs', jobBody()).set('Idempotency-Key', key);
    expect(first.status).toBe(201);
    const again = await api(t.customerA).post('/jobs', jobBody()).set('Idempotency-Key', key);
    expect(again.status).toBe(201);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body.id).toBe(first.body.id);
    const n = await db().query('SELECT count(*)::int AS n FROM jobs WHERE site_address = $1', ['4 Retry Road, Durban']);
    expect(n.rows[0]!.n).toBe(1);
  });

  it('concurrent double taps with one key create one job', async () => {
    const key = 'm-double-tap-0002';
    const body = { ...jobBody(), siteAddress: '5 Double Tap Lane, Durban' };
    const [a, b] = await Promise.all([
      api(t.customerA).post('/jobs', body).set('Idempotency-Key', key),
      api(t.customerA).post('/jobs', body).set('Idempotency-Key', key),
    ]);
    expect([a.status, b.status].sort()).toEqual(expect.arrayContaining([201]));
    for (const r of [a, b]) expect([201, 409]).toContain(r.status);
    const n = await db().query('SELECT count(*)::int AS n FROM jobs WHERE site_address = $1', ['5 Double Tap Lane, Durban']);
    expect(n.rows[0]!.n).toBe(1);
  });

  it('reusing a key for a different request is refused; keys are per user', async () => {
    const key = 'm-shared-key-0003';
    await api(t.customerA).post('/jobs', { ...jobBody(), siteAddress: '6 Key Street, Durban' }).set('Idempotency-Key', key).expect(201);
    const other = await api(t.customerA).post('/jobs', { ...jobBody(), siteAddress: '7 Other Street, Durban' }).set('Idempotency-Key', key);
    expect(other.status).toBe(422);
    expect(other.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    // Another customer using the same key string is unaffected.
    await api(t.customerB).post('/jobs', { ...jobBody(), siteAddress: '8 Bob Street, Durban' }).set('Idempotency-Key', key).expect(201);
  });

  it('a failed attempt is not remembered, so the same key can be retried', async () => {
    const key = 'm-after-error-0004';
    const bad = await api(t.customerA).post('/jobs', { ...jobBody(), serviceTypeId: '00000000-0000-4000-8000-000000000000' }).set('Idempotency-Key', key);
    expect(bad.status).toBeGreaterThanOrEqual(400);
    await api(t.customerA).post('/jobs', { ...jobBody(), siteAddress: '9 Retry After Error, Durban' }).set('Idempotency-Key', key).expect(201);
  });

  it('malformed keys are rejected', async () => {
    const res = await api(t.customerA).post('/jobs', jobBody()).set('Idempotency-Key', 'bad key!');
    expect(res.status).toBe(400);
  });

  it('leave: a retried submission creates one request', async () => {
    const body = { leaveType: 'ANNUAL', startDate: addDays(todayIso(), 40), endDate: addDays(todayIso(), 41), reason: 'Family visit' };
    const a = await api(t.electrician1).post('/leave-requests', body).set('Idempotency-Key', 'm-leave-0005');
    const b = await api(t.electrician1).post('/leave-requests', body).set('Idempotency-Key', 'm-leave-0005');
    expect(a.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    const n = await db().query('SELECT count(*)::int AS n FROM leave_requests WHERE employee_id = $1 AND start_date = $2', [f.users.electrician1.employeeId, body.startDate]);
    expect(n.rows[0]!.n).toBe(1);
  });

  it('leave: end before start is rejected', async () => {
    const res = await api(t.electrician1).post('/leave-requests', { leaveType: 'ANNUAL', startDate: addDays(todayIso(), 10), endDate: addDays(todayIso(), 9), reason: 'Backwards' });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('endDate');
  });

  it('clock in: a replayed tap returns the same shift; a new tap while open is refused; one open shift only', async () => {
    const a = await api(t.electrician2).post('/timesheets/clock-in', {}).set('Idempotency-Key', 'm-clock-in-0006');
    expect(a.status).toBe(201);
    const replay = await api(t.electrician2).post('/timesheets/clock-in', {}).set('Idempotency-Key', 'm-clock-in-0006');
    expect(replay.body.id).toBe(a.body.id);
    const second = await api(t.electrician2).post('/timesheets/clock-in', {}).set('Idempotency-Key', 'm-clock-in-0007');
    expect(second.status).toBeGreaterThanOrEqual(400);
    const open = await db().query(`SELECT count(*)::int AS n FROM timesheets WHERE employee_id = $1 AND status = 'OPEN'`, [f.users.electrician2.employeeId]);
    expect(open.rows[0]!.n).toBe(1);
    await api(t.electrician2).post('/timesheets/clock-out', {}).set('Idempotency-Key', 'm-clock-out-0008').expect(200);
    const dup = await api(t.electrician2).post('/timesheets/clock-out', {}).set('Idempotency-Key', 'm-clock-out-0009');
    expect(dup.status).toBeGreaterThanOrEqual(400);
    const hours = await db().query<{ h: number }>(`SELECT total_hours::float AS h FROM timesheets WHERE id = $1`, [a.body.id]);
    expect(hours.rows[0]!.h).toBeGreaterThanOrEqual(0);
  });
});

describe('guest enquiries (no account)', () => {
  const enquiry = { name: 'Thabo Guest', email: 'thabo.guest@test.local', phone: '+27 82 000 1111', message: 'Need a quote for a 10 kVA solar install', source: 'QUOTE_TOOL', urgency: 'STANDARD', consent: true, details: { preferredContact: 'WHATSAPP' } };

  it('an identical re-submission returns the original reference and creates no second lead', async () => {
    const a = await api().post('/contact-queries', enquiry).expect(201);
    const b = await api().post('/contact-queries', { ...enquiry, email: 'THABO.GUEST@test.local' }).expect(201);
    expect(b.body.reference).toBe(a.body.reference);
    const n = await db().query('SELECT count(*)::int AS n FROM contact_queries WHERE lower(email) = $1', ['thabo.guest@test.local']);
    expect(n.rows[0]!.n).toBe(1);
    // A lead, never a customer job.
    const jobs = await db().query('SELECT count(*)::int AS n FROM jobs WHERE contact_query_id = $1', [a.body.id]);
    expect(jobs.rows[0]!.n).toBe(0);
  });

  it('a different message is a new enquiry; preferred contact method is stored as data', async () => {
    const c = await api().post('/contact-queries', { ...enquiry, message: 'Also need a CoC for the house' }).expect(201);
    const row = await db().query<{ details: { preferredContact: string } }>('SELECT details FROM contact_queries WHERE id = $1', [c.body.id]);
    expect(row.rows[0]!.details.preferredContact).toBe('WHATSAPP');
  });

  it('converting an enquiry twice creates one job and keeps the enquiry reference', async () => {
    const e = await api().post('/contact-queries', { ...enquiry, email: 'convert.me@test.local', message: 'Convert me into a job please' }).expect(201);
    const body = { serviceTypeId: f.serviceTypeId, siteAddress: '12 Converted Street, Durban' };
    const first = await api(t.office).post(`/contact-queries/${e.body.id}/convert`, body).set('Idempotency-Key', 'm-convert-0010');
    expect(first.status).toBe(201);
    const replay = await api(t.office).post(`/contact-queries/${e.body.id}/convert`, body).set('Idempotency-Key', 'm-convert-0010');
    expect(replay.body.jobId).toBe(first.body.jobId);
    const again = await api(t.office).post(`/contact-queries/${e.body.id}/convert`, body);
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe('ENQUIRY_CONVERTED');
    const jobs = await db().query('SELECT count(*)::int AS n FROM jobs WHERE contact_query_id = $1', [e.body.id]);
    expect(jobs.rows[0]!.n).toBe(1);
    expect(first.body.enquiry.reference).toBe(e.body.reference);
  });
});

describe('payroll period boundaries', () => {
  it('includes confirmed timesheets on the first and last day of the period and nothing outside it', async () => {
    const emp = f.users.electrician1.employeeId!;
    const start = '2026-03-01';
    const end = '2026-03-15';
    const sheet = (date: string, hours: number, status = 'CONFIRMED') =>
      db().query(
        `INSERT INTO timesheets (employee_id, work_date, clock_in, clock_out, total_hours, status) VALUES ($1, $2::date, ($2::date + time '08:00') AT TIME ZONE 'Africa/Johannesburg', ($2::date + time '08:00') AT TIME ZONE 'Africa/Johannesburg' + make_interval(hours => $3), $3, $4)`,
        [emp, date, hours, status],
      );
    await sheet('2026-02-28', 7); // day before — excluded
    await sheet(start, 1); // first day — included
    await sheet('2026-03-08', 2); // inside
    await sheet('2026-03-09', 9, 'SUBMITTED'); // not confirmed — excluded
    await sheet(end, 4); // last day — included
    await sheet('2026-03-16', 5); // day after — excluded

    const res = await api(t.office).post('/payroll/preview', { periodStart: start, periodEnd: end }).expect(200);
    const line = (res.body as { employeeId: string; totalHours: number; timesheetIds: string[] }[]).find((l) => l.employeeId === emp)!;
    expect(line.totalHours).toBe(7);
    expect(line.timesheetIds).toHaveLength(3);

    // A period with no confirmed sheets yields zero for this employee (explained in the app).
    const empty = await api(t.office).post('/payroll/preview', { periodStart: '2026-04-01', periodEnd: '2026-04-02' }).expect(200);
    const none = (empty.body as { employeeId: string; totalHours: number; netPay: number; timesheetIds: string[] }[]).find((l) => l.employeeId === emp)!;
    expect(none).toMatchObject({ totalHours: 0, netPay: 0, timesheetIds: [] });
  });
});

describe('owner-only routes (typed URLs / direct API calls)', () => {
  it('office admin gets 403 on every owner-only endpoint; owner is allowed', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const officeCalls = [
      api(t.office).get('/exports'),
      api(t.office).get('/data-requests'),
      api(t.office).post(`/data-requests/${id}/resolve`, { outcome: 'COMPLETED' }),
      api(t.office).post(`/payroll/${id}/approve`),
      api(t.office).post(`/payroll/${id}/finalise`),
      api(t.office).post(`/payroll/${id}/corrections`, { reason: 'x' }),
      api(t.office).patch(`/employees/${f.users.electrician1.employeeId}`, { hourlyRate: 999 }),
      api(t.office).get('/admins'),
    ];
    for (const res of await Promise.all(officeCalls)) expect(res.status).toBe(403);
    for (const path of ['/exports', '/data-requests', '/admins', '/audit-logs']) await api(t.owner).get(path).expect(200);
    // Customers and electricians are refused too.
    for (const who of ['customerA', 'electrician1'] as const) expect((await api(t[who]).get('/audit-logs')).status).toBe(403);
  });
});

describe('job timeline integrity', () => {
  it('nobody (admins included) can tick a future lifecycle milestone by hand', async () => {
    const j = await api(t.customerA).post('/jobs', { ...jobBody(), siteAddress: '20 Timeline Road, Durban' }).set('Idempotency-Key', 'm-timeline-0020').expect(201);
    const driven = await driveJob(f, t, 'IN_PROGRESS');
    const job = await api(t.office).get(`/jobs/${driven.jobId}`).expect(200);
    const paid = (job.body.milestones as { id: string; code: string }[]).find((m) => m.code === 'PAID')!;
    for (const who of ['office', 'owner', 'electrician1'] as const) {
      const res = await api(t[who]).post(`/jobs/${driven.jobId}/milestones/${paid.id}/complete`, {});
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('MILESTONE_AUTOMATIC');
    }
    const after = await api(t.customerA).get(`/jobs/${driven.jobId}`).expect(200);
    const states = Object.fromEntries((after.body.milestones as { code: string; status: string }[]).map((m) => [m.code, m.status]));
    expect(states).toMatchObject({ REQUESTED: 'COMPLETED', QUOTE_ACCEPTED: 'COMPLETED', ARRIVED: 'COMPLETED', COMPLETED: 'PENDING', INVOICE_ISSUED: 'PENDING', PAID: 'PENDING' });
    expect(j.body.status).toBe('REQUESTED');
  });
});
