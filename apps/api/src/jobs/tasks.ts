import { formatZar } from '@hydra/shared';
import { logger } from '../config/logger';
import { db, type Queryable } from '../db/pool';
import { integrations } from '../integrations';
import { PostgresBillingRepository } from '../repositories/billingRepository';
import { PostgresFileRepository } from '../repositories/fileRepository';
import { PostgresQuoteRepository } from '../repositories/quoteRepository';
import { PostgresSessionRepository } from '../repositories/sessionRepository';
import { refreshEstimateOutcomes, reviewAgeingTask } from '../services/aiAdminService';
import { audit, SYSTEM_ACTOR } from '../services/auditService';
import { transactional } from '../services/events';

/**
 * Background jobs (Azure WebJob / Functions equivalent — spec §3.4). Each task is idempotent and can
 * run in-process (scheduler) or from `npm run jobs -- <task>`.
 */
export const TASKS = {
  /** PDF Fig. 5/14: SENT or PARTIALLY_PAID invoices past due → OVERDUE, then reminders every 3 days. */
  async invoiceOverdue(): Promise<number> {
    return transactional(async (tx, events) => {
      const billing = new PostgresBillingRepository(tx);
      const overdue = await billing.markOverdue();
      for (const inv of overdue) {
        await audit(tx, SYSTEM_ACTOR, 'INVOICE_OVERDUE', 'invoice', inv.id);
      }
      const due = await billing.dueForReminder();
      for (const inv of due) {
        await events.notify([inv.customerUserId], {
          type: 'INVOICE_OVERDUE',
          title: `Invoice ${inv.number} is overdue`,
          body: `${formatZar(inv.amountDue)} is outstanding. Pay securely in the app.`,
          data: { invoiceId: inv.id },
        });
        await billing.markReminded(inv.id);
      }
      return overdue.length + due.length;
    });
  },

  async quoteExpiry(): Promise<number> {
    return transactional(async (tx: Queryable) => {
      const expired = await new PostgresQuoteRepository(tx).expireOverdue();
      for (const q of expired) await audit(tx, SYSTEM_ACTOR, 'QUOTE_EXPIRED', 'quote', q.id, { jobId: q.jobId });
      return expired.length;
    });
  },

  async sessionCleanup(): Promise<number> {
    return new PostgresSessionRepository(db()).deleteExpired();
  },

  /** Removes uploads never attached to a record within 24h (spec §18 orphan cleanup). */
  async orphanUploads(): Promise<number> {
    const files = new PostgresFileRepository(db());
    const orphans = await files.orphans(24);
    for (const f of orphans) {
      await integrations().storage.delete(f.storageKey);
      await files.delete(f.id);
    }
    return orphans.length;
  },

  /** Smart Quote: remind admins about review cases older than the configured threshold (once per case). */
  async aiReviewAgeing(): Promise<number> {
    return reviewAgeingTask();
  },

  /** Smart Quote: snapshot AI estimate vs final quote vs invoice for converted jobs (analytics only). */
  async aiEstimateOutcomes(): Promise<number> {
    return refreshEstimateOutcomes();
  },
};

export type TaskName = keyof typeof TASKS;

export async function runTask(name: TaskName): Promise<number> {
  const started = Date.now();
  try {
    const n = await TASKS[name]();
    logger.info({ task: name, affected: n, ms: Date.now() - started }, 'Scheduled task complete');
    return n;
  } catch (err) {
    logger.error({ err, task: name }, 'Scheduled task failed');
    throw err;
  }
}
