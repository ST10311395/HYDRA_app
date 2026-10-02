/**
 * Business-rule tests (spec §14 / §26.1) exercised through the HTTP API and real PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, db } from '../src/db/pool';
import { overrideIntegrations } from '../src/integrations';
import { UnconfiguredProvider, type MessagingProvider } from '../src/integrations/messaging';
import { TASKS } from '../src/jobs/tasks';
import { addDays, todayIso } from '../src/utils/dates';
import { CHECKLIST, SITE, api, driveJob, loginAll, resetDatabase, window, type Fixture, type Tokens } from './helpers';

let f: Fixture;
let t: Tokens;

beforeAll(async () => {
  f = await resetDatabase();
  t = await loginAll(f);
});
afterAll(async () => {
  await closePool();
});

describe('materials and inventory', () => {
  it('rejects quantities exceeding stock; owner override is allowed and audited', async () => {
    const j = await driveJob(f, t, 'IN_PROGRESS');
    const short = await api(t.electrician1).post(`/jobs/${j.jobId}/materials`, { items: [{ materialId: f.materials.scarce, quantity: 5 }] });
    expect(short.status).toBe(422);
    expect(short.body.error.code).toBe('INSUFFICIENT_STOCK');
    const stock = await db().query<{ s: number }>('SELECT stock_level AS s FROM materials WHERE id = $1', [f.materials.scarce]);
    expect(stock.rows[0]!.s).toBe(2); // nothing partially applied
    expect((await api(t.electrician1).post(`/jobs/${j.jobId}/materials`, { items: [{ materialId: f.materials.scarce, quantity: 5 }], overrideStock: true })).status).toBe(403);
    const ok = await api(t.owner).post(`/jobs/${j.jobId}/materials`, { items: [{ materialId: f.materials.scarce, quantity: 3 }], overrideStock: true });
    expect(ok.status).toBe(201);
    const after = await db().query<{ s: number }>('SELECT stock_level AS s FROM materials WHERE id = $1', [f.materials.scarce]);
    expect(after.rows[0]!.s).toBe(-1);
    const mv = await db().query(`SELECT 1 FROM stock_movements WHERE material_id = $1 AND reason = 'OVERRIDE'`, [f.materials.scarce]);
    expect(mv.rowCount).toBe(1);
    const alerts = await api(t.office).get('/notifications').expect(200);
    expect(alerts.body.items.some((n: { type: string }) => n.type === 'LOW_STOCK')).toBe(true);
    const low = await api(t.office).get('/inventory/low-stock').expect(200);
    expect(low.body.items.map((m: { id: string }) => m.id)).toContain(f.materials.scarce);
  });

  it('materials can only be logged while the job is in progress', async () => {
    const j = await driveJob(f, t, 'SCHEDULED');
    expect((await api(t.electrician1).post(`/jobs/${j.jobId}/materials`, { items: [{ materialId: f.materials.cable, quantity: 1 }] })).status).toBe(422);
  });

  it('reversing a material entry returns stock', async () => {
    const j = await driveJob(f, t, 'IN_PROGRESS');
    const res = await api(t.electrician1).post(`/jobs/${j.jobId}/materials`, { items: [{ materialId: f.materials.cable, quantity: 4 }] }).expect(201);
    const before = (await db().query<{ s: number }>('SELECT stock_level AS s FROM materials WHERE id = $1', [f.materials.cable])).rows[0]!.s;
    const del = await api(t.electrician1).delete(`/jobs/${j.jobId}/materials/${res.body.materials[0].id}`);
    expect(del.status).toBe(200);
    expect(del.body.materialsCost).toBe(0);
    const after = (await db().query<{ s: number }>('SELECT stock_level AS s FROM materials WHERE id = $1', [f.materials.cable])).rows[0]!.s;
    expect(after).toBe(before + 4);
  });

  it('admin stock adjustments are recorded as movements; negatives need the owner', async () => {
    expect((await api(t.office).post(`/materials/${f.materials.breaker}/adjust`, { delta: 20, reason: 'RESTOCK', note: 'Supplier delivery' })).status).toBe(200);
    expect((await api(t.office).post(`/materials/${f.materials.breaker}/adjust`, { delta: -500, reason: 'ADJUSTMENT', note: 'Stock take' })).status).toBe(422);
    const mv = await api(t.office).get(`/stock-movements?materialId=${f.materials.breaker}`).expect(200);
    expect(mv.body.items[0]).toMatchObject({ reason: 'RESTOCK', delta: 20 });
  });

  it('material detail is admin-only and 404s for unknown items', async () => {
    const res = await api(t.office).get(`/materials/${f.materials.breaker}`).expect(200);
    expect(res.body).toMatchObject({ id: f.materials.breaker, isArchived: false });
    expect((await api(t.electrician1).get(`/materials/${f.materials.breaker}`)).status).toBe(403);
    expect((await api(t.office).get('/materials/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});

describe('inspection and completion', () => {
  it('a failed inspection sends the job back to in-progress; invoice blocked until it passes', async () => {
    const j = await driveJob(f, t, 'INSPECTION_PENDING');
    const fail = await api(t.electrician1).post(`/jobs/${j.jobId}/inspection`, {
      complianceStatus: 'FAIL', findings: 'Earth fault found on circuit 4', checklist: [{ key: 'earth', label: 'Earth', result: 'FAIL' }], signatureName: 'Sam', confirmed: true,
    });
    expect(fail.status).toBe(201);
    expect(fail.body.status).toBe('IN_PROGRESS');
    expect((await api(t.office).post(`/jobs/${j.jobId}/invoice`, { dueDate: addDays(todayIso(), 7) })).status).toBe(422);
    await api(t.electrician1).post(`/jobs/${j.jobId}/complete`, {}).expect(200);
    const pass = await api(t.electrician1).post(`/jobs/${j.jobId}/inspection`, { complianceStatus: 'PASS', certificateNumber: 'COC-FIX-1', findings: 'Remedied and retested', checklist: CHECKLIST, signatureName: 'Sam', confirmed: true });
    expect(pass.body.status).toBe('COMPLETED');
    expect(pass.body.inspections).toHaveLength(2);
  });

  it('PASS reports require a certificate number and no failed checks', async () => {
    const j = await driveJob(f, t, 'INSPECTION_PENDING');
    const noCert = await api(t.electrician1).post(`/jobs/${j.jobId}/inspection`, { complianceStatus: 'PASS', findings: 'All good here', checklist: CHECKLIST, signatureName: 'Sam', confirmed: true });
    expect(noCert.status).toBe(422);
    const failedCheck = await api(t.electrician1).post(`/jobs/${j.jobId}/inspection`, { complianceStatus: 'PASS', certificateNumber: 'C-9', findings: 'All good here', checklist: [{ key: 'a', label: 'A', result: 'FAIL' }], signatureName: 'Sam', confirmed: true });
    expect(failedCheck.status).toBe(422);
  });

  it('admin can confirm arrival when the QR scan fails (audited)', async () => {
    const j = await driveJob(f, t, 'SCHEDULED');
    const res = await api(t.office).post(`/jobs/${j.jobId}/confirm-arrival`, { reason: 'Customer phone battery dead' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
    expect(res.body.checkins[0].method).toBe('ADMIN_OVERRIDE');
  });

  it('expired QR codes are rejected', async () => {
    const j = await driveJob(f, t, 'SCHEDULED');
    const qr = await api(t.customerA).get(`/jobs/${j.jobId}/qr`).expect(200);
    await db().query(`UPDATE job_qr_tokens SET expires_at = now() - interval '1 minute' WHERE job_id = $1`, [j.jobId]);
    const res = await api(t.electrician1).post(`/jobs/${j.jobId}/checkin`, { qrToken: qr.body.payload, location: SITE });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('QR_EXPIRED');
  });
});

describe('rewards and discounts', () => {
  it('redemption deducts points, applies discount and reduces the invoice atomically', async () => {
    const acct = await db().query<{ id: string }>('SELECT id FROM rewards_accounts WHERE customer_id = $1', [f.users.customerA.customerId]);
    await db().query('UPDATE rewards_accounts SET points_balance = 600, lifetime_points = 600 WHERE id = $1', [acct.rows[0]!.id]);
    const d = await api(t.office).post('/discounts', { code: 'LOYAL10', description: '10% off', discountType: 'PERCENT', value: 10, pointsCost: 500, minSpend: 100, validFrom: addDays(todayIso(), -1), validUntil: addDays(todayIso(), 30) });
    expect(d.status).toBe(201);
    const j = await driveJob(f, t, 'INVOICED');
    const offers = await api(t.customerA).get('/discounts').expect(200);
    expect(offers.body[0]).toMatchObject({ code: 'LOYAL10', eligible: true });
    const before = await api(t.customerA).get(`/invoices/${j.invoiceId}`).expect(200);
    const res = await api(t.customerA).post(`/discounts/${d.body.id}/redeem`, { invoiceId: j.invoiceId });
    expect(res.status).toBe(200);
    expect(res.body.summary.pointsBalance).toBe(100);
    const after = await api(t.customerA).get(`/invoices/${j.invoiceId}`).expect(200);
    expect(after.body.discountTotal).toBe(Math.round(before.body.amountDue * 10) / 100);
    expect(after.body.amountDue).toBeCloseTo(before.body.amountDue * 0.9, 2);
    expect(after.body.discounts[0]).toMatchObject({ code: 'LOYAL10', pointsSpent: 500 });
    // Insufficient points and double-application are refused
    const again = await api(t.customerA).post(`/discounts/${d.body.id}/redeem`, { invoiceId: j.invoiceId });
    expect(again.status).toBe(422);
    const tx = await api(t.customerA).get('/rewards/transactions').expect(200);
    expect(tx.body.items[0]).toMatchObject({ type: 'REDEEM', pointsRedeemed: 500 });
    // Another customer cannot redeem against this invoice
    expect((await api(t.customerB).post(`/discounts/${d.body.id}/redeem`, { invoiceId: j.invoiceId })).status).toBe(404);
  });

  it('rewards are not credited on partial payment', async () => {
    const j = await driveJob(f, t, 'INVOICED', { customer: 'customerB' });
    const inv = await api(t.office).post(`/invoices/${j.invoiceId}/manual-payments`, { amount: 100, method: 'EFT', reference: 'PARTIAL-1', paidOn: todayIso() });
    expect(inv.status).toBe(201);
    expect(inv.body.status).toBe('PARTIALLY_PAID');
    const r = await api(t.customerB).get('/rewards').expect(200);
    expect(r.body.pointsBalance).toBe(0);
  });
});

describe('workforce: timesheets, leave and payroll', () => {
  it('clock in/out calculates hours and prevents simultaneous open shifts', async () => {
    await db().query(`UPDATE timesheets SET clock_out = clock_in + interval '1 hour', total_hours = 1, status = 'SUBMITTED' WHERE clock_out IS NULL`);
    const inRes = await api(t.electrician2).post('/timesheets/clock-in', {});
    expect(inRes.status).toBe(201);
    expect((await api(t.electrician2).post('/timesheets/clock-in', {})).status).toBe(409);
    await db().query(`UPDATE timesheets SET clock_in = now() - interval '3 hours 30 minutes' WHERE id = $1`, [inRes.body.id]);
    const out = await api(t.electrician2).post('/timesheets/clock-out', { notes: 'Wrapped up' });
    expect(out.status).toBe(200);
    expect(out.body.status).toBe('SUBMITTED');
    expect(out.body.totalHours).toBeCloseTo(3.5, 1);
    expect((await api(t.electrician2).post('/timesheets/clock-out', {})).status).toBe(422);
    const mine = await api(t.electrician2).get('/timesheets').expect(200);
    expect(mine.body.items.every((x: { employeeId: string }) => x.employeeId === f.users.electrician2.employeeId)).toBe(true);
  });

  it('leave request → approval blocks availability for assignment', async () => {
    const day = addDays(todayIso(), 20);
    const lr = await api(t.electrician2).post('/leave-requests', { leaveType: 'ANNUAL', startDate: day, endDate: day, reason: 'Wedding' });
    expect(lr.status).toBe(201);
    expect(lr.body.status).toBe('PENDING');
    const dup = await api(t.electrician2).post('/leave-requests', { leaveType: 'ANNUAL', startDate: day, endDate: day, reason: 'Again' });
    expect(dup.status).toBe(409);
    const dec = await api(t.office).post(`/leave-requests/${lr.body.id}/decision`, { decision: 'APPROVE', note: 'Enjoy' });
    expect(dec.status).toBe(200);
    expect(dec.body.leave.status).toBe('APPROVED');
    const notes = await api(t.electrician2).get('/notifications').expect(200);
    expect(notes.body.items.some((n: { type: string }) => n.type === 'LEAVE_DECIDED')).toBe(true);
    const j = await driveJob(f, t, 'QUOTE_ACCEPTED');
    const w = window(20, 10, 2);
    const avail = await api(t.office).get(`/jobs/availability/electricians?start=${encodeURIComponent(w.scheduledStart)}&end=${encodeURIComponent(w.scheduledEnd)}`).expect(200);
    const e2 = avail.body.find((e: { id: string }) => e.id === f.users.electrician2.employeeId);
    expect(e2.available).toBe(false);
    const clash = await api(t.office).post(`/jobs/${j.jobId}/assign`, { employeeId: f.users.electrician2.employeeId, ...w });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SCHEDULE_CONFLICT');
    expect((await api(t.office).post(`/jobs/${j.jobId}/assign`, { employeeId: f.users.electrician2.employeeId, ...w, overrideConflicts: true })).status).toBe(200);
  });

  it('payroll uses confirmed timesheets, holds unpaid-job hours, and finalised records are immutable', async () => {
    const e = f.users.electrician2.employeeId!;
    const start = addDays(todayIso(), -40);
    const end = addDays(todayIso(), -30);
    await db().query(
      `INSERT INTO timesheets (employee_id, work_date, clock_in, clock_out, total_hours, status) VALUES
        ($1, $2, $3, $4, 8, 'CONFIRMED'), ($1, $5, $6, $7, 6.5, 'CONFIRMED'), ($1, $5, $8, $9, 2, 'SUBMITTED')`,
      [e, addDays(todayIso(), -35), `${addDays(todayIso(), -35)}T06:00:00Z`, `${addDays(todayIso(), -35)}T14:00:00Z`,
        addDays(todayIso(), -34), `${addDays(todayIso(), -34)}T06:00:00Z`, `${addDays(todayIso(), -34)}T12:30:00Z`,
        `${addDays(todayIso(), -34)}T13:00:00Z`, `${addDays(todayIso(), -34)}T15:00:00Z`],
    );
    // A confirmed timesheet linked to a job whose invoice is unpaid is held back (cash-flow rule)
    const unpaid = await driveJob(f, t, 'INVOICED', { customer: 'customerB' });
    await db().query(
      `INSERT INTO timesheets (employee_id, job_id, work_date, clock_in, clock_out, total_hours, status) VALUES ($1,$2,$3,$4,$5,3,'CONFIRMED')`,
      [e, unpaid.jobId, addDays(todayIso(), -33), `${addDays(todayIso(), -33)}T06:00:00Z`, `${addDays(todayIso(), -33)}T09:00:00Z`],
    );
    const preview = await api(t.office).post('/payroll/preview', { periodStart: start, periodEnd: end, employeeIds: [e] }).expect(200);
    expect(preview.body[0]).toMatchObject({ totalHours: 14.5, grossPay: 2900, paye: 290, uif: 29, deductions: 319, netPay: 2581 });
    expect(preview.body[0].heldTimesheetIds).toHaveLength(1);
    const run = await api(t.office).post('/payroll', { periodStart: start, periodEnd: end, employeeIds: [e] });
    expect(run.status).toBe(201);
    const id = run.body[0].id;
    expect(run.body[0]).toMatchObject({ status: 'DRAFT', netPay: 2581, timesheetCount: 2 });
    expect((await api(t.office).post('/payroll', { periodStart: start, periodEnd: end, employeeIds: [e] })).body).toHaveLength(0);
    expect((await api(t.office).post(`/payroll/${id}/approve`)).status).toBe(403);
    expect((await api(t.owner).post(`/payroll/${id}/finalise`)).status).toBe(422);
    await api(t.owner).post(`/payroll/${id}/approve`).expect(200);
    const fin = await api(t.owner).post(`/payroll/${id}/finalise`).expect(200);
    expect(fin.body.status).toBe('FINALISED');
    await expect(db().query('UPDATE payrolls SET net_pay = 1, gross_pay = 1, deductions = 0 WHERE id = $1', [id])).rejects.toThrow(/immutable/);
    const corr = await api(t.owner).post(`/payroll/${id}/corrections`, { reason: 'Missed overtime hour', grossAdjustment: 200, deductionsAdjustment: 20 });
    expect(corr.status).toBe(201);
    expect(corr.body).toMatchObject({ correctsPayrollId: id, netPay: 180, status: 'DRAFT' });
    const ts = await db().query<{ status: string }>(`SELECT status FROM timesheets WHERE payroll_id = $1`, [id]);
    expect(ts.rows.every((r) => r.status === 'PAID')).toBe(true);
  });
});

describe('enquiries (contact queries)', () => {
  it('guest submits an enquiry; admin sees it and converts it with traceability', async () => {
    const sub = await api().post('/contact-queries', { name: 'Zanele Guest', email: 'zanele@example.com', phone: '+27 82 111 2222', message: 'Please quote for a new DB board', consent: true });
    expect(sub.status).toBe(201);
    expect(sub.body.status).toBe('NEW');
    const bot = await api().post('/contact-queries', { name: 'Bot', email: 'bot@example.com', phone: '+27 82 111 2222', message: 'spam spam spam spam', consent: true, website: 'http://spam' });
    expect(bot.status).toBe(422);
    expect((await api(t.customerA).get('/contact-queries')).status).toBe(403);
    const inbox = await api(t.office).get('/contact-queries?status=NEW').expect(200);
    expect(inbox.body.items[0]).toMatchObject({ id: sub.body.id, name: 'Zanele Guest' });
    await api(t.office).patch(`/contact-queries/${sub.body.id}`, { status: 'IN_PROGRESS', assignToMe: true }).expect(200);
    const conv = await api(t.office).post(`/contact-queries/${sub.body.id}/convert`, { serviceTypeId: f.serviceTypeId, siteAddress: '4 Guest Lane, Durban' });
    expect(conv.status).toBe(201);
    expect(conv.body.customerProvisioned).toBe(true);
    expect(conv.body.enquiry).toMatchObject({ status: 'CONVERTED', convertedJobId: conv.body.jobId });
    const job = await db().query<{ contact_query_id: string; source: string; status: string }>('SELECT contact_query_id, source, status FROM jobs WHERE id = $1', [conv.body.jobId]);
    expect(job.rows[0]).toMatchObject({ contact_query_id: sub.body.id, source: 'CONTACT_QUERY', status: 'REQUESTED' });
    expect((await api(t.office).post(`/contact-queries/${sub.body.id}/convert`, { serviceTypeId: f.serviceTypeId, siteAddress: '4 Guest Lane' })).status).toBe(422);
  });
});

describe('missed-call automation', () => {
  it('unknown caller goes to human review; known customer with open job is auto-replied when enabled', async () => {
    const res = await api(t.office).post('/missed-calls', { phoneNumber: '+27 71 000 9999', callAt: new Date().toISOString(), source: 'MANUAL' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'REVIEW_REQUIRED', classification: 'UNKNOWN_CALLER' });

    // Device-sourced logs need the feature flag and recorded consent
    const dev = await api(t.office).post('/missed-calls', { phoneNumber: '+27 71 000 9998', callAt: new Date().toISOString(), source: 'DEVICE_MONITOR' });
    expect(dev.status).toBe(403);
    await api(t.owner).patch('/settings', { missedCallAutomationEnabled: true }).expect(200);
    await api(t.office).post('/missed-calls/consent', { granted: true }).expect(200);

    const sent: string[] = [];
    const fake: MessagingProvider = { channel: 'SMS', configured: true, send: async (to, body) => (sent.push(`${to}:${body}`), { status: 'SENT', provider: 'fake', providerMessageId: 'SM1', error: null }) };
    overrideIntegrations({ messaging: { SMS: fake, WHATSAPP: fake } });
    await driveJob(f, t, 'SCHEDULED');
    const known = await api(t.office).post('/missed-calls', { phoneNumber: '082 000 0001', callAt: new Date().toISOString(), source: 'DEVICE_MONITOR', deviceId: 'office-phone' });
    expect(known.status).toBe(201);
    expect(known.body).toMatchObject({ status: 'AUTO_REPLIED', classification: 'OPEN_JOB_STATUS' });
    expect(known.body.messages[0]).toMatchObject({ deliveryStatus: 'SENT', channel: 'SMS' });
    expect(sent[0]).toContain('+27820000001');
    const dupe = await api(t.office).post('/missed-calls', { phoneNumber: '082 000 0001', callAt: known.body.callAt, source: 'DEVICE_MONITOR' });
    expect(dupe.status).toBe(409);

    const reply = await api(t.office).post(`/missed-calls/${res.body.id}/reply`, { message: 'Hi, this is PSG Electrical returning your call.', channel: 'SMS' });
    expect(reply.body.missedCall.status).toBe('REPLIED');
    const logs = await api(t.office).get('/message-logs').expect(200);
    expect(logs.body.total).toBe(2);
    expect((await api(t.electrician1).get('/missed-calls')).status).toBe(403);
  });

  it('without a configured provider, messages are honestly recorded as NOT_CONFIGURED', async () => {
    overrideIntegrations({ messaging: { SMS: new UnconfiguredProvider('SMS'), WHATSAPP: new UnconfiguredProvider('WHATSAPP') } });
    const mc = await api(t.office).post('/missed-calls', { phoneNumber: '+27 71 555 0000', callAt: new Date().toISOString(), source: 'MANUAL' }).expect(201);
    const reply = await api(t.office).post(`/missed-calls/${mc.body.id}/reply`, { message: 'Returning your call from PSG', channel: 'SMS' });
    expect(reply.body.delivery).toBe('NOT_CONFIGURED');
    expect(reply.body.missedCall.messages[0].deliveryStatus).toBe('NOT_CONFIGURED');
  });
});

describe('scheduled tasks', () => {
  it('marks past-due invoices overdue and expires stale quotes', async () => {
    const j = await driveJob(f, t, 'INVOICED', { customer: 'customerB' });
    await db().query(`UPDATE invoices SET invoice_date = CURRENT_DATE - 20, due_date = CURRENT_DATE - 1 WHERE id = $1`, [j.invoiceId]);
    await TASKS.invoiceOverdue();
    expect((await api(t.customerB).get(`/invoices/${j.invoiceId}`)).body.status).toBe('OVERDUE');
    const q = await driveJob(f, t, 'QUOTED');
    await db().query(`UPDATE quotes SET valid_until = CURRENT_DATE - 1 WHERE id = $1`, [q.quoteId]);
    await TASKS.quoteExpiry();
    expect((await api(t.customerA).get(`/quotes/${q.quoteId}`)).body.status).toBe('EXPIRED');
    expect((await api(t.customerA).post(`/quotes/${q.quoteId}/accept`)).status).toBe(422);
  });
});

describe('dashboards, onboarding and public content', () => {
  it('guest can browse public content without logging in', async () => {
    for (const url of ['/service-types', '/portfolio', '/faqs', '/partners', '/team', '/offices', '/departments', '/public-content']) {
      expect((await api().get(url)).status, url).toBe(200);
    }
    expect((await api().get('/jobs')).status).toBe(401);
  });

  it('onboarding walkthrough completes once', async () => {
    const d1 = await api(t.customerB).get('/dashboard/customer').expect(200);
    expect(d1.body.onboardingCompleted).toBe(false);
    await api(t.customerB).post('/profile/onboarding-complete').expect(200);
    const d2 = await api(t.customerB).get('/dashboard/customer').expect(200);
    expect(d2.body.onboardingCompleted).toBe(true);
  });

  it('role dashboards are role-gated', async () => {
    expect((await api(t.electrician1).get('/dashboard/employee')).status).toBe(200);
    expect((await api(t.office).get('/dashboard/admin')).status).toBe(200);
    expect((await api(t.customerA).get('/dashboard/admin')).status).toBe(403);
    expect((await api(t.customerA).get('/dashboard/employee')).status).toBe(403);
  });

  it('customers can export their own data (POPIA access request)', async () => {
    const res = await api(t.customerA).get('/profile/data-export').expect(200);
    expect(res.body.profile.email).toBe(f.users.customerA.email);
    expect(res.body.jobs.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain('password');
  });
});
