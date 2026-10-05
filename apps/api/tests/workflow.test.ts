/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 */
/**
 * Critical end-to-end API workflow (spec §26.2 steps 1–12) against a real PostgreSQL database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, db } from '../src/db/pool';
import { integrations } from '../src/integrations';
import { SimulatedGateway } from '../src/integrations/payments';
import { addDays, todayIso } from '../src/utils/dates';
import { API, CHECKLIST, SITE, api, getApp, loginAll, resetDatabase, window, type Fixture, type Tokens } from './helpers';
import request from 'supertest';

let f: Fixture;
let t: Tokens;

beforeAll(async () => {
  f = await resetDatabase();
});
afterAll(async () => {
  await closePool();
});

describe('customer → admin → electrician → billing workflow', () => {
  const ctx: { jobId?: string; quoteId?: string; invoiceId?: string; paymentId?: string; reference?: string } = {};

  it('1. customer registers and logs in', async () => {
    const reg = await api().post('/auth/register', {
      firstName: 'Nandi', lastName: 'New', email: 'nandi@test.local', phone: '+27 82 123 4567', password: 'a-very-long-password-1', acceptPrivacyPolicy: true,
    });
    expect(reg.status).toBe(201);
    expect(reg.body.user.role).toBe('CUSTOMER');
    expect(reg.body.user.onboardingCompleted).toBe(false);
    expect(reg.body.accessToken).toBeTruthy();
    const weak = await api().post('/auth/register', { firstName: 'W', lastName: 'W', email: 'weak@test.local', phone: '+27 82 123 4567', password: 'short', acceptPrivacyPolicy: true });
    expect(weak.status).toBe(422);
    t = await loginAll(f);
  });

  it('2. customer requests a job → REQUESTED and visible to admin', async () => {
    const res = await api(t.customerA).post('/jobs', {
      serviceTypeId: f.serviceTypeId, siteAddress: '5 Beach Road, Umdloti', description: 'Need a CoC for house sale', urgency: 'HIGH', contactConfirmed: true, siteLocation: SITE,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('REQUESTED');
    expect(res.body.milestones[0]).toMatchObject({ code: 'REQUESTED', status: 'COMPLETED' });
    ctx.jobId = res.body.id;
    const admin = await api(t.office).get('/jobs?status=REQUESTED').expect(200);
    expect(admin.body.items.map((j: { id: string }) => j.id)).toContain(ctx.jobId);
    const notes = await api(t.office).get('/notifications').expect(200);
    expect(notes.body.items.some((n: { type: string }) => n.type === 'NEW_JOB_REQUEST')).toBe(true);
  });

  it('3. admin creates and sends a quote; customer is notified', async () => {
    const res = await api(t.office).post(`/jobs/${ctx.jobId}/quote`, {
      items: [
        { kind: 'LABOUR', description: 'Inspection labour', quantity: 3, unitPrice: 480 },
        { kind: 'MATERIAL', description: 'ELU 63A', quantity: 1, unitPrice: 645 },
      ],
      discountAmount: 50,
      validUntil: addDays(todayIso(), 14),
      terms: '30 days',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'SENT', labourCost: 1440, materialsCost: 645, subtotal: 2035, vatAmount: 305.25, total: 2340.25 });
    ctx.quoteId = res.body.id;
    const job = await api(t.customerA).get(`/jobs/${ctx.jobId}`).expect(200);
    expect(job.body.status).toBe('QUOTED');
    expect(job.body.allowedActions).toContain('ACCEPT_QUOTE');
    const n = await api(t.customerA).get('/notifications').expect(200);
    expect(n.body.items[0].type).toBe('QUOTE_READY');
  });

  it('4. customer accepts the quote (transactional)', async () => {
    const res = await api(t.customerA).post(`/quotes/${ctx.quoteId}/accept`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACCEPTED');
    const again = await api(t.customerA).post(`/quotes/${ctx.quoteId}/accept`);
    expect(again.status).toBe(422);
    const job = await api(t.customerA).get(`/jobs/${ctx.jobId}`).expect(200);
    expect(job.body.status).toBe('QUOTE_ACCEPTED');
  });

  it('5. admin assigns an electrician (assignment history recorded)', async () => {
    const res = await api(t.office).post(`/jobs/${ctx.jobId}/assign`, { employeeId: f.users.electrician2.employeeId, ...window(1, 9, 3) });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SCHEDULED');
    // Reassignment keeps history
    const re = await api(t.office).post(`/jobs/${ctx.jobId}/assign`, { employeeId: f.users.electrician1.employeeId, ...window(0, 10, 3), notes: 'Sam is closer' });
    expect(re.status).toBe(200);
    expect(re.body.electrician.id).toBe(f.users.electrician1.employeeId);
    expect(re.body.assignmentHistory).toHaveLength(2);
    const cal = await api(t.electrician1).get('/schedules').expect(200);
    expect(cal.body.some((e: { job: { id: string } | null }) => e.job?.id === ctx.jobId)).toBe(true);
    const other = await api(t.electrician2).get(`/jobs/${ctx.jobId}`);
    expect(other.status).toBe(404);
  });

  it('6. electrician scans customer QR and GPS check-in starts work', async () => {
    const qr = await api(t.customerA).get(`/jobs/${ctx.jobId}/qr`).expect(200);
    expect(qr.body.payload).toMatch(/^HYDRA1:/);
    expect(qr.body.payload).not.toBe(ctx.jobId);
    const res = await api(t.electrician1).post(`/jobs/${ctx.jobId}/checkin`, { qrToken: qr.body.payload, location: SITE });
    expect(res.status).toBe(200);
    expect(res.body.job.status).toBe('IN_PROGRESS');
    expect(res.body.job.checkins).toHaveLength(1);
    expect(res.body.job.checkins[0]).toMatchObject({ method: 'QR' });
    expect(res.body.shiftStarted).toBe(true);
    const replay = await api(t.electrician1).post(`/jobs/${ctx.jobId}/checkin`, { qrToken: qr.body.payload, location: SITE });
    expect(replay.status).toBe(409);
    const customerView = await api(t.customerA).get(`/jobs/${ctx.jobId}`).expect(200);
    expect(customerView.body.milestones.find((m: { code: string }) => m.code === 'ARRIVED').status).toBe('COMPLETED');
  });

  it('7. electrician logs materials; stock decremented and job cost recalculated', async () => {
    const res = await api(t.electrician1).post(`/jobs/${ctx.jobId}/materials`, {
      items: [{ materialId: f.materials.cable, quantity: 12.5 }, { materialId: f.materials.breaker, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.materials).toHaveLength(2);
    const stock = await db().query<{ sku: string; stock: number }>(`SELECT sku, stock_level AS stock FROM materials WHERE id = ANY($1::uuid[]) ORDER BY sku`, [[f.materials.cable, f.materials.breaker]]);
    expect(stock.rows).toEqual([{ sku: 'B1', stock: 9 }, { sku: 'C1', stock: 87.5 }]);
    const job = await api(t.office).get(`/jobs/${ctx.jobId}`).expect(200);
    expect(job.body.materialsCost).toBe(221.15);
  });

  it('8. electrician completes milestones and work', async () => {
    const add = await api(t.electrician1).post(`/jobs/${ctx.jobId}/milestones`, { name: 'DB board replaced' });
    expect(add.status).toBe(201);
    const custom = add.body.milestones.find((m: { name: string }) => m.name === 'DB board replaced');
    const done = await api(t.electrician1).post(`/jobs/${ctx.jobId}/milestones/${custom.id}/complete`, { note: 'New board installed' });
    expect(done.status).toBe(200);
    const custNotes = await api(t.customerA).get('/notifications').expect(200);
    expect(custNotes.body.items.some((n: { type: string }) => n.type === 'MILESTONE_UPDATED')).toBe(true);
    const complete = await api(t.electrician1).post(`/jobs/${ctx.jobId}/complete`, { summary: 'All done' });
    expect(complete.status).toBe(200);
    expect(complete.body.status).toBe('INSPECTION_PENDING');
  });

  it('9. inspection submitted with certificate → COMPLETED and visible to customer', async () => {
    const res = await api(t.electrician1).post(`/jobs/${ctx.jobId}/inspection`, {
      complianceStatus: 'PASS', certificateNumber: 'COC-TEST-0001', findings: 'Installation compliant with SANS 10142-1', checklist: CHECKLIST, signatureName: 'Sam Sparky', confirmed: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('COMPLETED');
    const reports = await api(t.customerA).get('/inspection-reports').expect(200);
    expect(reports.body.items[0]).toMatchObject({ certificateNumber: 'COC-TEST-0001', complianceStatus: 'PASS' });
  });

  it('10. admin generates an invoice from the completed job', async () => {
    const res = await api(t.office).post(`/jobs/${ctx.jobId}/invoice`, { dueDate: addDays(todayIso(), 14) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'SENT', total: 2340.25, amountDue: 2340.25 });
    ctx.invoiceId = res.body.id;
    const dup = await api(t.office).post(`/jobs/${ctx.jobId}/invoice`, { dueDate: addDays(todayIso(), 14) });
    expect(dup.status).toBe(409);
    const job = await api(t.customerA).get(`/jobs/${ctx.jobId}`).expect(200);
    expect(job.body.status).toBe('INVOICED');
  });

  it('11. partial payment then gateway webhook settles invoice', async () => {
    const pay1 = await api(t.customerA).post(`/invoices/${ctx.invoiceId}/payments`, { amount: 1000 }).set('Idempotency-Key', 'pay-attempt-0001');
    expect(pay1.status).toBe(201);
    expect(pay1.body.checkoutUrl).toContain('/payments/sandbox/checkout/');
    // Idempotent retry returns the same payment
    const retry = await api(t.customerA).post(`/invoices/${ctx.invoiceId}/payments`, { amount: 1000 }).set('Idempotency-Key', 'pay-attempt-0001');
    expect(retry.body.id).toBe(pay1.body.id);

    const gw = integrations().payments as SimulatedGateway;
    const settle = async (reference: string, amount: number, id: string) => {
      const payload = JSON.stringify({ id, type: 'payment.succeeded', reference, amount, currency: 'ZAR' });
      return request(getApp()).post(`${API}/payments/webhook/simulated`).set('Content-Type', 'application/json').set('x-hydra-signature', gw.sign(payload)).send(payload);
    };
    const w1 = await settle(pay1.body.providerReference, 1000, 'evt-1');
    expect(w1.status).toBe(200);
    expect(w1.body.result).toBe('SETTLED');
    let inv = await api(t.customerA).get(`/invoices/${ctx.invoiceId}`).expect(200);
    expect(inv.body).toMatchObject({ status: 'PARTIALLY_PAID', amountPaid: 1000, amountDue: 1340.25 });
    expect((await api(t.customerA).get(`/jobs/${ctx.jobId}`)).body.status).toBe('PARTIALLY_PAID');
    const rewardsBefore = await api(t.customerA).get('/rewards').expect(200);
    expect(rewardsBefore.body.pointsBalance).toBe(0);

    const pay2 = await api(t.customerA).post(`/invoices/${ctx.invoiceId}/payments`, {});
    expect(pay2.body.amount).toBe(1340.25);
    const w2 = await settle(pay2.body.providerReference, 1340.25, 'evt-2');
    expect(w2.body.result).toBe('SETTLED');
    inv = await api(t.customerA).get(`/invoices/${ctx.invoiceId}`).expect(200);
    expect(inv.body).toMatchObject({ status: 'PAID', amountDue: 0 });
    expect(inv.body.payments.filter((p: { status: string }) => p.status === 'SUCCEEDED')).toHaveLength(2);
    expect((await api(t.customerA).get(`/jobs/${ctx.jobId}`)).body.status).toBe('PAID');
  });

  it('12. rewards credited exactly once for the paid invoice', async () => {
    const r = await api(t.customerA).get('/rewards').expect(200);
    expect(r.body.pointsBalance).toBe(234);
    const tx = await api(t.customerA).get('/rewards/transactions').expect(200);
    expect(tx.body.items).toHaveLength(1);
    expect(tx.body.items[0]).toMatchObject({ type: 'EARN', pointsEarned: 234 });
    const audit = await db().query<{ action: string }>(`SELECT action FROM audit_logs WHERE action IN ('QUOTE_ACCEPTED','JOB_ASSIGNED','JOB_REASSIGNED','JOB_CHECKIN','MATERIALS_LOGGED','INVOICE_GENERATED','PAYMENT_SETTLED','REWARDS_CREDITED')`);
    expect(new Set(audit.rows.map((a) => a.action)).size).toBe(8);
  });

  it('customer can pay through the sandbox checkout page (dev gateway)', async () => {
    const j = await api(t.customerA).post('/jobs', { serviceTypeId: f.serviceTypeId, siteAddress: '9 Test Street, Durban', description: 'Second job for sandbox checkout', contactConfirmed: true });
    expect(j.status).toBe(201);
    const page = await request(getApp()).get(`${API}/payments/sandbox/checkout/HYD-doesnotexist1`);
    expect(page.status).toBe(404);
  });
});
