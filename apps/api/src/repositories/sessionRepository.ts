/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * OWASP Foundation. 2021. OWASP Top Ten Web Application Security Risks. Available at: https://owasp.org/www-project-top-ten/ [Accessed 5 September 2026].
 * OWASP Foundation. 2023. OWASP API Security Top 10. Available at: https://owasp.org/API-Security/ [Accessed 2 September 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { Queryable } from '../db/pool';

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
}

export interface ISessionRepository {
  createRefreshToken(t: { userId: string; familyId: string; hash: string; expiresAt: Date; userAgent?: string; ip?: string }): Promise<string>;
  findRefreshTokenForUpdate(hash: string): Promise<RefreshTokenRecord | null>;
  markRotated(id: string, replacedBy: string): Promise<void>;
  revokeFamily(familyId: string, reason: string): Promise<void>;
  revokeAllForUser(userId: string, reason: string): Promise<void>;
  isFamilyActive(familyId: string): Promise<boolean>;
  createResetToken(userId: string, hash: string, expiresAt: Date): Promise<void>;
  consumeResetToken(hash: string): Promise<{ userId: string } | null>;
  recordLoginAttempt(identifier: string, ip: string | null, succeeded: boolean): Promise<void>;
  recentFailures(identifier: string, sinceMinutes: number): Promise<number>;
  deleteExpired(): Promise<number>;
}

export class PostgresSessionRepository implements ISessionRepository {
  constructor(private readonly db: Queryable) {}

  async createRefreshToken(t: { userId: string; familyId: string; hash: string; expiresAt: Date; userAgent?: string; ip?: string }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [t.userId, t.familyId, t.hash, t.expiresAt, t.userAgent?.slice(0, 255) ?? null, t.ip ?? null],
    );
    return rows[0]!.id;
  }

  async findRefreshTokenForUpdate(hash: string) {
    const { rows } = await this.db.query<RefreshTokenRecord>(
      `SELECT id, user_id AS "userId", family_id AS "familyId", expires_at AS "expiresAt",
              revoked_at AS "revokedAt", replaced_by AS "replacedBy"
         FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [hash],
    );
    return rows[0] ?? null;
  }

  async markRotated(id: string, replacedBy: string) {
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'ROTATED', replaced_by = $2 WHERE id = $1`,
      [id, replacedBy],
    );
  }

  async revokeFamily(familyId: string, reason: string) {
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()), revoked_reason = COALESCE(revoked_reason, $2)
        WHERE family_id = $1`,
      [familyId, reason],
    );
  }

  async revokeAllForUser(userId: string, reason: string) {
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId, reason],
    );
  }

  async isFamilyActive(familyId: string) {
    const { rows } = await this.db.query<{ active: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL AND expires_at > now()) AS active`,
      [familyId],
    );
    return rows[0]?.active ?? false;
  }

  async createResetToken(userId: string, hash: string, expiresAt: Date) {
    await this.db.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [userId]);
    await this.db.query('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [userId, hash, expiresAt]);
  }

  /** Atomically marks a valid, unexpired, unused token as used. Single use guaranteed by the WHERE clause. */
  async consumeResetToken(hash: string) {
    const { rows } = await this.db.query<{ userId: string }>(
      `UPDATE password_reset_tokens SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id AS "userId"`,
      [hash],
    );
    return rows[0] ?? null;
  }

  async recordLoginAttempt(identifier: string, ip: string | null, succeeded: boolean) {
    await this.db.query('INSERT INTO login_attempts (identifier, ip, succeeded) VALUES ($1, $2, $3)', [identifier.slice(0, 254), ip, succeeded]);
  }

  async recentFailures(identifier: string, sinceMinutes: number) {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM login_attempts
        WHERE lower(identifier) = lower($1) AND succeeded = false AND created_at > now() - make_interval(mins => $2)`,
      [identifier, sinceMinutes],
    );
    return rows[0]?.n ?? 0;
  }

  async deleteExpired() {
    const a = await this.db.query(`DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days'`);
    const b = await this.db.query(`DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '1 day'`);
    const c = await this.db.query(`DELETE FROM login_attempts WHERE created_at < now() - interval '30 days'`);
    const d = await this.db.query(`DELETE FROM idempotency_keys WHERE created_at < now() - interval '2 days'`);
    return (a.rowCount ?? 0) + (b.rowCount ?? 0) + (c.rowCount ?? 0) + (d.rowCount ?? 0);
  }
}
