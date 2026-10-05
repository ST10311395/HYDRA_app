/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import {
  formatZar,
  pointsForAmount,
  roundMoney,
  sumMoney,
  tierForLifetimePoints,
  type GenerateInvoiceInput,
  type InvoiceDto,
  type InvoiceStatus,
  type PaymentDto,
  type PaymentMethod,
} from '@hydra/shared';
import { config } from '../config/env';
import { db, type Queryable } from '../db/pool';
import { integrations } from '../integrations';
import type { PaymentEvent } from '../integrations/payments';
import { PostgresBillingRepository, type InvoiceRow } from '../repositories/billingRepository';
import { PostgresJobRepository } from '../repositories/jobRepository';
import { PostgresQuoteRepository } from '../repositories/quoteRepository';
import { PostgresRewardsRepository } from '../repositories/rewardsRepository';
import { PostgresSettingsRepository } from '../repositories/settingsRepository';
import type { AuthContext } from '../types/express';
import { randomToken, sha256 } from '../utils/crypto';
import { todayIso } from '../utils/dates';
import { businessRule, conflict, notFound, validationError } from '../utils/errors';
import { paginated } from '../utils/pagination';
import { assertJobAccess, isAdminRole } from './accessControl';
import { audit, SYSTEM_ACTOR, type Actor } from './auditService';
import { transactional, type EventCollector } from './events';
import { transitionJob } from './jobLifecycle';

const PAYABLE: InvoiceStatus[] = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'];

async function invoiceDto(q: Queryable, id: string): Promise<InvoiceDto> {
  const repo = new PostgresBillingRepository(q);
  const [inv, payments] = await Promise.all([repo.invoiceDto(id), repo.paymentsForInvoice(id)]);
  if (!inv) throw notFound('Invoice');
  return { ...inv, payments };
}

function assertInvoiceAccess(auth: AuthContext, inv: InvoiceRow | null): InvoiceRow {
  if (!inv) throw notFound('Invoice');
  if (isAdminRole(auth)) return inv;
  if (auth.role === 'CUSTOMER' && inv.customerId === auth.customerId && inv.status !== 'DRAFT') return inv;
  throw notFound('Invoice');
}

/** PDF Story 11: only COMPLETED (inspection-passed) jobs with an accepted quote can be invoiced. */
export async function generateInvoice(auth: AuthContext, jobId: string, input: GenerateInvoiceInput, actor: Actor): Promise<InvoiceDto> {
  if (input.dueDate < todayIso()) throw businessRule('Due date cannot be in the past', 'INVALID_DUE_DATE');
  const id = await transactional(async (tx, events) => {
    const jobs = new PostgresJobRepository(tx);
    const billing = new PostgresBillingRepository(tx);
    const job = assertJobAccess(auth, await jobs.findById(jobId, true));
    if (await billing.findInvoiceByJob(jobId)) throw conflict('An invoice already exists for this job', 'INVOICE_EXISTS');
    if (job.status !== 'COMPLETED') {
      throw businessRule('An invoice can only be generated once the job is completed and has passed inspection', 'JOB_NOT_COMPLETED');
    }
    const quoteRow = await new PostgresQuoteRepository(tx).acceptedForJob(jobId);
    if (!quoteRow) throw businessRule('The job has no accepted quote', 'NO_ACCEPTED_QUOTE');
    const quote = (await new PostgresQuoteRepository(tx).dto(quoteRow.id))!;
    const settings = await new PostgresSettingsRepository(tx).getAll();
    const includeVariance = input.includeMaterialVariance || settings.invoiceIncludeMaterialVariance;
    const variance = includeVariance ? roundMoney(job.materialsCost - quote.materialsCost) : 0;
    const taxable = Math.max(0, sumMoney([quote.subtotal, variance]));
    const vat = roundMoney(taxable * quote.vatRate);
    const total = sumMoney([taxable, vat]);
    const items = quote.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal }));
    if (quote.discountAmount > 0) items.push({ description: 'Quoted discount', quantity: 1, unitPrice: -quote.discountAmount, lineTotal: -quote.discountAmount });
    if (variance !== 0) {
      items.push({ description: variance > 0 ? 'Additional materials used on site' : 'Materials credit (less used than quoted)', quantity: 1, unitPrice: variance, lineTotal: variance });
    }
    const invoiceId = await billing.createInvoice({
      jobId,
      quoteId: quote.id,
      customerId: job.customerId,
      subtotal: quote.subtotal,
      materialsAdjustment: variance,
      vatAmount: vat,
      total,
      dueDate: input.dueDate,
      notes: input.notes,
      createdBy: auth.userId,
      items,
    });
    if (input.send) await issueInvoice(tx, events, invoiceId, actor);
    await audit(tx, actor, 'INVOICE_GENERATED', 'invoice', invoiceId, { jobId, total, variance, sent: input.send });
    return invoiceId;
  });
  return invoiceDto(db(), id);
}

