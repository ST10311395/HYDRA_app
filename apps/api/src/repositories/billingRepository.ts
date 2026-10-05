/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { InvoiceDto, InvoiceStatus, PaymentDto, PaymentMethod, PaymentStatus } from '@hydra/shared';
import type { Queryable } from '../db/pool';
import { likePattern } from '../utils/pagination';

export interface InvoiceRow {
  id: string;
  number: string;
  jobId: string;
  quoteId: string | null;
  customerId: string;
  customerUserId: string;
  customerEmail: string;
  status: InvoiceStatus;
  total: number;
  discountTotal: number;
  amountPaid: number;
  amountDue: number;
  dueDate: string;
  version: number;
}

export interface PaymentRow {
  id: string;
  invoiceId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  providerReference: string | null;
  idempotencyKey: string | null;
}

const PAYMENT_SELECT = `
  SELECT p.id, p.invoice_id AS "invoiceId", i.number AS "invoiceNumber", p.amount, p.currency, p.method, p.provider,
         p.provider_reference AS "providerReference", p.status, p.checkout_url AS "checkoutUrl", p.paid_at AS "paidAt",
         p.created_at AS "createdAt"
    FROM payments p JOIN invoices i ON i.id = p.invoice_id`;

const INVOICE_SELECT = `
  SELECT i.id, i.number, i.job_id AS "jobId", j.reference AS "jobReference", i.quote_id AS "quoteId",
         json_build_object('id', c.id, 'name', TRIM(c.first_name || ' ' || c.last_name), 'phone', c.phone, 'email', u.email) AS customer,
         i.status, i.subtotal, i.materials_adjustment AS "materialsAdjustment", i.discount_total AS "discountTotal",
         i.vat_amount AS "vatAmount", i.total, i.amount_paid AS "amountPaid", i.amount_due AS "amountDue",
         i.invoice_date AS "invoiceDate", i.due_date AS "dueDate", i.sent_at AS "sentAt", i.paid_at AS "paidAt", i.notes,
         COALESCE((SELECT json_agg(json_build_object('id', ii.id, 'description', ii.description, 'quantity', ii.quantity::float8,
                   'unitPrice', ii.unit_price::float8, 'lineTotal', ii.line_total::float8) ORDER BY ii.sort_order)
                   FROM invoice_items ii WHERE ii.invoice_id = i.id), '[]'::json) AS items,
         COALESCE((SELECT json_agg(json_build_object('code', d.code, 'description', d.description,
                   'amountApplied', cd.amount_applied::float8, 'pointsSpent', cd.points_spent) ORDER BY cd.applied_at)
                   FROM customer_discounts cd JOIN discounts d ON d.id = cd.discount_id WHERE cd.invoice_id = i.id), '[]'::json) AS discounts
    FROM invoices i JOIN jobs j ON j.id = i.job_id JOIN customers c ON c.id = i.customer_id JOIN users u ON u.id = c.user_id`;

export interface IBillingRepository {
  createInvoice(inv: { jobId: string; quoteId: string; customerId: string; subtotal: number; materialsAdjustment: number; vatAmount: number; total: number; dueDate: string; notes?: string; createdBy: string; items: { description: string; quantity: number; unitPrice: number; lineTotal: number }[] }): Promise<string>;
  findInvoice(id: string, forUpdate?: boolean): Promise<InvoiceRow | null>;
  findInvoiceByJob(jobId: string): Promise<InvoiceRow | null>;
  invoiceDto(id: string): Promise<Omit<InvoiceDto, 'payments'> | null>;
  listInvoices(f: { customerId?: string; status?: InvoiceStatus; search?: string; limit: number; offset: number }): Promise<{ items: Omit<InvoiceDto, 'payments'>[]; total: number }>;
  setInvoiceStatus(id: string, status: InvoiceStatus, opts?: { sent?: boolean; paid?: boolean }): Promise<void>;
  addPaymentToInvoice(id: string, amount: number): Promise<void>;
  addDiscountToInvoice(id: string, amount: number): Promise<void>;
  markOverdue(): Promise<{ id: string; customerUserId: string; number: string; jobId: string }[]>;
  dueForReminder(): Promise<{ id: string; customerUserId: string; number: string; amountDue: number }[]>;
  markReminded(id: string): Promise<void>;
  createPayment(p: { invoiceId: string; amount: number; currency: string; method: PaymentMethod; provider: string; providerReference: string; idempotencyKey?: string | null; initiatedBy: string | null; status?: PaymentStatus }): Promise<string>;
  findPaymentByIdempotency(key: string): Promise<PaymentRow | null>;
  findPaymentByReference(provider: string, reference: string): Promise<PaymentRow | null>;
  setCheckoutUrl(id: string, url: string): Promise<void>;
  settlePayment(id: string, status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED', paidAt: Date | null, failureReason?: string | null): Promise<void>;
  paymentDto(id: string): Promise<PaymentDto | null>;
  paymentsForInvoice(invoiceId: string): Promise<PaymentDto[]>;
  listPayments(f: { customerId?: string; status?: PaymentStatus; limit: number; offset: number }): Promise<{ items: PaymentDto[]; total: number }>;
  recordWebhookEvent(provider: string, eventId: string, eventType: string, payloadHash: string): Promise<boolean>;
  setWebhookResult(provider: string, eventId: string, result: string): Promise<void>;
  outstandingForCustomer(customerId: string): Promise<number>;
}

export class PostgresBillingRepository implements IBillingRepository {
  constructor(private readonly db: Queryable) {}

