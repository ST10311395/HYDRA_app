/**
 * Security tests (spec §26.4): ownership, RBAC tiers, tokens, refresh rotation, webhooks, uploads,
 * brute force, Google identity linking, audit immutability.
 */
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config, loadConfig, setConfig } from '../src/config/env';
import { closePool, db } from '../src/db/pool';
import { integrations } from '../src/integrations';
import type { SimulatedGateway } from '../src/integrations/payments';
import { addDays, todayIso } from '../src/utils/dates';
import { API, PASSWORD, api, driveJob, getApp, googleToken, login, loginAll, resetDatabase, type Fixture, type Tokens } from './helpers';

let f: Fixture;
let t: Tokens;

beforeAll(async () => {
  f = await resetDatabase();
  t = await loginAll(f);
});
afterAll(async () => {
  await closePool();
});

describe('ownership: customer A cannot access customer B', () => {
  it('job, quote, invoice, QR and inspection of another customer return 404', async () => {
    const b = await driveJob(f, t, 'INVOICED', { customer: 'customerB' });
    for (const url of [`/jobs/${b.jobId}`, `/quotes/${b.quoteId}`, `/invoices/${b.invoiceId}`, `/invoices/${b.invoiceId}/pdf`, `/jobs/${b.jobId}/qr`]) {
      const res = await api(t.customerA).get(url);
      expect(res.status, url).toBe(404);
    }
    expect((await api(t.customerA).post(`/invoices/${b.invoiceId}/payments`, {})).status).toBe(404);
    const pdf = await api(t.customerB).get(`/invoices/${b.invoiceId}/pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await api(t.customerA).post(`/jobs/${b.jobId}/notes`, { body: 'hi' })).status).toBe(404);
    const list = await api(t.customerA).get('/jobs').expect(200);
    expect(list.body.items.find((j: { id: string }) => j.id === b.jobId)).toBeUndefined();
    const invList = await api(t.customerA).get('/invoices').expect(200);
    expect(invList.body.items).toHaveLength(0);
    const reports = await api(t.customerA).get('/inspection-reports').expect(200);
    expect(reports.body.items).toHaveLength(0);
    // Query-string scoping cannot be abused by customers
    const scoped = await api(t.customerA).get(`/jobs?customerId=${f.users.customerB.customerId}`).expect(200);
    expect(scoped.body.items).toHaveLength(0);
  });

  it('customer cannot accept a quote belonging to another customer', async () => {
    const b = await driveJob(f, t, 'QUOTED', { customer: 'customerB' });
    expect((await api(t.customerA).post(`/quotes/${b.quoteId}/accept`)).status).toBe(404);
  });

  it('electrician only sees assigned jobs and cannot check in to another electrician’s job', async () => {
    const j = await driveJob(f, t, 'SCHEDULED', { electrician: 'electrician1' });
    expect((await api(t.electrician2).get(`/jobs/${j.jobId}`)).status).toBe(404);
    const qr = await api(t.customerA).get(`/jobs/${j.jobId}/qr`).expect(200);
    const res = await api(t.electrician2).post(`/jobs/${j.jobId}/checkin`, { qrToken: qr.body.payload, location: { latitude: 1, longitude: 1 } });
    expect(res.status).toBe(404);
    expect((await api(t.electrician2).get(`/schedules?employeeId=${f.users.electrician1.employeeId}`)).status).toBe(403);
  });
});

describe('role tiers', () => {
  it('employee cannot access payroll, exports, admin data or other employees', async () => {
    expect((await api(t.electrician1).get('/payroll')).status).toBe(403);
    expect((await api(t.electrician1).post('/payroll/preview', { periodStart: todayIso(), periodEnd: todayIso() })).status).toBe(403);
    expect((await api(t.electrician1).post('/exports', { type: 'CUSTOMERS', from: todayIso(), to: todayIso() })).status).toBe(403);
    expect((await api(t.electrician1).get('/customers')).status).toBe(403);
    expect((await api(t.electrician1).get('/audit-logs')).status).toBe(403);
    expect((await api(t.electrician1).get(`/employees/${f.users.electrician2.employeeId}`)).status).toBe(404);
    const self = await api(t.electrician1).get(`/employees/${f.users.electrician1.employeeId}`).expect(200);
    expect(self.body.hourlyRate).toBe(0);
  });

  it('office admin cannot use owner-only endpoints', async () => {
    expect((await api(t.office).post('/exports', { type: 'CUSTOMERS', from: todayIso(), to: todayIso() })).status).toBe(403);
    expect((await api(t.office).get('/audit-logs')).status).toBe(403);
    expect((await api(t.office).patch('/settings', { vatRate: 0 })).status).toBe(403);
    expect((await api(t.office).get('/reports/summary')).status).toBe(403);
    expect((await api(t.office).post('/admins/staff', { role: 'ADMIN_OWNER', firstName: 'X', lastName: 'Y', email: 'x@y.co', phone: '+27820000000', password: 'long-enough-password' })).status).toBe(403);
    expect((await api(t.office).patch(`/users/${f.users.owner.id}/status`, { status: 'DISABLED' })).status).toBe(403);
  });

  it('owner export succeeds and is audited in DATA_EXPORT_LOG', async () => {
    const res = await request(getApp()).post(`${API}/exports`).set('Authorization', `Bearer ${t.owner}`).send({ type: 'JOBS', format: 'CSV', from: addDays(todayIso(), -1), to: todayIso() });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.split('\r\n')[0]).toContain('Reference');
    expect(res.text).not.toMatch(/password|\$2[aby]\$/i);
    const pdf = await request(getApp()).post(`${API}/exports`).set('Authorization', `Bearer ${t.owner}`).send({ type: 'CUSTOMERS', format: 'PDF', from: addDays(todayIso(), -1), to: todayIso() });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const logs = await api(t.owner).get('/exports').expect(200);
    expect(logs.body.total).toBe(2);
    const audit = await db().query(`SELECT 1 FROM audit_logs WHERE action = 'DATA_EXPORTED'`);
    expect(audit.rowCount).toBe(2);
  });

  it('a client-supplied role is ignored at registration', async () => {
    const res = await api().post('/auth/register', {
      firstName: 'Eve', lastName: 'Il', email: 'eve@test.local', phone: '+27 82 999 0000', password: 'long-enough-password', acceptPrivacyPolicy: true, role: 'ADMIN_OWNER',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('CUSTOMER');
  });
});

describe('tokens and sessions', () => {
  it('rejects missing, malformed, tampered and expired access tokens', async () => {
    expect((await api().get('/auth/me')).status).toBe(401);
    expect((await api('not-a-jwt').get('/auth/me')).status).toBe(401);
    const [h, p, s] = t.customerA.split('.');
    const claims = JSON.parse(Buffer.from(p!, 'base64url').toString());
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...claims, role: 'ADMIN_OWNER' })).toString('base64url')}.${s}`;
    expect((await api(forged).get('/audit-logs')).status).toBe(401);
    const expired = await new SignJWT({ role: 'CUSTOMER', sid: claims.sid, tv: 0, cid: claims.cid })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(claims.sub).setIssuer(config().JWT_ISSUER).setAudience(config().JWT_AUDIENCE)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600).setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(config().jwtAccessSecret));
    const res = await api(expired).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/expired/i);
  });

  it('rotates refresh tokens and detects reuse (revokes the whole family)', async () => {
    const s = await login(f.users.customerA.email);
    const r1 = await api().post('/auth/refresh', { refreshToken: s.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(s.refreshToken);
    // Reusing the rotated token → reuse detected, family revoked
    expect((await api().post('/auth/refresh', { refreshToken: s.refreshToken })).status).toBe(401);
    expect((await api().post('/auth/refresh', { refreshToken: r1.body.refreshToken })).status).toBe(401);
    expect((await api(r1.body.accessToken).get('/auth/me')).status).toBe(401);
    const audit = await db().query(`SELECT 1 FROM audit_logs WHERE action = 'AUTH_REFRESH_REUSE_DETECTED'`);
    expect(audit.rowCount).toBeGreaterThan(0);
  });

  it('logout revokes the session immediately', async () => {
    const s = await login(f.users.customerA.email);
    await api(s.token).post('/auth/logout', { refreshToken: s.refreshToken }).expect(204);
    expect((await api(s.token).get('/auth/me')).status).toBe(401);
    expect((await api().post('/auth/refresh', { refreshToken: s.refreshToken })).status).toBe(401);
  });

  it('refresh tokens are stored only as hashes', async () => {
    const s = await login(f.users.customerB.email);
    const { rows } = await db().query<{ token_hash: string }>('SELECT token_hash FROM refresh_tokens');
    expect(rows.some((r) => r.token_hash === s.refreshToken)).toBe(false);
    const pw = await db().query<{ password_hash: string }>('SELECT password_hash FROM users WHERE email = $1', [f.users.customerB.email]);
    expect(pw.rows[0]!.password_hash).toMatch(/^\$2[aby]\$/);
  });

  it('password reset tokens are single-use and revoke existing sessions', async () => {
    const outbox = integrations().email as unknown as { sent: { to: string; text: string }[] };
    const res = await api().post('/auth/forgot-password', { email: f.users.customerB.email });
    expect(res.status).toBe(202);
    const unknown = await api().post('/auth/forgot-password', { email: 'nobody@test.local' });
    expect(unknown.status).toBe(202);
    expect(unknown.body).toEqual(res.body);
    const mail = outbox.sent.filter((m) => m.to === f.users.customerB.email).pop()!;
    const token = decodeURIComponent(/token=([^\s]+)/.exec(mail.text)![1]!);
    const before = await login(f.users.customerB.email);
    expect((await api().post('/auth/reset-password', { token, password: 'brand-new-password-123' })).status).toBe(200);
    expect((await api().post('/auth/reset-password', { token, password: 'another-password-4567' })).status).toBe(422);
    expect((await api(before.token).get('/auth/me')).status).toBe(401);
    expect((await api().post('/auth/login', { identifier: f.users.customerB.email, password: PASSWORD })).status).toBe(401);
    t.customerB = (await login(f.users.customerB.email, 'brand-new-password-123')).token;
  });
});