async function issueInvoice(tx: Queryable, events: EventCollector, invoiceId: string, actor: Actor): Promise<void> {
  const billing = new PostgresBillingRepository(tx);
  const inv = await billing.findInvoice(invoiceId, true);
  if (!inv) throw notFound('Invoice');
  if (inv.status !== 'DRAFT') throw businessRule('Only draft invoices can be sent', 'INVOICE_NOT_DRAFT');
  const job = (await new PostgresJobRepository(tx).findById(inv.jobId, true))!;
  await billing.setInvoiceStatus(invoiceId, 'SENT', { sent: true });
  await transitionJob(tx, events, job, 'ISSUE_INVOICE', actor);
  await events.notify([inv.customerUserId], {
    type: 'INVOICE_ISSUED',
    title: `Invoice ${inv.number} issued`,
    body: `${formatZar(inv.total)} due by ${inv.dueDate} for ${job.reference}.`,
    data: { invoiceId, jobId: job.id },
  });
  events.emit(`user:${inv.customerUserId}`, 'invoice.updated', { invoiceId, status: 'SENT' });
}

export async function sendInvoice(auth: AuthContext, invoiceId: string, actor: Actor): Promise<InvoiceDto> {
  await transactional(async (tx, events) => {
    await issueInvoice(tx, events, invoiceId, actor);
    await audit(tx, actor, 'INVOICE_SENT', 'invoice', invoiceId);
  });
  return invoiceDto(db(), invoiceId);
}

export async function deleteDraftInvoice(invoiceId: string, actor: Actor): Promise<void> {
  await transactional(async (tx) => {
    const inv = await new PostgresBillingRepository(tx).findInvoice(invoiceId, true);
    if (!inv) throw notFound('Invoice');
    if (inv.status !== 'DRAFT') throw businessRule('Only draft invoices can be deleted', 'INVOICE_NOT_DRAFT');
    await tx.query('DELETE FROM invoices WHERE id = $1', [invoiceId]);
    await audit(tx, actor, 'INVOICE_DRAFT_DELETED', 'invoice', invoiceId, { jobId: inv.jobId });
  });
}

export async function getInvoice(auth: AuthContext, id: string): Promise<InvoiceDto> {
  assertInvoiceAccess(auth, await new PostgresBillingRepository(db()).findInvoice(id));
  return invoiceDto(db(), id);
}

export async function listInvoices(auth: AuthContext, f: { status?: InvoiceStatus; customerId?: string; search?: string; page: number; pageSize: number }) {
  if (auth.role === 'EMPLOYEE') throw notFound('Invoice');
  const repo = new PostgresBillingRepository(db());
  const customerId = isAdminRole(auth) ? f.customerId : (auth.customerId ?? undefined);
  const { items, total } = await repo.listInvoices({ customerId, status: f.status, search: f.search, limit: f.pageSize, offset: (f.page - 1) * f.pageSize });
  const withPayments = await Promise.all(items.map(async (i) => ({ ...i, payments: await repo.paymentsForInvoice(i.id) })));
  return paginated(withPayments, f.page, f.pageSize, total);
}

export async function listPayments(auth: AuthContext, page: number, pageSize: number) {
  if (auth.role === 'EMPLOYEE') throw notFound('Payment');
  const customerId = isAdminRole(auth) ? undefined : (auth.customerId ?? undefined);
  const { items, total } = await new PostgresBillingRepository(db()).listPayments({ customerId, limit: pageSize, offset: (page - 1) * pageSize });
  return paginated(items, page, pageSize, total);
}

