/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { AuthUser, Role } from '@hydra/shared';
import type { Queryable } from '../db/pool';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  staffNumber: string | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  tokenVersion: number;
  onboardingCompletedAt: Date | null;
  customerId: string | null;
  employeeId: string | null;
  adminId: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string | null;
  marketingOptIn: boolean;
  hasGoogleLink: boolean;
  anonymisedAt: Date | null;
}

export interface NewUser {
  email: string;
  passwordHash: string | null;
  role: Role;
  staffNumber?: string | null;
}

export interface IUserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findByStaffNumber(staffNumber: string): Promise<UserRecord | null>;
  findByIdentity(provider: 'google', subject: string): Promise<UserRecord | null>;
  create(user: NewUser): Promise<string>;
  createCustomerProfile(userId: string, p: { firstName: string; lastName: string; phone: string | null; address: string | null; marketingOptIn: boolean }): Promise<string>;
  createEmployeeProfile(userId: string, p: { firstName: string; lastName: string; phone: string | null; certificationNo: string | null; specialisation: string | null; hourlyRate: number; taxRate: number }): Promise<string>;
  createAdminProfile(userId: string, p: { firstName: string; lastName: string; phone: string | null }): Promise<string>;
  nextStaffNumber(role: Role): Promise<string>;
  linkIdentity(userId: string, provider: 'google', subject: string, email: string, emailVerified: boolean): Promise<void>;
  touchIdentity(provider: 'google', subject: string): Promise<void>;
  recordFailedLogin(userId: string, lockUntil: Date | null): Promise<number>;
  recordSuccessfulLogin(userId: string): Promise<void>;
  setPassword(userId: string, passwordHash: string): Promise<void>;
  bumpTokenVersion(userId: string): Promise<void>;
  setStatus(userId: string, status: 'ACTIVE' | 'DISABLED'): Promise<void>;
  completeOnboarding(userId: string): Promise<void>;
  /** Updates the role's profile row; returns false when the user has no profile row to update. */
  updateProfile(user: UserRecord, p: { firstName?: string; lastName?: string; phone?: string; address?: string | null; marketingOptIn?: boolean }): Promise<boolean>;
  recordConsent(userId: string | null, type: string, granted: boolean): Promise<void>;
  anonymise(userId: string): Promise<void>;
}

const SELECT_USER = `
  SELECT u.id, u.email, u.password_hash AS "passwordHash", u.role, u.status, u.staff_number AS "staffNumber",
         u.failed_login_count AS "failedLoginCount", u.locked_until AS "lockedUntil", u.token_version AS "tokenVersion",
         u.onboarding_completed_at AS "onboardingCompletedAt", u.anonymised_at AS "anonymisedAt",
         c.id AS "customerId", e.id AS "employeeId", a.id AS "adminId",
         COALESCE(c.first_name, e.first_name, a.first_name, '') AS "firstName",
         COALESCE(c.last_name, e.last_name, a.last_name, '') AS "lastName",
         COALESCE(c.phone, e.phone, a.phone) AS phone,
         c.address, COALESCE(c.marketing_opt_in, false) AS "marketingOptIn",
         EXISTS (SELECT 1 FROM auth_identities ai WHERE ai.user_id = u.id) AS "hasGoogleLink"
    FROM users u
    LEFT JOIN customers c ON c.user_id = u.id
    LEFT JOIN employees e ON e.user_id = u.id
    LEFT JOIN admins a ON a.user_id = u.id`;

export class PostgresUserRepository implements IUserRepository {
  constructor(private readonly db: Queryable) {}

  private async one(where: string, params: unknown[]): Promise<UserRecord | null> {
    const { rows } = await this.db.query<UserRecord>(`${SELECT_USER} WHERE ${where} LIMIT 1`, params);
    return rows[0] ?? null;
  }

  findById(id: string) {
    return this.one('u.id = $1', [id]);
  }

  findByEmail(email: string) {
    return this.one('lower(u.email) = lower($1)', [email]);
  }

  findByStaffNumber(staffNumber: string) {
    return this.one('upper(u.staff_number) = upper($1)', [staffNumber]);
  }

  findByIdentity(provider: 'google', subject: string) {
    return this.one(
      'u.id = (SELECT user_id FROM auth_identities WHERE provider = $1 AND provider_subject = $2)',
      [provider, subject],
    );
  }

