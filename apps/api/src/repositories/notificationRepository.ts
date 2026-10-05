/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { NotificationDto, NotificationType } from '@hydra/shared';
import type { Queryable } from '../db/pool';

export type StoredNotification = NotificationDto & { userId: string };

export interface INotificationRepository {
  createMany(userIds: string[], n: { type: NotificationType; title: string; body: string; data?: Record<string, string> }): Promise<StoredNotification[]>;
  list(userId: string, unreadOnly: boolean, limit: number, offset: number): Promise<{ items: NotificationDto[]; total: number; unread: number }>;
  markRead(userId: string, id: string): Promise<boolean>;
  markAllRead(userId: string): Promise<number>;
  unreadCount(userId: string): Promise<number>;
  recent(userId: string, limit: number): Promise<NotificationDto[]>;
  savePushToken(userId: string, token: string, platform: string): Promise<void>;
  deletePushToken(userId: string, token: string): Promise<void>;
  pushTokens(userIds: string[]): Promise<string[]>;
  removePushTokens(tokens: string[]): Promise<void>;
  adminUserIds(): Promise<string[]>;
}

const COLS = `id, type, title, body, data, read_at AS "readAt", created_at AS "createdAt"`;

export class PostgresNotificationRepository implements INotificationRepository {
  constructor(private readonly db: Queryable) {}

  async createMany(userIds: string[], n: { type: NotificationType; title: string; body: string; data?: Record<string, string> }) {
    if (userIds.length === 0) return [];
    const { rows } = await this.db.query<StoredNotification>(
      `INSERT INTO notifications (user_id, type, title, body, data)
       SELECT u, $2, $3, $4, $5 FROM unnest($1::uuid[]) AS u
       RETURNING user_id AS "userId", ${COLS}`,
      [userIds, n.type, n.title.slice(0, 120), n.body.slice(0, 500), n.data ?? null],
    );
    return rows;
  }

  async list(userId: string, unreadOnly: boolean, limit: number, offset: number) {
    const filter = unreadOnly ? 'AND read_at IS NULL' : '';
    const { rows } = await this.db.query<NotificationDto>(
      `SELECT ${COLS} FROM notifications WHERE user_id = $1 ${filter} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    const counts = await this.db.query<{ total: number; unread: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE read_at IS NULL)::int AS unread
         FROM notifications WHERE user_id = $1`,
      [userId],
    );
    const c = counts.rows[0];
    return { items: rows, total: unreadOnly ? (c?.unread ?? 0) : (c?.total ?? 0), unread: c?.unread ?? 0 };
  }

  async markRead(userId: string, id: string) {
    const r = await this.db.query('UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2', [id, userId]);
    return (r.rowCount ?? 0) > 0;
  }

  async markAllRead(userId: string) {
    const r = await this.db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
    return r.rowCount ?? 0;
  }

  async unreadCount(userId: string) {
    const { rows } = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]);
    return rows[0]?.n ?? 0;
  }

  async recent(userId: string, limit: number) {
    const { rows } = await this.db.query<NotificationDto>(
      `SELECT ${COLS} FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows;
  }

  async savePushToken(userId: string, token: string, platform: string) {
    await this.db.query(
      `INSERT INTO push_tokens (user_id, token, platform) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = now()`,
      [userId, token, platform],
    );
  }

  async deletePushToken(userId: string, token: string) {
    await this.db.query('DELETE FROM push_tokens WHERE user_id = $1 AND token = $2', [userId, token]);
  }

  async pushTokens(userIds: string[]) {
    if (userIds.length === 0) return [];
    const { rows } = await this.db.query<{ token: string }>('SELECT token FROM push_tokens WHERE user_id = ANY($1::uuid[])', [userIds]);
    return rows.map((r) => r.token);
  }

  async removePushTokens(tokens: string[]) {
    if (tokens.length) await this.db.query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [tokens]);
  }

  async adminUserIds() {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id FROM users WHERE role IN ('ADMIN_OFFICE','ADMIN_OWNER') AND status = 'ACTIVE'`,
    );
    return rows.map((r) => r.id);
  }
}