/**
 * Customer starts a (partial) payment. A PENDING payment is created, then the gateway hosted checkout
 * session. Retries with the same Idempotency-Key return the same payment instead of duplicating it.
 */
export async function startPayment(auth: AuthContext, invoiceId: string, amount: number | undefined, idempotencyKey: string | undefined, actor: Actor): Promise<PaymentDto> {
  const scopedKey = idempotencyKey ? `${auth.userId}:${idempotencyKey}`.slice(0, 100) : null;
  const created = await transactional(async (tx) => {
    const billing = new PostgresBillingRepository(tx);
    if (scopedKey) {
      const existing = await billing.findPaymentByIdempotency(scopedKey);
      if (existing) return { id: existing.id, reused: true, reference: existing.providerReference!, amount: existing.amount, email: '' };
    }
    const inv = assertInvoiceAccess(auth, await billing.findInvoice(invoiceId, true));
    if (auth.role !== 'CUSTOMER') throw notFound('Invoice');
    if (!PAYABLE.includes(inv.status) || inv.amountDue <= 0) throw businessRule('This invoice has no outstanding balance', 'INVOICE_NOT_PAYABLE');
    const payAmount = roundMoney(amount ?? inv.amountDue);
    if (payAmount > inv.amountDue) {
      throw validationError([{ path: 'amount', message: `Amount exceeds the outstanding balance of ${formatZar(inv.amountDue)}` }]);
    }
    const gateway = integrations().payments;
    const reference = `HYD-${randomToken(9).replace(/[^A-Za-z0-9]/g, 'x')}`;
    const id = await billing.createPayment({
      invoiceId,
      amount: payAmount,
      currency: config().PAYMENT_CURRENCY,
      method: 'CARD',
      provider: gateway.name,
      providerReference: reference,
      idempotencyKey: scopedKey,
      initiatedBy: auth.userId,
    });
    await audit(tx, actor, 'PAYMENT_INITIATED', 'payment', id, { invoiceId, amount: payAmount, provider: gateway.name });
    return { id, reused: false, reference, amount: payAmount, email: inv.customerEmail };
  });
  if (!created.reused) {
    const billing = new PostgresBillingRepository(db());
    try {
      const session = await integrations().payments.createCheckout({
        reference: created.reference,
        amount: created.amount,
        currency: config().PAYMENT_CURRENCY,
        email: created.email,
        callbackUrl: config().PAYMENT_CALLBACK_URL,
        metadata: { paymentId: created.id, invoiceId },
      });
      await billing.setCheckoutUrl(created.id, session.checkoutUrl);
    } catch (err) {
      await billing.settlePayment(created.id, 'CANCELLED', null, 'Checkout could not be started');
      throw err;
    }
  }
  return (await new PostgresBillingRepository(db()).paymentDto(created.id))!;
}

async function creditRewards(tx: Queryable, events: EventCollector, inv: InvoiceRow, customerUserId: string): Promise<void> {
  const settings = await new PostgresSettingsRepository(tx).getAll();
  const cashPaid = roundMoney(inv.total - inv.discountTotal);
  const points = pointsForAmount(cashPaid, settings.rewardsRandPerPoint);
  if (points <= 0) return;
  const rewards = new PostgresRewardsRepository(tx);
  const account = await rewards.account(inv.customerId, true);
  if (!account) return;
  const tier = tierForLifetimePoints(account.lifetimePoints + points);
  const credited = await rewards.credit(account.id, points, tier, {
    type: 'EARN',
    jobId: inv.jobId,
    invoiceId: inv.id,
    description: `Earned on paid invoice ${inv.number}`,
  });
  if (!credited) return;
  await events.notify([customerUserId], {
    type: 'REWARDS_CREDITED',
    title: `+${points} reward points`,
    body: `Thanks for settling ${inv.number}. Your balance is now ${account.pointsBalance + points} points.`,
    data: { route: '/rewards' },
  });
  await audit(tx, SYSTEM_ACTOR, 'REWARDS_CREDITED', 'rewards_account', account.id, { invoiceId: inv.id, points });
}

/**
 * Applies a settled amount to the invoice atomically (spec rule 14/15): partial payments move the
 * invoice to PARTIALLY_PAID (or keep OVERDUE); only a zero balance marks it PAID and credits rewards.
 */