  async createInvoice(inv: { jobId: string; quoteId: string; customerId: string; subtotal: number; materialsAdjustment: number; vatAmount: number; total: number; dueDate: string; notes?: string; createdBy: string; items: { description: string; quantity: number; unitPrice: number; lineTotal: number }[] }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO invoices (job_id, quote_id, customer_id, subtotal, materials_adjustment, vat_amount, total, due_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [inv.jobId, inv.quoteId, inv.customerId, inv.subtotal, inv.materialsAdjustment, inv.vatAmount, inv.total, inv.dueDate, inv.notes ?? null, inv.createdBy],
    );
    const id = rows[0]!.id;
    let order = 0;
    for (const item of inv.items) {
      await this.db.query(
        'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, item.description, item.quantity, item.unitPrice, item.lineTotal, order++],
      );
    }
    return id;
  }

  private async invoiceRow(where: string, params: unknown[], forUpdate: boolean) {
    const { rows } = await this.db.query<InvoiceRow>(
      `SELECT i.id, i.number, i.job_id AS "jobId", i.quote_id AS "quoteId", i.customer_id AS "customerId", c.user_id AS "customerUserId",
              u.email AS "customerEmail", i.status, i.total, i.discount_total AS "discountTotal", i.amount_paid AS "amountPaid",
              i.amount_due AS "amountDue", i.due_date AS "dueDate", i.version
         FROM invoices i JOIN customers c ON c.id = i.customer_id JOIN users u ON u.id = c.user_id
        WHERE ${where} ${forUpdate ? 'FOR UPDATE OF i' : ''}`,
      params,
    );
    return rows[0] ?? null;
  }

  findInvoice(id: string, forUpdate = false) {
    return this.invoiceRow('i.id = $1', [id], forUpdate);
  }

  findInvoiceByJob(jobId: string) {
    return this.invoiceRow('i.job_id = $1', [jobId], false);
  }

