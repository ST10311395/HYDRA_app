/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { NotificationType } from '@hydra/shared';
import { logger } from '../config/logger';
import { db, withTransaction, type Queryable } from '../db/pool';
import { integrations } from '../integrations';
import { realtime, type RealtimeEvent } from '../realtime/hub';
import { PostgresNotificationRepository } from '../repositories/notificationRepository';

export interface NotifySpec {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Transactional outbox for side effects. Notifications are INSERTed inside the business transaction
 * (so they commit or roll back with it); realtime events and push delivery run only after COMMIT.
 */
export class EventCollector {
  private readonly realtimeQueue: { room: string; event: RealtimeEvent; payload: Record<string, unknown> }[] = [];
  private readonly pushQueue: { userIds: string[]; spec: NotifySpec }[] = [];

  constructor(private readonly tx: Queryable) {}

  async notify(userIds: (string | null | undefined)[], spec: NotifySpec): Promise<void> {
    const ids = [...new Set(userIds.filter((u): u is string => !!u))];
    if (ids.length === 0) return;
    const rows = await new PostgresNotificationRepository(this.tx).createMany(ids, spec);
    for (const row of rows) {
      const { userId, ...notification } = row;
      this.emit(`user:${userId}`, 'notification.new', notification as unknown as Record<string, unknown>);
    }
    this.pushQueue.push({ userIds: ids, spec });
  }

  async notifyAdmins(spec: NotifySpec): Promise<void> {
    await this.notify(await new PostgresNotificationRepository(this.tx).adminUserIds(), spec);
  }

  emit(room: string, event: RealtimeEvent, payload: Record<string, unknown>): void {
    this.realtimeQueue.push({ room, event, payload });
  }

  async flush(): Promise<void> {
    for (const e of this.realtimeQueue) {
      try {
        realtime().emit(e.room, e.event, e.payload);
      } catch (err) {
        logger.warn({ err }, 'Realtime emit failed');
      }
    }
    for (const p of this.pushQueue) {
      void deliverPush(p.userIds, p.spec);
    }
  }
}

async function deliverPush(userIds: string[], spec: NotifySpec): Promise<void> {
  try {
    const repo = new PostgresNotificationRepository(db());
    const tokens = await repo.pushTokens(userIds);
    if (tokens.length === 0) return;
    const { invalidTokens } = await integrations().push.send(tokens, { title: spec.title, body: spec.body, data: spec.data });
    await repo.removePushTokens(invalidTokens);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Push delivery failed');
  }
}

/** Runs work in a transaction and flushes realtime/push side effects after a successful commit. */
export async function transactional<T>(work: (tx: Queryable, events: EventCollector) => Promise<T>): Promise<T> {
  const holder: { collector?: EventCollector } = {};
  const result = await withTransaction(async (tx) => {
    holder.collector = new EventCollector(tx);
    return work(tx, holder.collector);
  });
  await holder.collector?.flush();
  return result;
}
