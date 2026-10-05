/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import { calculateQuoteTotals, formatZar, type CreateQuoteInput, type QuoteDto } from '@hydra/shared';
import { db } from '../db/pool';
import { PostgresJobRepository } from '../repositories/jobRepository';
import { PostgresQuoteRepository } from '../repositories/quoteRepository';
import { PostgresSettingsRepository } from '../repositories/settingsRepository';
import type { AuthContext } from '../types/express';
import { todayIso } from '../utils/dates';
import { businessRule, notFound } from '../utils/errors';
import { paginated } from '../utils/pagination';
import { assertJobAccess, isAdminRole } from './accessControl';
import { audit, type Actor } from './auditService';
import { transactional } from './events';
import { transitionJob } from './jobLifecycle';

/** Admin prepares a quote (PDF Story 7). Sending it moves the job to QUOTED and notifies the customer. */
export async function createQuote(auth: AuthContext, jobId: string, input: CreateQuoteInput, actor: Actor): Promise<QuoteDto> {
  if (input.validUntil < todayIso()) throw businessRule('Validity date cannot be in the past', 'INVALID_VALIDITY');
  const quoteId = await transactional(async (tx, events) => {
    const jobs = new PostgresJobRepository(tx);
    const job = assertJobAccess(auth, await jobs.findById(jobId, true));
    if (!['REQUESTED', 'QUOTED', 'QUOTE_DECLINED'].includes(job.status)) {
      throw businessRule('Quotes can only be prepared for requested, quoted or declined jobs', 'ILLEGAL_JOB_TRANSITION');
    }
    const settings = await new PostgresSettingsRepository(tx).getAll();
    const totals = calculateQuoteTotals(input.items, input.discountAmount, settings.vatRate);
    const quotes = new PostgresQuoteRepository(tx);
    await quotes.supersedeOpen(jobId);
    const id = await quotes.create({
      jobId,
      totals,
      vatRate: settings.vatRate,
      validUntil: input.validUntil,
      terms: input.terms,
      notes: input.notes,
      createdBy: auth.userId,
      status: input.send ? 'SENT' : 'DRAFT',
      items: input.items,
    });
    if (input.send) {
      await transitionJob(tx, events, job, 'SEND_QUOTE', actor, { note: `Quote ${formatZar(totals.total)}` });
      await events.notify([job.customerUserId], {
        type: 'QUOTE_READY',
        title: `Your quote for ${job.reference} is ready`,
        body: `${job.serviceName}: ${formatZar(totals.total)} incl. VAT, valid until ${input.validUntil}.`,
        data: { jobId, quoteId: id },
      });
      events.emit(`user:${job.customerUserId}`, 'quote.ready', { jobId, quoteId: id });
    }
    await audit(tx, actor, input.send ? 'QUOTE_SENT' : 'QUOTE_DRAFTED', 'quote', id, { jobId, total: totals.total });
    return id;
  });
  return (await new PostgresQuoteRepository(db()).dto(quoteId))!;
}

export async function sendQuote(auth: AuthContext, quoteId: string, actor: Actor): Promise<QuoteDto> {
  await transactional(async (tx, events) => {
    const quotes = new PostgresQuoteRepository(tx);
    const quote = await quotes.findById(quoteId, true);
    if (!quote) throw notFound('Quote');
    if (quote.status !== 'DRAFT') throw businessRule('Only draft quotes can be sent', 'QUOTE_NOT_DRAFT');
    if (quote.validUntil < todayIso()) throw businessRule('Quote validity has passed — create a new quote', 'QUOTE_EXPIRED');
    const job = assertJobAccess(auth, await new PostgresJobRepository(tx).findById(quote.jobId, true));
    await transitionJob(tx, events, job, 'SEND_QUOTE', actor);
    await quotes.markSent(quoteId);
    await events.notify([job.customerUserId], {
      type: 'QUOTE_READY',
      title: `Your quote for ${job.reference} is ready`,
      body: `${job.serviceName}: ${formatZar(quote.total)} incl. VAT, valid until ${quote.validUntil}.`,
      data: { jobId: job.id, quoteId },
    });
    events.emit(`user:${job.customerUserId}`, 'quote.ready', { jobId: job.id, quoteId });
    await audit(tx, actor, 'QUOTE_SENT', 'quote', quoteId, { jobId: job.id });
  });
  return (await new PostgresQuoteRepository(db()).dto(quoteId))!;
}