describe('brute force protection', () => {
  it('locks the account after repeated failures without revealing whether it exists', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await api().post('/auth/login', { identifier: f.users.electrician2.email, password: 'wrong-password-x' });
      expect(r.status).toBe(401);
    }
    const locked = await api().post('/auth/login', { identifier: f.users.electrician2.email, password: PASSWORD });
    expect(locked.status).toBe(401);
    const unknown = await api().post('/auth/login', { identifier: 'ghost@test.local', password: 'whatever-password' });
    expect(unknown.body.error.message).toBe(locked.body.error.message);
    await db().query('UPDATE users SET locked_until = NULL, failed_login_count = 0 WHERE email = $1', [f.users.electrician2.email]);
  });

  it('HTTP rate limiter returns 429 on the login endpoint', async () => {
    const prev = config();
    setConfig({ ...loadConfig({ ...process.env, DISABLE_RATE_LIMIT: 'false' }) });
    try {
      let last = 0;
      for (let i = 0; i < 12; i++) {
        last = (await request(getApp()).post(`${API}/auth/login`).set('X-Forwarded-For', '10.9.9.9').send({ identifier: 'rl@test.local', password: 'x' })).status;
      }
      expect(last).toBe(429);
    } finally {
      setConfig(prev);
    }
  });
});