export async function applySettlement(tx: Queryable, events: EventCollector, invoiceId: string, amount: number, actor: Actor): Promise<{ status: InvoiceStatus; applied: number; excess: number }> {
  const billing = new PostgresBillingRepository(tx);
  const inv = await billing.findInvoice(invoiceId, true);
  if (!inv) throw notFound('Invoice');
  if (!PAYABLE.includes(inv.status)) {
    await events.notifyAdmins({ type: 'PAYMENT_RECEIVED', title: `Refund review: ${inv.number}`, body: `${formatZar(amount)} received on a ${inv.status} invoice.`, data: { invoiceId } });
    await audit(tx, actor, 'PAYMENT_EXCESS_REQUIRES_REFUND', 'invoice', invoiceId, { amount, status: inv.status });
    return { status: inv.status, applied: 0, excess: amount };
  }
  const applied = Math.min(roundMoney(amount), inv.amountDue);
  const excess = roundMoney(amount - applied);
  await billing.addPaymentToInvoice(invoiceId, applied);
  const remaining = roundMoney(inv.amountDue - applied);
  const job = (await new PostgresJobRepository(tx).findById(inv.jobId, true))!;
  let status: InvoiceStatus;
  if (remaining <= 0) {
    status = 'PAID';
    await billing.setInvoiceStatus(invoiceId, 'PAID', { paid: true });
    if (['INVOICED', 'PARTIALLY_PAID'].includes(job.status)) await transitionJob(tx, events, job, 'FULL_PAYMENT', actor);
    await creditRewards(tx, events, { ...inv, amountPaid: inv.amountPaid + applied }, inv.customerUserId);
  } else {
    status = inv.dueDate < todayIso() ? 'OVERDUE' : 'PARTIALLY_PAID';
    await billing.setInvoiceStatus(invoiceId, status);
    if (['INVOICED', 'PARTIALLY_PAID'].includes(job.status)) await transitionJob(tx, events, job, 'PARTIAL_PAYMENT', actor);
  }
  await events.notify([inv.customerUserId], {
    type: 'PAYMENT_CONFIRMED',
    title: `Payment received · ${inv.number}`,
    body: remaining <= 0 ? `${formatZar(applied)} received — invoice settled in full.` : `${formatZar(applied)} received. Outstanding: ${formatZar(remaining)}.`,
    data: { invoiceId },
  });
  await events.notifyAdmins({ type: 'PAYMENT_RECEIVED', title: `Payment · ${inv.number}`, body: `${formatZar(applied)} (${status})`, data: { invoiceId } });
  if (excess > 0) {
    await events.notifyAdmins({ type: 'PAYMENT_RECEIVED', title: `Overpayment · ${inv.number}`, body: `${formatZar(excess)} requires a refund.`, data: { invoiceId } });
    await audit(tx, actor, 'PAYMENT_EXCESS_REQUIRES_REFUND', 'invoice', invoiceId, { excess });
  }
  events.emit(`user:${inv.customerUserId}`, 'invoice.updated', { invoiceId, status });
  events.emit(`user:${inv.customerUserId}`, 'payment.confirmed', { invoiceId, amount: applied });
  events.emit('admins', 'invoice.updated', { invoiceId, status });
  return { status, applied, excess };
}

