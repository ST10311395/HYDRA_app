/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { DiscountDto, DiscountInput, RewardTier, RewardTransactionDto } from '@hydra/shared';
import type { Queryable } from '../db/pool';

export interface RewardsAccountRow {
  id: string;
  customerId: string;
  pointsBalance: number;
  lifetimePoints: number;
  tier: RewardTier;
}

const DISCOUNT_COLS = `d.id, d.code, d.description, d.discount_type AS "discountType", d.value, d.points_cost AS "pointsCost",
  d.min_spend AS "minSpend", d.valid_from AS "validFrom", d.valid_until AS "validUntil", d.active,
  d.max_redemptions AS "maxRedemptions",
  (SELECT count(*)::int FROM customer_discounts cd WHERE cd.discount_id = d.id) AS "redemptionCount"`;

export interface IRewardsRepository {
  account(customerId: string, forUpdate?: boolean): Promise<RewardsAccountRow | null>;
  credit(accountId: string, points: number, tier: RewardTier, tx: { type: 'EARN' | 'ADJUST'; jobId: string | null; invoiceId: string | null; description: string }): Promise<boolean>;
  debit(accountId: string, points: number, tx: { jobId: string | null; invoiceId: string | null; description: string }): Promise<void>;
  transactions(accountId: string, limit: number, offset: number): Promise<{ items: RewardTransactionDto[]; total: number }>;
  listDiscounts(f: { activeOnly: boolean; limit: number; offset: number }): Promise<{ items: DiscountDto[]; total: number }>;
  findDiscount(id: string, forUpdate?: boolean): Promise<DiscountDto | null>;
  createDiscount(input: DiscountInput, userId: string): Promise<string>;
  updateDiscount(id: string, input: Partial<DiscountInput>): Promise<boolean>;
  discountAppliedToInvoice(discountId: string, invoiceId: string): Promise<boolean>;
  applyDiscount(r: { discountId: string; customerId: string; invoiceId: string; amount: number; points: number }): Promise<void>;
}

export class PostgresRewardsRepository implements IRewardsRepository {
  constructor(private readonly db: Queryable) {}

  async account(customerId: string, forUpdate = false) {
    const { rows } = await this.db.query<RewardsAccountRow>(
      `SELECT id, customer_id AS "customerId", points_balance AS "pointsBalance", lifetime_points AS "lifetimePoints", tier
         FROM rewards_accounts WHERE customer_id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`,
      [customerId],
    );
    return rows[0] ?? null;
  }

  /** Returns false if an EARN for this invoice already exists (exactly-once crediting). */
  async credit(accountId: string, points: number, tier: RewardTier, tx: { type: 'EARN' | 'ADJUST'; jobId: string | null; invoiceId: string | null; description: string }) {
    const ins = await this.db.query(
      `INSERT INTO rewards_transactions (account_id, type, job_id, invoice_id, points_earned, description)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [accountId, tx.type, tx.jobId, tx.invoiceId, points, tx.description],
    );
    if ((ins.rowCount ?? 0) === 0) return false;
    await this.db.query(
      'UPDATE rewards_accounts SET points_balance = points_balance + $2, lifetime_points = lifetime_points + $2, tier = $3 WHERE id = $1',
      [accountId, points, tier],
    );
    return true;
  }

  async debit(accountId: string, points: number, tx: { jobId: string | null; invoiceId: string | null; description: string }) {
    await this.db.query(
      `INSERT INTO rewards_transactions (account_id, type, job_id, invoice_id, points_redeemed, description) VALUES ($1,'REDEEM',$2,$3,$4,$5)`,
      [accountId, tx.jobId, tx.invoiceId, points, tx.description],
    );
    // CHECK (points_balance >= 0) is the final guard against overdrawing.
    await this.db.query('UPDATE rewards_accounts SET points_balance = points_balance - $2 WHERE id = $1', [accountId, points]);
  }

  async transactions(accountId: string, limit: number, offset: number) {
    const total = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM rewards_transactions WHERE account_id = $1', [accountId]);
    const { rows } = await this.db.query<RewardTransactionDto>(
      `SELECT rt.id, rt.type, rt.points_earned AS "pointsEarned", rt.points_redeemed AS "pointsRedeemed", rt.description,
              j.reference AS "jobReference", i.number AS "invoiceNumber", rt.created_at AS "createdAt"
         FROM rewards_transactions rt LEFT JOIN jobs j ON j.id = rt.job_id LEFT JOIN invoices i ON i.id = rt.invoice_id
        WHERE rt.account_id = $1 ORDER BY rt.created_at DESC LIMIT $2 OFFSET $3`,
      [accountId, limit, offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async listDiscounts(f: { activeOnly: boolean; limit: number; offset: number }) {
    const w = f.activeOnly ? `WHERE d.active = true AND CURRENT_DATE BETWEEN d.valid_from AND d.valid_until` : '';
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM discounts d ${w}`);
    const { rows } = await this.db.query<DiscountDto>(
      `SELECT ${DISCOUNT_COLS} FROM discounts d ${w} ORDER BY d.points_cost, d.code LIMIT $1 OFFSET $2`,
      [f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async findDiscount(id: string, forUpdate = false) {
    const { rows } = await this.db.query<DiscountDto>(`SELECT ${DISCOUNT_COLS} FROM discounts d WHERE d.id = $1 ${forUpdate ? 'FOR UPDATE OF d' : ''}`, [id]);
    return rows[0] ?? null;
  }

  async createDiscount(input: DiscountInput, userId: string) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO discounts (code, description, discount_type, value, points_cost, min_spend, valid_from, valid_until, active, max_redemptions, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [input.code, input.description, input.discountType, input.value, input.pointsCost, input.minSpend, input.validFrom, input.validUntil, input.active, input.maxRedemptions ?? null, userId],
    );
    return rows[0]!.id;
  }

  async updateDiscount(id: string, input: Partial<DiscountInput>) {
    const map: Record<string, string> = {
      description: 'description', value: 'value', pointsCost: 'points_cost', minSpend: 'min_spend',
      validFrom: 'valid_from', validUntil: 'valid_until', active: 'active', maxRedemptions: 'max_redemptions',
    };
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const [k, col] of Object.entries(map)) {
      const v = (input as Record<string, unknown>)[k];
      if (v !== undefined) {
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (!sets.length) return true;
    const r = await this.db.query(`UPDATE discounts SET ${sets.join(', ')} WHERE id = $1`, params);
    return (r.rowCount ?? 0) === 1;
  }

  async discountAppliedToInvoice(discountId: string, invoiceId: string) {
    const { rows } = await this.db.query<{ e: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM customer_discounts WHERE discount_id = $1 AND invoice_id = $2) AS e',
      [discountId, invoiceId],
    );
    return rows[0]?.e ?? false;
  }

  async applyDiscount(r: { discountId: string; customerId: string; invoiceId: string; amount: number; points: number }) {
    await this.db.query(
      `INSERT INTO customer_discounts (discount_id, customer_id, invoice_id, amount_applied, points_spent) VALUES ($1,$2,$3,$4,$5)`,
      [r.discountId, r.customerId, r.invoiceId, r.amount, r.points],
    );
  }
}