describe('lifecycle and payments integrity', () => {
  it('rejects illegal job transitions', async () => {
    const j = await driveJob(f, t, 'REQUESTED');
    const assign = await api(t.office).post(`/jobs/${j.jobId}/assign`, { employeeId: f.users.electrician1.employeeId, scheduledStart: new Date().toISOString(), scheduledEnd: new Date(Date.now() + 3600e3).toISOString() });
    expect(assign.status).toBe(422);
    expect(assign.body.error.code).toBe('QUOTE_NOT_ACCEPTED');
    expect((await api(t.office).post(`/jobs/${j.jobId}/invoice`, { dueDate: addDays(todayIso(), 5) })).status).toBe(422);
    const q = await driveJob(f, t, 'SCHEDULED');
    expect((await api(t.electrician1).post(`/jobs/${q.jobId}/complete`, {})).status).toBe(422);
    expect((await api(t.electrician1).post(`/jobs/${q.jobId}/inspection`, { complianceStatus: 'PASS', certificateNumber: 'X-1', findings: 'Fine fine', checklist: [{ key: 'a', label: 'A', result: 'PASS' }], signatureName: 'Sam', confirmed: true })).status).toBe(422);
    expect((await api(t.customerA).post(`/jobs/${q.jobId}/cancel`, { reason: 'changed mind' })).status).toBe(422);
    // DB CHECK constraint is the last line of defence
    await expect(db().query(`UPDATE jobs SET status = 'BOGUS' WHERE id = $1`, [q.jobId])).rejects.toThrow();
  });

  it('webhook with invalid signature is rejected and duplicate events are idempotent', async () => {
    const j = await driveJob(f, t, 'INVOICED');
    const pay = await api(t.customerA).post(`/invoices/${j.invoiceId}/payments`, {}).expect(201);
    const payload = JSON.stringify({ id: 'evt-dup-1', type: 'payment.succeeded', reference: pay.body.providerReference, amount: pay.body.amount, currency: 'ZAR' });
    const bad = await request(getApp()).post(`${API}/payments/webhook/simulated`).set('Content-Type', 'application/json').set('x-hydra-signature', 'f'.repeat(64)).send(payload);
    expect(bad.status).toBe(401);
    const sig = (integrations().payments as SimulatedGateway).sign(payload);
    const send = () => request(getApp()).post(`${API}/payments/webhook/simulated`).set('Content-Type', 'application/json').set('x-hydra-signature', sig).send(payload);
    expect((await send()).body.result).toBe('SETTLED');
    expect((await send()).body.result).toBe('DUPLICATE_EVENT');
    const inv = await api(t.customerA).get(`/invoices/${j.invoiceId}`).expect(200);
    expect(inv.body.amountPaid).toBe(pay.body.amount);
    const credits = await db().query(`SELECT count(*)::int AS n FROM rewards_transactions WHERE invoice_id = $1`, [j.invoiceId]);
    expect(credits.rows[0]?.n).toBe(1);
    // Tampered amount → mismatch, not settled
    const pay2job = await driveJob(f, t, 'INVOICED');
    const pay2 = await api(t.customerA).post(`/invoices/${pay2job.invoiceId}/payments`, {}).expect(201);
    const cheap = JSON.stringify({ id: 'evt-cheap', type: 'payment.succeeded', reference: pay2.body.providerReference, amount: 1, currency: 'ZAR' });
    const r = await request(getApp()).post(`${API}/payments/webhook/simulated`).set('Content-Type', 'application/json').set('x-hydra-signature', (integrations().payments as SimulatedGateway).sign(cheap)).send(cheap);
    expect(r.body.result).toBe('AMOUNT_MISMATCH');
    expect((await api(t.customerA).get(`/invoices/${pay2job.invoiceId}`)).body.status).toBe('SENT');
  });

  it('cannot pay more than the outstanding balance', async () => {
    const j = await driveJob(f, t, 'INVOICED');
    const res = await api(t.customerA).post(`/invoices/${j.invoiceId}/payments`, { amount: 999999 });
    expect(res.status).toBe(422);
  });
});