/** Customer response (PDF Story 6) — quote status and job lifecycle change in one transaction. */
export async function respondToQuote(
  auth: AuthContext,
  quoteId: string,
  decision: 'ACCEPT' | 'DECLINE',
  reason: string | undefined,
  actor: Actor,
): Promise<QuoteDto> {
  await transactional(async (tx, events) => {
    const quotes = new PostgresQuoteRepository(tx);
    const quote = await quotes.findById(quoteId, true);
    if (!quote) throw notFound('Quote');
    const job = await new PostgresJobRepository(tx).findById(quote.jobId, true);
    if (!job || auth.role !== 'CUSTOMER' || job.customerId !== auth.customerId) throw notFound('Quote');
    if (quote.status !== 'SENT') throw businessRule('This quote is no longer awaiting a response', 'QUOTE_NOT_OPEN');
    if (quote.validUntil < todayIso()) {
      // The scheduled job marks it EXPIRED; nothing is written here because this transaction rolls back.
      throw businessRule('This quote has expired. Please request an updated quote.', 'QUOTE_EXPIRED');
    }
    const status = decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
    if (!(await quotes.respond(quoteId, status, auth.userId, reason))) throw businessRule('This quote is no longer awaiting a response', 'QUOTE_NOT_OPEN');
    await transitionJob(tx, events, job, decision === 'ACCEPT' ? 'ACCEPT_QUOTE' : 'DECLINE_QUOTE', actor, { note: reason });
    if (decision === 'ACCEPT') {
      await events.notifyAdmins({
        type: 'QUOTE_ACCEPTED',
        title: `Quote accepted · ${job.reference}`,
        body: `${formatZar(quote.total)} — ready to assign an electrician`,
        data: { jobId: job.id, quoteId },
      });
      await events.notify([job.customerUserId], {
        type: 'QUOTE_ACCEPTED',
        title: 'Quote accepted — thank you',
        body: `We are scheduling a certified electrician for ${job.reference}. You will be notified once confirmed.`,
        data: { jobId: job.id },
      });
    } else {
      await events.notifyAdmins({
        type: 'QUOTE_DECLINED',
        title: `Quote declined · ${job.reference}`,
        body: reason ? `Reason: ${reason}` : 'No reason given',
        data: { jobId: job.id, quoteId },
      });
    }
    await audit(tx, actor, decision === 'ACCEPT' ? 'QUOTE_ACCEPTED' : 'QUOTE_DECLINED', 'quote', quoteId, { jobId: job.id, reason });
  });
  return (await new PostgresQuoteRepository(db()).dto(quoteId))!;
}

export async function getQuote(auth: AuthContext, quoteId: string): Promise<QuoteDto> {
  const quote = await new PostgresQuoteRepository(db()).dto(quoteId);
  if (!quote) throw notFound('Quote');
  const job = await new PostgresJobRepository(db()).findById(quote.jobId);
  if (auth.role === 'EMPLOYEE' || !job) throw notFound('Quote');
  assertJobAccess(auth, job);
  if (auth.role === 'CUSTOMER' && quote.status === 'DRAFT') throw notFound('Quote');
  return quote;
}

export async function listQuotes(auth: AuthContext, page: number, pageSize: number, status?: QuoteDto['status']) {
  if (auth.role === 'EMPLOYEE') throw notFound('Quote');
  const scope = isAdminRole(auth) ? {} : { customerId: auth.customerId ?? undefined };
  const { items, total } = await new PostgresQuoteRepository(db()).list({ ...scope, status, limit: pageSize, offset: (page - 1) * pageSize });
  return paginated(items, page, pageSize, total);
}
