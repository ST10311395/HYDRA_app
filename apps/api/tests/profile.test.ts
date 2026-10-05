/**
 * Self-service profile / account tests for every role (physical-phone review: edits appeared to
 * save but did not persist). Every assertion re-reads through a fresh API call or a fresh login.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, db } from '../src/db/pool';
import { PostgresUserRepository } from '../src/repositories/userRepository';
import { API, PASSWORD, SITE, api, driveJob, getApp, googleToken, login, loginAll, resetDatabase, type Fixture, type Tokens } from './helpers';
import request from 'supertest';

let f: Fixture;
let t: Tokens;

beforeAll(async () => {
  f = await resetDatabase();
  t = await loginAll(f);
});
afterAll(async () => {
  await closePool();
});

const ROLES = [
  ['customer', 'customerA'],
  ['employee', 'electrician1'],
  ['office admin', 'office'],
  ['owner', 'owner'],
] as const;

describe('self-profile editing persists for every role', () => {
  it.each(ROLES)('%s: PATCH /profile persists name and phone (fresh GET and fresh login)', async (_label, who) => {
    const before = await api(t[who]).get('/profile').expect(200);
    const res = await api(t[who]).patch('/profile', { firstName: `  Renamed${who} `, lastName: 'Persisted', phone: '+27 82 123 4567' }).expect(200);
    expect(res.body).toMatchObject({ firstName: `Renamed${who}`, lastName: 'Persisted', phone: '+27 82 123 4567' });

    const after = await api(t[who]).get('/profile').expect(200);
    expect(after.body).toMatchObject({ firstName: `Renamed${who}`, lastName: 'Persisted', phone: '+27 82 123 4567' });
    // System-controlled fields are untouched.
    for (const k of ['id', 'email', 'role', 'staffNumber', 'customerId', 'employeeId', 'adminId'] as const) expect(after.body[k]).toEqual(before.body[k]);

    const relogin = await request(getApp()).post(`${API}/auth/login`).send({ identifier: f.users[who].email, password: PASSWORD }).expect(200);
    expect(relogin.body.user).toMatchObject({ firstName: `Renamed${who}`, lastName: 'Persisted', phone: '+27 82 123 4567' });
  });

  it.each(ROLES)('%s: partial update changes only the sent field', async (_label, who) => {
    const before = (await api(t[who]).get('/profile').expect(200)).body;
    await api(t[who]).patch('/profile', { lastName: 'OnlyLast' }).expect(200);
    const after = (await api(t[who]).get('/profile').expect(200)).body;
    expect(after).toMatchObject({ firstName: before.firstName, phone: before.phone, lastName: 'OnlyLast' });
  });

  it('customer: address and marketing consent persist; empty address clears it; consent is recorded', async () => {
    await api(t.customerA).patch('/profile', { address: '12 New Street, Durban', marketingOptIn: true }).expect(200);
    let p = (await api(t.customerA).get('/profile').expect(200)).body;
    expect(p).toMatchObject({ address: '12 New Street, Durban', marketingOptIn: true });
    // A name-only save must not reset consent (previous client always sent `false`).
    await api(t.customerA).patch('/profile', { firstName: 'Alice' }).expect(200);
    p = (await api(t.customerA).get('/profile').expect(200)).body;
    expect(p.marketingOptIn).toBe(true);
    await api(t.customerA).patch('/profile', { address: '', marketingOptIn: false }).expect(200);
    p = (await api(t.customerA).get('/profile').expect(200)).body;
    expect(p).toMatchObject({ address: null, marketingOptIn: false });
    const consents = await db().query('SELECT granted FROM consents WHERE user_id = $1 AND consent_type = $2 ORDER BY created_at', [f.users.customerA.id, 'MARKETING']);
    expect(consents.rows.map((r) => r.granted)).toEqual([true, false]);
  });

  it('profile edits never touch rewards, jobs or invoices', async () => {
    const job = await driveJob(f, t, 'QUOTED', { customer: 'customerB' });
    const rewardsBefore = await db().query('SELECT points_balance FROM rewards_accounts WHERE customer_id = $1', [f.users.customerB.customerId]);
    await api(t.customerB).patch('/profile', { firstName: 'Bobby', address: '9 Other Road' }).expect(200);
    const j = await api(t.customerB).get(`/jobs/${job.jobId}`).expect(200);
    expect(j.body.siteAddress).toBe('1 Test Road, Durban');
    const rewardsAfter = await db().query('SELECT points_balance FROM rewards_accounts WHERE customer_id = $1', [f.users.customerB.customerId]);
    expect(rewardsAfter.rows).toEqual(rewardsBefore.rows);
  });
});

describe('self-profile validation and authorisation', () => {
  it('rejects privileged / system-controlled fields instead of silently dropping them', async () => {
    for (const body of [{ role: 'ADMIN_OWNER' }, { email: 'new@test.local' }, { staffNumber: 'PSG-A-9999' }, { customerId: f.users.customerB.customerId }, { hourlyRate: 999 }, { pointsBalance: 1e6 }, { status: 'ACTIVE' }]) {
      const res = await api(t.office).patch('/profile', { firstName: 'Olive', ...body });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
    const me = (await api(t.office).get('/profile').expect(200)).body;
    expect(me).toMatchObject({ role: 'ADMIN_OFFICE', email: f.users.office.email });
  });

  it('customer-only fields are rejected for staff with a field error', async () => {
    for (const who of ['electrician1', 'office', 'owner'] as const) {
      const res = await api(t[who]).patch('/profile', { address: '1 Somewhere' });
      expect(res.status).toBe(422);
      expect(res.body.error.details).toEqual([{ path: 'address', message: expect.any(String) }]);
      const mk = await api(t[who]).patch('/profile', { marketingOptIn: true });
      expect(mk.status).toBe(422);
    }
  });

  it('invalid values return field errors and change nothing', async () => {
    const before = (await api(t.customerA).get('/profile').expect(200)).body;
    const bad = await api(t.customerA).patch('/profile', { firstName: '   ', phone: 'call me', lastName: 'Valid' });
    expect(bad.status).toBe(422);
    const paths = (bad.body.error.details as { path: string }[]).map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['firstName', 'phone']));
    const after = (await api(t.customerA).get('/profile').expect(200)).body;
    expect(after).toEqual(before);
  });

  it('requires authentication, and a token only ever edits its own profile', async () => {
    await api().patch('/profile', { firstName: 'Anon' }).expect(401);
    const bBefore = (await api(t.customerB).get('/profile').expect(200)).body;
    // There is no user id in the path; extra id fields are rejected.
    await api(t.customerA).patch('/profile', { id: f.users.customerB.id, firstName: 'Hacked' }).expect(422);
    await api(t.customerA).patch('/profile', { firstName: 'AliceAgain' }).expect(200);
    expect((await api(t.customerB).get('/profile').expect(200)).body).toEqual(bBefore);
  });

  it('a user with no profile row gets an error, not a false success', async () => {
    const users = new PostgresUserRepository(db());
    const id = await users.create({ email: 'orphan@test.local', passwordHash: (await db().query<{ h: string }>('SELECT password_hash AS h FROM users WHERE id = $1', [f.users.office.id])).rows[0]!.h, role: 'ADMIN_OFFICE', staffNumber: 'PSG-A-0900' });
    const { token } = await login('orphan@test.local');
    const res = await api(token).patch('/profile', { firstName: 'Ghost' });
    expect(res.status).toBe(404);
    await db().query('DELETE FROM users WHERE id = $1', [id]);
  });
});

describe('password change', () => {
  it('rejects a wrong current password, a weak password and reuse of the current password', async () => {
    const wrong = await api(t.electrician2).post('/auth/change-password', { currentPassword: 'not-my-password', newPassword: 'a-brand-new-passphrase' });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    const weak = await api(t.electrician2).post('/auth/change-password', { currentPassword: PASSWORD, newPassword: 'short' });
    expect(weak.status).toBe(422);
    const same = await api(t.electrician2).post('/auth/change-password', { currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same.status).toBe(422);
    expect(same.body.error.details[0].path).toBe('newPassword');
  });

  it('changes the bcrypt hash, revokes every session and the new password signs in', async () => {
    const { refreshToken } = await login(f.users.electrician2.email);
    const fresh = await login(f.users.electrician2.email);
    const newPassword = 'another-long-passphrase-2026';
    await api(fresh.token).post('/auth/change-password', { currentPassword: PASSWORD, newPassword }).expect(200);
    const row = await db().query<{ h: string }>('SELECT password_hash AS h FROM users WHERE id = $1', [f.users.electrician2.id]);
    expect(row.rows[0]!.h).toMatch(/^\$2[aby]\$/);
    expect(row.rows[0]!.h).not.toContain(newPassword);
    await request(getApp()).post(`${API}/auth/refresh`).send({ refreshToken }).expect(401);
    await api(fresh.token).get('/profile').expect(401);
    await request(getApp()).post(`${API}/auth/login`).send({ identifier: f.users.electrician2.email, password: PASSWORD }).expect(401);
    await login(f.users.electrician2.email, newPassword);
  });

  it('Google-only accounts cannot set a password from a session (reset email instead) and report hasPassword=false', async () => {
    const g = await request(getApp()).post(`${API}/auth/google`).send({ idToken: googleToken('sub-profile-1', 'gugu@test.local'), acceptPrivacyPolicy: true, phone: '+27 82 000 0099' });
    expect(g.status).toBe(200);
    expect(g.body.user.hasPassword).toBe(false);
    const res = await api(g.body.accessToken).post('/auth/change-password', { currentPassword: 'anything', newPassword: 'a-brand-new-passphrase' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NO_LOCAL_PASSWORD');
    const me = (await api(t.customerA).get('/profile').expect(200)).body;
    expect(me.hasPassword).toBe(true);
  });
});

describe('arrival QR tokens', () => {
  it('rotation invalidates the previous token; the current one still checks in', async () => {
    const j = await driveJob(f, t, 'SCHEDULED');
    const first = await api(t.customerA).get(`/jobs/${j.jobId}/qr`).expect(200);
    const second = await api(t.customerA).get(`/jobs/${j.jobId}/qr`).expect(200);
    expect(second.body.token).not.toBe(first.body.token);
    const stale = await api(t.electrician1).post(`/jobs/${j.jobId}/checkin`, { qrToken: first.body.payload, location: SITE });
    expect(stale.status).toBe(422);
    expect(stale.body.error.code).toBe('QR_EXPIRED');
    await api(t.electrician1).post(`/jobs/${j.jobId}/checkin`, { qrToken: second.body.payload, location: SITE }).expect(200);
  });

  it('tokens are opaque, stored only as hashes, and a raw job id is not a valid code', async () => {
    const j = await driveJob(f, t, 'SCHEDULED');
    const qr = await api(t.customerA).get(`/jobs/${j.jobId}/qr`).expect(200);
    expect(qr.body.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(qr.body.token).not.toContain(j.jobId);
    const stored = await db().query<{ h: string }>('SELECT token_hash AS h FROM job_qr_tokens WHERE job_id = $1', [j.jobId]);
    expect(stored.rows.map((r) => r.h)).not.toContain(qr.body.token);
    const raw = await api(t.electrician1).post(`/jobs/${j.jobId}/checkin`, { qrToken: j.jobId, location: SITE });
    expect(raw.status).toBe(422);
    expect(raw.body.error.code).toBe('QR_INVALID');
  });

  it('only the owning customer can mint a code: other customers 404, staff 403', async () => {
    const j = await driveJob(f, t, 'SCHEDULED');
    await api(t.customerB).get(`/jobs/${j.jobId}/qr`).expect(404);
    for (const who of ['electrician1', 'office', 'owner'] as const) await api(t[who]).get(`/jobs/${j.jobId}/qr`).expect(403);
  });
});