describe('uploads', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b30000000049454e44ae426082', 'hex');

  it('accepts a real image and serves it through a signed, expiring URL', async () => {
    const res = await request(getApp()).post(`${API}/files`).set('Authorization', `Bearer ${t.customerA}`).field('purpose', 'JOB_PHOTO').attach('file', PNG, { filename: 'board.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.mimeType).toBe('image/png');
    const url = new URL(res.body.url);
    const raw = await request(getApp()).get(url.pathname + url.search);
    expect(raw.status).toBe(200);
    // Always change the first signature character (replacing it with a fixed value is a no-op 1 time in 16+).
    const tampered = await request(getApp()).get(url.pathname + url.search.replace(/sig=(.)/, (_m, c: string) => `sig=${c === '0' ? '1' : '0'}`));
    expect(tampered.status).toBe(404);
    expect((await api(t.customerB).get(`/files/${res.body.id}`)).status).toBe(404);
  });

  it('rejects files whose content does not match an allowed type', async () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
    const res = await request(getApp()).post(`${API}/files`).set('Authorization', `Bearer ${t.customerA}`).field('purpose', 'JOB_PHOTO').attach('file', exe, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(415);
    const pdfAsPhoto = await request(getApp()).post(`${API}/files`).set('Authorization', `Bearer ${t.customerA}`).field('purpose', 'COMPLIANCE_DOCUMENT').attach('file', Buffer.from('%PDF-1.4 test document'), { filename: 'coc.pdf', contentType: 'application/pdf' });
    expect(pdfAsPhoto.status).toBe(403);
  });

  it('cannot attach another user’s upload to a job', async () => {
    const up = await request(getApp()).post(`${API}/files`).set('Authorization', `Bearer ${t.customerB}`).field('purpose', 'JOB_PHOTO').attach('file', PNG, { filename: 'x.png', contentType: 'image/png' });
    const res = await api(t.customerA).post('/jobs', { serviceTypeId: f.serviceTypeId, siteAddress: '1 Test Road, Durban', description: 'Steal a photo please', contactConfirmed: true, attachmentIds: [up.body.id] });
    expect(res.status).toBe(400);
  });
});

describe('Google sign-in', () => {
  it('new Google customer must consent, then an account is created and linked', async () => {
    const tok = googleToken('g-sub-100', 'newgoogle@test.local');
    const first = await api().post('/auth/google', { idToken: tok });
    expect(first.status).toBe(428);
    const ok = await api().post('/auth/google', { idToken: tok, acceptPrivacyPolicy: true });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ role: 'CUSTOMER', hasGoogleLink: true });
    const again = await api().post('/auth/google', { idToken: tok });
    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(ok.body.user.id);
  });

  it('staff cannot sign in with an unlinked Google identity; can after linking while signed in', async () => {
    const tok = googleToken('g-sub-staff', f.users.office.email);
    expect((await api().post('/auth/google', { idToken: tok, acceptPrivacyPolicy: true })).status).toBe(403);
    await api(t.office).post('/auth/google/link', { idToken: tok }).expect(200);
    const res = await api().post('/auth/google', { idToken: tok });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ADMIN_OFFICE');
  });

  it('existing password customers must link Google rather than being taken over', async () => {
    const res = await api().post('/auth/google', { idToken: googleToken('g-sub-attacker', f.users.customerA.email), acceptPrivacyPolicy: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GOOGLE_LINK_REQUIRED');
  });

  it('forged Google tokens are rejected', async () => {
    expect((await api().post('/auth/google', { idToken: 'totally-forged-token-value-xxxxxxxxxx' })).status).toBe(401);
  });
});

describe('audit trail', () => {
  it('is append-only at the database level', async () => {
    await expect(db().query(`UPDATE audit_logs SET action = 'TAMPERED'`)).rejects.toThrow(/append-only/);
    await expect(db().query('DELETE FROM audit_logs')).rejects.toThrow(/append-only/);
  });

  it('never stores raw passwords or tokens in audit metadata', async () => {
    const { rows } = await db().query<{ m: string }>(`SELECT metadata::text AS m FROM audit_logs WHERE metadata IS NOT NULL`);
    for (const r of rows) {
      expect(r.m).not.toContain(PASSWORD);
      expect(r.m).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
    }
  });
});
