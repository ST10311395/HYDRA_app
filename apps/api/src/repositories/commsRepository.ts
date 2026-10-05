/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type {
  ContactQueryDto,
  ContactQueryInput,
  ContactQueryStatus,
  DeliveryStatus,
  MessageChannel,
  MessageLogDto,
  MissedCallDto,
  MissedCallStatus,
} from '@hydra/shared';
import type { Queryable } from '../db/pool';
import { likePattern } from '../utils/pagination';

const QUERY_DTO = `
  SELECT q.id, q.reference, q.name, q.email, q.phone, q.sector, q.urgency, q.message, q.source, q.details, q.status,
         NULLIF(TRIM(COALESCE(a.first_name, '') || ' ' || COALESCE(a.last_name, '')), '') AS "assignedAdminName",
         q.admin_notes AS "adminNotes", q.converted_job_id AS "convertedJobId", j.reference AS "convertedJobReference",
         q.converted_customer_id AS "convertedCustomerId", q.submitted_at AS "submittedAt", q.updated_at AS "updatedAt"
    FROM contact_queries q LEFT JOIN admins a ON a.id = q.assigned_admin_id LEFT JOIN jobs j ON j.id = q.converted_job_id`;

const MESSAGE_DTO = `
  SELECT m.id, m.missed_call_id AS "missedCallId", m.channel, m.recipient, m.message_content AS "messageContent",
         m.delivery_status AS "deliveryStatus", m.provider_message_id AS "providerMessageId", m.error_message AS "errorMessage",
         NULLIF(TRIM(COALESCE(a.first_name, '') || ' ' || COALESCE(a.last_name, '')), '') AS "approvedByName",
         m.sent_at AS "sentAt", m.created_at AS "createdAt"
    FROM ai_message_logs m LEFT JOIN admins a ON a.user_id = m.approved_by`;

const MISSED_DTO = `
  SELECT mc.id, ct.phone AS "phoneNumber", ct.name AS "contactName", ct.linked_customer_id AS "linkedCustomerId",
         mc.call_at AS "callAt", mc.duration_seconds AS "durationSeconds", mc.status, mc.classification,
         mc.suggested_reply AS "suggestedReply", mc.source, mc.created_at AS "createdAt",
         COALESCE((SELECT json_agg(x ORDER BY x."createdAt") FROM (${MESSAGE_DTO} WHERE m.missed_call_id = mc.id) x), '[]'::json) AS messages
    FROM missed_call_logs mc JOIN contacts ct ON ct.id = mc.contact_id`;

export interface ICommsRepository {
  findRecentDuplicate(input: ContactQueryInput): Promise<string | null>;
  createQuery(input: ContactQueryInput, meta: { userId: string | null; ip: string | null }): Promise<string>;
  query(id: string, forUpdate?: boolean): Promise<ContactQueryDto | null>;
  listQueries(f: { status?: ContactQueryStatus; search?: string; limit: number; offset: number }): Promise<{ items: ContactQueryDto[]; total: number }>;
  updateQuery(id: string, p: { status?: ContactQueryStatus; adminNotes?: string; assignedAdminId?: string; convertedJobId?: string; convertedCustomerId?: string }): Promise<void>;
  newQueryCount(): Promise<number>;
  upsertContact(c: { phone: string; name: string | null; email: string | null; source: string; linkedCustomerId: string | null }): Promise<string>;
  createMissedCall(m: { contactId: string; callAt: string; durationSeconds: number; source: string; deviceId?: string | null; reportedBy: string }): Promise<string | null>;
  missedCall(id: string, forUpdate?: boolean): Promise<MissedCallDto | null>;
  listMissedCalls(f: { status?: MissedCallStatus; limit: number; offset: number }): Promise<{ items: MissedCallDto[]; total: number }>;
  updateMissedCall(id: string, p: { status?: MissedCallStatus; classification?: string; suggestedReply?: string }): Promise<void>;
  missedCallsToReview(): Promise<number>;
  logMessage(m: { missedCallId: string | null; channel: MessageChannel; recipient: string; content: string; status: DeliveryStatus; provider: string | null; providerMessageId: string | null; error: string | null; approvedBy: string | null }): Promise<string>;
  listMessages(f: { status?: DeliveryStatus; limit: number; offset: number }): Promise<{ items: MessageLogDto[]; total: number }>;
}

export class PostgresCommsRepository implements ICommsRepository {
  constructor(private readonly db: Queryable) {}

