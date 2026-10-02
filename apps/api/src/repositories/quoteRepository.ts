import type { QuoteDto, QuoteItemInput, QuoteStatus, QuoteTotals } from '@hydra/shared';
import type { Queryable } from '../db/pool';

export interface QuoteRow {
  id: string;
  jobId: string;
  version: number;
  status: QuoteStatus;
  total: number;
  subtotal: number;
  materialsCost: number;
  vatRate: number;
  validUntil: string;
}

const QUOTE_SELECT = `
  SELECT q.id, q.job_id AS "jobId", j.reference AS "jobReference", q.version, q.status,
         q.labour_cost AS "labourCost", q.materials_cost AS "materialsCost", q.fees, q.discount_amount AS "discountAmount",
         q.subtotal, q.vat_rate AS "vatRate", q.vat_amount AS "vatAmount", q.total, q.valid_until AS "validUntil",
         q.terms, q.notes, q.sent_at AS "sentAt", q.responded_at AS "respondedAt", q.decline_reason AS "declineReason",
         COALESCE((SELECT json_agg(json_build_object('id', qi.id, 'kind', qi.kind, 'description', qi.description,
                    'quantity', qi.quantity::float8, 'unitPrice', qi.unit_price::float8, 'lineTotal', qi.line_total::float8) ORDER BY qi.sort_order)
                   FROM quote_items qi WHERE qi.quote_id = q.id), '[]'::json) AS items,
         q.created_at AS "createdAt"
    FROM quotes q JOIN jobs j ON j.id = q.job_id`;

export interface IQuoteRepository {
  create(q: { jobId: string; totals: QuoteTotals; vatRate: number; validUntil: string; terms?: string; notes?: string; createdBy: string; status: 'DRAFT' | 'SENT'; items: QuoteItemInput[] }): Promise<string>;
  findById(id: string, forUpdate?: boolean): Promise<QuoteRow | null>;
  dto(id: string): Promise<QuoteDto | null>;
  latestForJob(jobId: string, customerVisibleOnly: boolean): Promise<QuoteDto | null>;
  acceptedForJob(jobId: string): Promise<QuoteRow | null>;
  supersedeOpen(jobId: string): Promise<void>;
  markSent(id: string): Promise<void>;
  respond(id: string, status: 'ACCEPTED' | 'DECLINED', userId: string, reason?: string): Promise<boolean>;
  list(f: { status?: QuoteStatus; customerId?: string; limit: number; offset: number }): Promise<{ items: QuoteDto[]; total: number }>;
  expireOverdue(): Promise<{ id: string; jobId: string }[]>;
}

export class PostgresQuoteRepository implements IQuoteRepository {
  constructor(private readonly db: Queryable) {}

  async create(q: { jobId: string; totals: QuoteTotals; vatRate: number; validUntil: string; terms?: string; notes?: string; createdBy: string; status: 'DRAFT' | 'SENT'; items: QuoteItemInput[] }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO quotes (job_id, version, status, labour_cost, materials_cost, fees, discount_amount, subtotal, vat_rate, vat_amount,
                           total, valid_until, terms, notes, created_by, sent_at)
       VALUES ($1, (SELECT COALESCE(MAX(version), 0) + 1 FROM quotes WHERE job_id = $1), $2::text, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               CASE WHEN $2::text = 'SENT' THEN now() END)
       RETURNING id`,
      [
        q.jobId, q.status, q.totals.labourCost, q.totals.materialsCost, q.totals.fees, q.totals.discountAmount, q.totals.subtotal,
        q.vatRate, q.totals.vatAmount, q.totals.total, q.validUntil, q.terms ?? null, q.notes ?? null, q.createdBy,
      ],
    );
    const id = rows[0]!.id;
    let order = 0;
    for (const item of q.items) {
      await this.db.query(
        `INSERT INTO quote_items (quote_id, kind, description, quantity, unit_price, line_total, sort_order)
         VALUES ($1,$2,$3,$4,$5, ROUND($4::numeric * $5::numeric, 2), $6)`,
        [id, item.kind, item.description, item.quantity, item.unitPrice, order++],
      );
    }
    return id;
  }

  async findById(id: string, forUpdate = false) {
    const { rows } = await this.db.query<QuoteRow>(
      `SELECT id, job_id AS "jobId", version, status, total, subtotal, materials_cost AS "materialsCost", vat_rate AS "vatRate",
              valid_until AS "validUntil" FROM quotes WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`,
      [id],
    );
    return rows[0] ?? null;
  }

  async dto(id: string) {
    const { rows } = await this.db.query<QuoteDto>(`${QUOTE_SELECT} WHERE q.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async latestForJob(jobId: string, customerVisibleOnly: boolean) {
    const { rows } = await this.db.query<QuoteDto>(
      `${QUOTE_SELECT} WHERE q.job_id = $1 ${customerVisibleOnly ? `AND q.status <> 'DRAFT'` : ''}
        ORDER BY (q.status = 'ACCEPTED') DESC, q.version DESC LIMIT 1`,
      [jobId],
    );
    return rows[0] ?? null;
  }

  async acceptedForJob(jobId: string) {
    const { rows } = await this.db.query<QuoteRow>(
      `SELECT id, job_id AS "jobId", version, status, total, subtotal, materials_cost AS "materialsCost", vat_rate AS "vatRate",
              valid_until AS "validUntil" FROM quotes WHERE job_id = $1 AND status = 'ACCEPTED'`,
      [jobId],
    );
    return rows[0] ?? null;
  }

  async supersedeOpen(jobId: string) {
    await this.db.query(`UPDATE quotes SET status = 'SUPERSEDED' WHERE job_id = $1 AND status IN ('DRAFT','SENT')`, [jobId]);
  }

  async markSent(id: string) {
    await this.db.query(`UPDATE quotes SET status = 'SENT', sent_at = now() WHERE id = $1 AND status = 'DRAFT'`, [id]);
  }

  async respond(id: string, status: 'ACCEPTED' | 'DECLINED', userId: string, reason?: string) {
    const r = await this.db.query(
      `UPDATE quotes SET status = $2, responded_at = now(), responded_by = $3, decline_reason = $4 WHERE id = $1 AND status = 'SENT'`,
      [id, status, userId, reason ?? null],
    );
    return (r.rowCount ?? 0) === 1;
  }

  async list(f: { status?: QuoteStatus; customerId?: string; limit: number; offset: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.status) {
      params.push(f.status);
      where.push(`q.status = $${params.length}`);
    }
    if (f.customerId) {
      params.push(f.customerId);
      where.push(`j.customer_id = $${params.length}`, `q.status <> 'DRAFT'`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM quotes q JOIN jobs j ON j.id = q.job_id ${w}`, params);
    const { rows } = await this.db.query<QuoteDto>(
      `${QUOTE_SELECT} ${w} ORDER BY q.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async expireOverdue() {
    const { rows } = await this.db.query<{ id: string; jobId: string }>(
      `UPDATE quotes SET status = 'EXPIRED' WHERE status = 'SENT' AND valid_until < CURRENT_DATE RETURNING id, job_id AS "jobId"`,
    );
    return rows;
  }
}