  async create(user: NewUser): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, staff_number) VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.email, user.passwordHash, user.role, user.staffNumber ?? null],
    );
    return rows[0]!.id;
  }

  async createCustomerProfile(userId: string, p: { firstName: string; lastName: string; phone: string | null; address: string | null; marketingOptIn: boolean }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO customers (user_id, first_name, last_name, phone, address, marketing_opt_in)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, p.firstName, p.lastName, p.phone, p.address, p.marketingOptIn],
    );
    const customerId = rows[0]!.id;
    await this.db.query('INSERT INTO rewards_accounts (customer_id) VALUES ($1)', [customerId]);
    return customerId;
  }

  async createEmployeeProfile(userId: string, p: { firstName: string; lastName: string; phone: string | null; certificationNo: string | null; specialisation: string | null; hourlyRate: number; taxRate: number }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO employees (user_id, first_name, last_name, phone, certification_no, specialisation, hourly_rate, tax_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [userId, p.firstName, p.lastName, p.phone, p.certificationNo, p.specialisation, p.hourlyRate, p.taxRate],
    );
    return rows[0]!.id;
  }

  async createAdminProfile(userId: string, p: { firstName: string; lastName: string; phone: string | null }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO admins (user_id, first_name, last_name, phone) VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, p.firstName, p.lastName, p.phone],
    );
    return rows[0]!.id;
  }

  async nextStaffNumber(role: Role): Promise<string> {
    const { rows } = await this.db.query<{ n: number }>(`SELECT nextval('staff_number_seq')::int AS n`);
    const prefix = role === 'EMPLOYEE' ? 'PSG-E' : 'PSG-A';
    return `${prefix}-${String(rows[0]!.n).padStart(4, '0')}`;
  }

  async linkIdentity(userId: string, provider: 'google', subject: string, email: string, emailVerified: boolean) {
    await this.db.query(
      `INSERT INTO auth_identities (user_id, provider, provider_subject, email, email_verified, last_used_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [userId, provider, subject, email, emailVerified],
    );
  }

  async touchIdentity(provider: 'google', subject: string) {
    await this.db.query('UPDATE auth_identities SET last_used_at = now() WHERE provider = $1 AND provider_subject = $2', [provider, subject]);
  }

  async recordFailedLogin(userId: string, lockUntil: Date | null): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `UPDATE users SET failed_login_count = failed_login_count + 1, locked_until = COALESCE($2, locked_until)
       WHERE id = $1 RETURNING failed_login_count AS n`,
      [userId, lockUntil],
    );
    return rows[0]?.n ?? 0;
  }

  async recordSuccessfulLogin(userId: string) {
    await this.db.query(
      'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1',
      [userId],
    );
  }

  async setPassword(userId: string, passwordHash: string) {
    await this.db.query(
      'UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL, token_version = token_version + 1 WHERE id = $1',
      [userId, passwordHash],
    );
  }

  async bumpTokenVersion(userId: string) {
    await this.db.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [userId]);
  }

  async setStatus(userId: string, status: 'ACTIVE' | 'DISABLED') {
    await this.db.query('UPDATE users SET status = $2, token_version = token_version + 1 WHERE id = $1', [userId, status]);
  }

  async completeOnboarding(userId: string) {
    await this.db.query('UPDATE users SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()) WHERE id = $1', [userId]);
  }

  async updateProfile(user: UserRecord, p: { firstName?: string; lastName?: string; phone?: string; address?: string | null; marketingOptIn?: boolean }) {
    const table = user.customerId ? 'customers' : user.employeeId ? 'employees' : user.adminId ? 'admins' : null;
    if (!table) return false;
    const sets: string[] = [];
    const params: unknown[] = [user.id];
    const add = (col: string, v: unknown) => {
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    };
    if (p.firstName !== undefined) add('first_name', p.firstName);
    if (p.lastName !== undefined) add('last_name', p.lastName);
    if (p.phone !== undefined) add('phone', p.phone);
    if (table === 'customers' && p.address !== undefined) add('address', p.address);
    if (table === 'customers' && p.marketingOptIn !== undefined) add('marketing_opt_in', p.marketingOptIn);
    if (sets.length === 0) return true;
    const res = await this.db.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE user_id = $1`, params);
    return (res.rowCount ?? 0) === 1;
  }

  async recordConsent(userId: string | null, type: string, granted: boolean) {
    await this.db.query('INSERT INTO consents (user_id, consent_type, granted) VALUES ($1, $2, $3)', [userId, type, granted]);
  }

  /** POPIA deletion where legally permitted: personal fields are replaced; financial/job records retained. */
  async anonymise(userId: string) {
    const placeholder = `deleted-${userId.slice(0, 8)}@anonymised.invalid`;
    await this.db.query(
      `UPDATE users SET email = $2, password_hash = NULL, status = 'DISABLED', anonymised_at = now(),
              token_version = token_version + 1 WHERE id = $1`,
      [userId, placeholder],
    );
    await this.db.query(`UPDATE customers SET first_name = 'Deleted', last_name = 'Customer', phone = NULL, address = NULL, marketing_opt_in = false WHERE user_id = $1`, [userId]);
    await this.db.query('DELETE FROM auth_identities WHERE user_id = $1', [userId]);
    await this.db.query('DELETE FROM push_tokens WHERE user_id = $1', [userId]);
    await this.db.query('UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL', [userId, 'ANONYMISED']);
  }
}

export function toAuthUser(u: UserRecord): AuthUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone,
    customerId: u.customerId,
    employeeId: u.employeeId,
    adminId: u.adminId,
    staffNumber: u.staffNumber,
    onboardingCompleted: u.onboardingCompletedAt !== null,
    hasGoogleLink: u.hasGoogleLink,
    address: u.address,
    marketingOptIn: u.marketingOptIn,
    hasPassword: u.passwordHash !== null,
  };
}