  /**
   * An identical enquiry (same email, source and message) submitted in the last 10 minutes — a
   * double tap or a retry after a timeout. Serialised with an advisory lock so two concurrent
   * identical submissions cannot both insert.
   */
  async findRecentDuplicate(input: ContactQueryInput): Promise<string | null> {
    await this.db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`enquiry:${input.email.toLowerCase()}:${input.source}:${input.message}`]);
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id FROM contact_queries WHERE lower(email) = lower($1) AND source = $2 AND message = $3 AND submitted_at > now() - interval '10 minutes'
        ORDER BY submitted_at DESC LIMIT 1`,
      [input.email, input.source, input.message],
    );
    return rows[0]?.id ?? null;
  }

  async createQuery(input: ContactQueryInput, meta: { userId: string | null; ip: string | null }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO contact_queries (name, email, phone, sector, urgency, message, source, details, submitted_by_user_id, submitted_ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [input.name, input.email, input.phone, input.sector ?? input.details?.sector ?? null, input.urgency, input.message, input.source,
        input.details ? JSON.stringify(input.details) : null, meta.userId, meta.ip],
    );
    return rows[0]!.id;
  }

  async query(id: string, forUpdate = false) {
    const { rows } = await this.db.query<ContactQueryDto>(`${QUERY_DTO} WHERE q.id = $1 ${forUpdate ? 'FOR UPDATE OF q' : ''}`, [id]);
    return rows[0] ?? null;
  }

  async listQueries(f: { status?: ContactQueryStatus; search?: string; limit: number; offset: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.status) {
      params.push(f.status);
      where.push(`q.status = $${params.length}`);
    }
    if (f.search) {
      params.push(likePattern(f.search));
      where.push(`(q.name ILIKE $${params.length} OR q.email ILIKE $${params.length} OR q.reference ILIKE $${params.length} OR q.message ILIKE $${params.length})`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM contact_queries q ${w}`, params);
    const { rows } = await this.db.query<ContactQueryDto>(
      `${QUERY_DTO} ${w} ORDER BY (q.status = 'NEW') DESC, (q.urgency = 'EMERGENCY') DESC, q.submitted_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async updateQuery(id: string, p: { status?: ContactQueryStatus; adminNotes?: string; assignedAdminId?: string; convertedJobId?: string; convertedCustomerId?: string }) {
    await this.db.query(
      `UPDATE contact_queries SET status = COALESCE($2, status), admin_notes = COALESCE($3, admin_notes),
              assigned_admin_id = COALESCE($4, assigned_admin_id), converted_job_id = COALESCE($5, converted_job_id),
              converted_customer_id = COALESCE($6, converted_customer_id)
        WHERE id = $1`,
      [id, p.status ?? null, p.adminNotes ?? null, p.assignedAdminId ?? null, p.convertedJobId ?? null, p.convertedCustomerId ?? null],
    );
  }

  async newQueryCount() {
    const { rows } = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM contact_queries WHERE status = 'NEW'`);
    return rows[0]?.n ?? 0;
  }

  async upsertContact(c: { phone: string; name: string | null; email: string | null; source: string; linkedCustomerId: string | null }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO contacts (phone, name, email, source, linked_customer_id) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (phone) WHERE phone IS NOT NULL
       DO UPDATE SET name = COALESCE(contacts.name, EXCLUDED.name), linked_customer_id = COALESCE(contacts.linked_customer_id, EXCLUDED.linked_customer_id)
       RETURNING id`,
      [c.phone, c.name, c.email, c.source, c.linkedCustomerId],
    );
    return rows[0]!.id;
  }

  /** Returns null when this exact call was already logged (device re-sync / duplicate report). */
  async createMissedCall(m: { contactId: string; callAt: string; durationSeconds: number; source: string; deviceId?: string | null; reportedBy: string }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO missed_call_logs (contact_id, call_at, duration_seconds, source, device_id, reported_by)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (contact_id, call_at) DO NOTHING RETURNING id`,
      [m.contactId, m.callAt, m.durationSeconds, m.source, m.deviceId ?? null, m.reportedBy],
    );
    return rows[0]?.id ?? null;
  }

  async missedCall(id: string, forUpdate = false) {
    const { rows } = await this.db.query<MissedCallDto>(`${MISSED_DTO} WHERE mc.id = $1 ${forUpdate ? 'FOR UPDATE OF mc' : ''}`, [id]);
    return rows[0] ?? null;
  }

  async listMissedCalls(f: { status?: MissedCallStatus; limit: number; offset: number }) {
    const params: unknown[] = [];
    let w = '';
    if (f.status) {
      params.push(f.status);
      w = 'WHERE mc.status = $1';
    }
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM missed_call_logs mc ${w}`, params);
    const { rows } = await this.db.query<MissedCallDto>(
      `${MISSED_DTO} ${w} ORDER BY mc.call_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async updateMissedCall(id: string, p: { status?: MissedCallStatus; classification?: string; suggestedReply?: string }) {
    await this.db.query(
      `UPDATE missed_call_logs SET status = COALESCE($2, status), classification = COALESCE($3, classification),
              suggested_reply = COALESCE($4, suggested_reply) WHERE id = $1`,
      [id, p.status ?? null, p.classification ?? null, p.suggestedReply ?? null],
    );
  }

  async missedCallsToReview() {
    const { rows } = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM missed_call_logs WHERE status IN ('NEW','REVIEW_REQUIRED','FAILED')`);
    return rows[0]?.n ?? 0;
  }

  async logMessage(m: { missedCallId: string | null; channel: MessageChannel; recipient: string; content: string; status: DeliveryStatus; provider: string | null; providerMessageId: string | null; error: string | null; approvedBy: string | null }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO ai_message_logs (missed_call_id, channel, recipient, message_content, delivery_status, provider, provider_message_id, error_message, approved_by, sent_at)
       VALUES ($1,$2,$3,$4,$5::text,$6,$7,$8,$9, CASE WHEN $5::text IN ('SENT','DELIVERED') THEN now() END) RETURNING id`,
      [m.missedCallId, m.channel, m.recipient, m.content, m.status, m.provider, m.providerMessageId, m.error, m.approvedBy],
    );
    return rows[0]!.id;
  }

  async listMessages(f: { status?: DeliveryStatus; limit: number; offset: number }) {
    const params: unknown[] = [];
    let w = '';
    if (f.status) {
      params.push(f.status);
      w = 'WHERE m.delivery_status = $1';
    }
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ai_message_logs m ${w}`, params);
    const { rows } = await this.db.query<MessageLogDto>(
      `${MESSAGE_DTO} ${w} ORDER BY m.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }
}