/** Gateway webhook: signature verified, event recorded once (idempotent), payment + invoice updated atomically. */
export async function handlePaymentWebhook(provider: string, rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<{ result: string }> {
  const gateway = integrations().payments;
  if (gateway.name !== provider) throw notFound('Webhook endpoint');
  const evt: PaymentEvent = gateway.parseWebhook(rawBody, headers);
  return transactional(async (tx, events) => {
    const billing = new PostgresBillingRepository(tx);
    const first = await billing.recordWebhookEvent(provider, evt.eventId, evt.eventType, sha256(rawBody));
    if (!first) return { result: 'DUPLICATE_EVENT' };
    const actor: Actor = { ...SYSTEM_ACTOR, role: `WEBHOOK:${provider}` };
    const done = async (result: string) => {
      await billing.setWebhookResult(provider, evt.eventId, result);
      await audit(tx, actor, 'PAYMENT_WEBHOOK_PROCESSED', 'payment_webhook', evt.eventId, { result, type: evt.eventType, reference: evt.providerReference });
      return { result };
    };
    if (evt.type === 'ignored' || !evt.providerReference) return done('IGNORED');
    const payment = await billing.findPaymentByReference(provider, evt.providerReference);
    if (!payment) return done('UNKNOWN_REFERENCE');
    if (payment.status === 'SUCCEEDED') return done('ALREADY_SETTLED');
    if (evt.type === 'payment.failed') {
      await billing.settlePayment(payment.id, 'FAILED', null, evt.failureReason);
      const inv = (await billing.findInvoice(payment.invoiceId))!;
      await events.notify([inv.customerUserId], {
        type: 'SYSTEM',
        title: 'Payment not completed',
        body: `Your payment for ${inv.number} was not successful${evt.failureReason ? ` (${evt.failureReason})` : ''}. You can try again.`,
        data: { invoiceId: inv.id },
      });
      return done('PAYMENT_FAILED');
    }
    if (evt.amount === null || Math.abs(evt.amount - payment.amount) > 0.005 || (evt.currency && evt.currency !== payment.currency)) {
      await billing.settlePayment(payment.id, 'FAILED', null, 'Amount/currency mismatch — manual review');
      await events.notifyAdmins({ type: 'PAYMENT_RECEIVED', title: 'Payment mismatch', body: `Reference ${evt.providerReference} requires manual review.`, data: { paymentId: payment.id } });
      return done('AMOUNT_MISMATCH');
    }
    await billing.settlePayment(payment.id, 'SUCCEEDED', evt.paidAt ?? new Date());
    const settled = await applySettlement(tx, events, payment.invoiceId, payment.amount, actor);
    await audit(tx, actor, 'PAYMENT_SETTLED', 'payment', payment.id, { invoiceId: payment.invoiceId, amount: payment.amount, invoiceStatus: settled.status });
    return done('SETTLED');
  });
}

/** Admin records an offline payment (EFT / cash) — same settlement rules, fully audited. */
export async function recordManualPayment(auth: AuthContext, invoiceId: string, input: { amount: number; method: PaymentMethod; reference: string; paidOn: string }, actor: Actor): Promise<InvoiceDto> {
  await transactional(async (tx, events) => {
    const billing = new PostgresBillingRepository(tx);
    const inv = await billing.findInvoice(invoiceId, true);
    if (!inv) throw notFound('Invoice');
    if (!PAYABLE.includes(inv.status)) throw businessRule('This invoice is not awaiting payment', 'INVOICE_NOT_PAYABLE');
    if (input.amount > inv.amountDue) throw validationError([{ path: 'amount', message: `Exceeds outstanding balance of ${formatZar(inv.amountDue)}` }]);
    const paymentId = await billing.createPayment({
      invoiceId,
      amount: input.amount,
      currency: config().PAYMENT_CURRENCY,
      method: input.method,
      provider: 'manual',
      providerReference: `MANUAL-${input.reference}`,
      initiatedBy: auth.userId,
      status: 'PENDING',
    });
    await billing.settlePayment(paymentId, 'SUCCEEDED', new Date(`${input.paidOn}T12:00:00Z`));
    await applySettlement(tx, events, invoiceId, input.amount, actor);
    await audit(tx, actor, 'PAYMENT_RECORDED_MANUALLY', 'payment', paymentId, { invoiceId, amount: input.amount, method: input.method, reference: input.reference });
  });
  return invoiceDto(db(), invoiceId);
}

export async function paymentStatus(auth: AuthContext, paymentId: string): Promise<PaymentDto> {
  const p = await new PostgresBillingRepository(db()).paymentDto(paymentId);
  if (!p) throw notFound('Payment');
  assertInvoiceAccess(auth, await new PostgresBillingRepository(db()).findInvoice(p.invoiceId));
  return p;
}

/** Dev sandbox helper (route only mounted outside production). */
export async function sandboxPayment(reference: string): Promise<{ amount: number; currency: string; invoiceNumber: string; status: string } | null> {
  const { rows } = await db().query<{ amount: number; currency: string; invoiceNumber: string; status: string }>(
    `SELECT p.amount, p.currency, i.number AS "invoiceNumber", p.status FROM payments p JOIN invoices i ON i.id = p.invoice_id
      WHERE p.provider = 'simulated' AND p.provider_reference = $1`,
    [reference],
  );
  return rows[0] ?? null;
}