  async invoiceDto(id: string) {
    const { rows } = await this.db.query<Omit<InvoiceDto, 'payments'>>(`${INVOICE_SELECT} WHERE i.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async listInvoices(f: { customerId?: string; status?: InvoiceStatus; search?: string; limit: number; offset: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.customerId) {
      params.push(f.customerId);
      where.push(`i.customer_id = $${params.length}`, `i.status <> 'DRAFT'`);
    }
    if (f.status) {
      params.push(f.status);
      where.push(`i.status = $${params.length}`);
    }
    if (f.search) {
      params.push(likePattern(f.search));
      where.push(`(i.number ILIKE $${params.length} OR j.reference ILIKE $${params.length} OR (c.first_name || ' ' || c.last_name) ILIKE $${params.length})`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM invoices i JOIN jobs j ON j.id = i.job_id JOIN customers c ON c.id = i.customer_id ${w}`,
      params,
    );
    const { rows } = await this.db.query<Omit<InvoiceDto, 'payments'>>(
      `${INVOICE_SELECT} ${w} ORDER BY i.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async setInvoiceStatus(id: string, status: InvoiceStatus, opts: { sent?: boolean; paid?: boolean } = {}) {
    await this.db.query(
      `UPDATE invoices SET status = $2, version = version + 1,
              sent_at = CASE WHEN $3 THEN COALESCE(sent_at, now()) ELSE sent_at END,
              paid_at = CASE WHEN $4 THEN now() ELSE paid_at END
        WHERE id = $1`,
      [id, status, opts.sent ?? false, opts.paid ?? false],
    );
  }

  async addPaymentToInvoice(id: string, amount: number) {
    await this.db.query('UPDATE invoices SET amount_paid = amount_paid + $2, version = version + 1 WHERE id = $1', [id, amount]);
  }

  async addDiscountToInvoice(id: string, amount: number) {
    await this.db.query('UPDATE invoices SET discount_total = discount_total + $2, version = version + 1 WHERE id = $1', [id, amount]);
  }

  async markOverdue() {
    const { rows } = await this.db.query<{ id: string; customerUserId: string; number: string; jobId: string }>(
      `UPDATE invoices i SET status = 'OVERDUE', version = version + 1
         FROM customers c
        WHERE c.id = i.customer_id AND i.status IN ('SENT','PARTIALLY_PAID') AND i.due_date < CURRENT_DATE AND i.amount_due > 0
        RETURNING i.id, c.user_id AS "customerUserId", i.number, i.job_id AS "jobId"`,
    );
    return rows;
  }

  async dueForReminder() {
    const { rows } = await this.db.query<{ id: string; customerUserId: string; number: string; amountDue: number }>(
      `SELECT i.id, c.user_id AS "customerUserId", i.number, i.amount_due AS "amountDue"
         FROM invoices i JOIN customers c ON c.id = i.customer_id
        WHERE i.status = 'OVERDUE' AND (i.last_reminder_at IS NULL OR i.last_reminder_at < now() - interval '3 days')
        LIMIT 200`,
    );
    return rows;
  }

  async markReminded(id: string) {
    await this.db.query('UPDATE invoices SET last_reminder_at = now() WHERE id = $1', [id]);
  }

  async createPayment(p: { invoiceId: string; amount: number; currency: string; method: PaymentMethod; provider: string; providerReference: string; idempotencyKey?: string | null; initiatedBy: string | null; status?: PaymentStatus }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO payments (invoice_id, amount, currency, method, provider, provider_reference, idempotency_key, initiated_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [p.invoiceId, p.amount, p.currency, p.method, p.provider, p.providerReference, p.idempotencyKey ?? null, p.initiatedBy, p.status ?? 'PENDING'],
    );
    return rows[0]!.id;
  }

  private async paymentRow(where: string, params: unknown[]) {
    const { rows } = await this.db.query<PaymentRow>(
      `SELECT id, invoice_id AS "invoiceId", amount, currency, status, provider, provider_reference AS "providerReference",
              idempotency_key AS "idempotencyKey" FROM payments WHERE ${where} FOR UPDATE`,
      params,
    );
    return rows[0] ?? null;
  }

  findPaymentByIdempotency(key: string) {
    return this.paymentRow('idempotency_key = $1', [key]);
  }

  findPaymentByReference(provider: string, reference: string) {
    return this.paymentRow('provider = $1 AND provider_reference = $2', [provider, reference]);
  }

  async setCheckoutUrl(id: string, url: string) {
    await this.db.query('UPDATE payments SET checkout_url = $2 WHERE id = $1', [id, url]);
  }

  async settlePayment(id: string, status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED', paidAt: Date | null, failureReason?: string | null) {
    await this.db.query('UPDATE payments SET status = $2, paid_at = $3, failure_reason = $4 WHERE id = $1', [id, status, paidAt, failureReason ?? null]);
  }

  async paymentDto(id: string) {
    const { rows } = await this.db.query<PaymentDto>(`${PAYMENT_SELECT} WHERE p.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async paymentsForInvoice(invoiceId: string) {
    const { rows } = await this.db.query<PaymentDto>(`${PAYMENT_SELECT} WHERE p.invoice_id = $1 ORDER BY p.created_at DESC`, [invoiceId]);
    return rows;
  }

  async listPayments(f: { customerId?: string; status?: PaymentStatus; limit: number; offset: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.customerId) {
      params.push(f.customerId);
      where.push(`i.customer_id = $${params.length}`);
    }
    if (f.status) {
      params.push(f.status);
      where.push(`p.status = $${params.length}`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM payments p JOIN invoices i ON i.id = p.invoice_id ${w}`, params);
    const { rows } = await this.db.query<PaymentDto>(
      `${PAYMENT_SELECT} ${w} ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  /** Returns false when this provider event was already received (webhook idempotency). */
  async recordWebhookEvent(provider: string, eventId: string, eventType: string, payloadHash: string) {
    const r = await this.db.query(
      `INSERT INTO payment_webhook_events (provider, event_id, event_type, payload_hash, result)
       VALUES ($1,$2,$3,$4,'RECEIVED') ON CONFLICT (provider, event_id) DO NOTHING`,
      [provider, eventId, eventType, payloadHash],
    );
    return (r.rowCount ?? 0) === 1;
  }

  async setWebhookResult(provider: string, eventId: string, result: string) {
    await this.db.query('UPDATE payment_webhook_events SET result = $3 WHERE provider = $1 AND event_id = $2', [provider, eventId, result]);
  }

  async outstandingForCustomer(customerId: string) {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT COALESCE(SUM(amount_due), 0)::float8 AS n FROM invoices WHERE customer_id = $1 AND status IN ('SENT','PARTIALLY_PAID','OVERDUE')`,
      [customerId],
    );
    return rows[0]?.n ?? 0;
  }
}
