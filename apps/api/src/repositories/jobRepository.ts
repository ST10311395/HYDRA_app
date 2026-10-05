import type {
  AssignmentLogDto,
  CheckinDto,
  JobNoteDto,
  JobStatus,
  JobSummaryDto,
  JobUrgency,
  MilestoneDto,
} from '@hydra/shared';
import { MILESTONE_TEMPLATE } from '@hydra/shared';
import type { Queryable } from '../db/pool';
import { likePattern } from '../utils/pagination';

export interface JobRow {
  id: string;
  reference: string;
  customerId: string;
  customerUserId: string;
  serviceTypeId: string;
  serviceName: string;
  electricianId: string | null;
  electricianUserId: string | null;
  status: JobStatus;
  urgency: JobUrgency;
  source: string;
  siteAddress: string;
  siteLatitude: number | null;
  siteLongitude: number | null;
  description: string;
  contactPhone: string | null;
  preferredDate: string | null;
  preferredTimeWindow: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  completedAt: Date | null;
  cancelledReason: string | null;
  materialsCost: number;
  version: number;
  contactQueryId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewJob {
  customerId: string;
  serviceTypeId: string;
  siteAddress: string;
  siteLatitude?: number | null;
  siteLongitude?: number | null;
  description: string;
  urgency: JobUrgency;
  source: 'APP' | 'CONTACT_QUERY' | 'ADMIN' | 'MISSED_CALL' | 'AI_ASSESSMENT';
  contactPhone?: string | null;
  preferredDate?: string | null;
  preferredTimeWindow?: string;
  contactQueryId?: string | null;
  /** Smart Quote case the job came from (traceability). */
  aiConversationId?: string | null;
}

export interface JobListFilter {
  customerId?: string;
  electricianId?: string;
  statuses?: JobStatus[];
  serviceTypeId?: string;
  urgency?: JobUrgency;
  from?: string;
  to?: string;
  search?: string;
  sort: 'newest' | 'oldest' | 'scheduled';
  limit: number;
  offset: number;
}

const ROW_COLS = `
  j.id, j.reference, j.customer_id AS "customerId", c.user_id AS "customerUserId", j.service_type_id AS "serviceTypeId",
  st.name AS "serviceName", j.electrician_id AS "electricianId", e.user_id AS "electricianUserId", j.status, j.urgency,
  j.source, j.site_address AS "siteAddress", j.site_latitude AS "siteLatitude", j.site_longitude AS "siteLongitude",
  j.description, j.contact_phone AS "contactPhone", j.preferred_date AS "preferredDate",
  j.preferred_time_window AS "preferredTimeWindow", j.scheduled_start AS "scheduledStart", j.scheduled_end AS "scheduledEnd",
  j.completed_at AS "completedAt", j.cancelled_reason AS "cancelledReason", j.materials_cost AS "materialsCost",
  j.version, j.contact_query_id AS "contactQueryId", j.created_at AS "createdAt", j.updated_at AS "updatedAt"`;

const ROW_FROM = `
  FROM jobs j
  JOIN customers c ON c.id = j.customer_id
  JOIN service_types st ON st.id = j.service_type_id
  LEFT JOIN employees e ON e.id = j.electrician_id`;

export const SUMMARY_SELECT = `
  SELECT j.id, j.reference, j.status, j.urgency,
         json_build_object('id', st.id, 'name', st.name, 'category', st.category) AS "serviceType",
         j.site_address AS "siteAddress",
         json_build_object('id', c.id, 'name', TRIM(c.first_name || ' ' || c.last_name), 'phone', COALESCE(j.contact_phone, c.phone)) AS customer,
         CASE WHEN e.id IS NULL THEN NULL ELSE json_build_object('id', e.id, 'name', TRIM(e.first_name || ' ' || e.last_name), 'phone', e.phone) END AS electrician,
         j.scheduled_start AS "scheduledStart", j.scheduled_end AS "scheduledEnd", j.preferred_date AS "preferredDate",
         (SELECT m.name FROM job_milestones m WHERE m.job_id = j.id AND m.status = 'PENDING' ORDER BY m.sequence_order LIMIT 1) AS "nextMilestone",
         j.created_at AS "createdAt", j.updated_at AS "updatedAt"
    FROM jobs j
    JOIN customers c ON c.id = j.customer_id
    JOIN service_types st ON st.id = j.service_type_id
    LEFT JOIN employees e ON e.id = j.electrician_id`;

export interface IJobRepository {
  insert(job: NewJob): Promise<string>;
  findById(id: string, forUpdate?: boolean): Promise<JobRow | null>;
  summary(id: string): Promise<JobSummaryDto | null>;
  list(f: JobListFilter): Promise<{ items: JobSummaryDto[]; total: number }>;
  updateStatus(id: string, from: JobStatus, to: JobStatus, extra?: { completedAt?: Date; cancelledReason?: string }): Promise<boolean>;
  setAssignment(id: string, employeeId: string, start: string, end: string): Promise<void>;
  recordStatusHistory(jobId: string, from: JobStatus | null, to: JobStatus, event: string, actorUserId: string | null, note?: string): Promise<void>;
  createMilestones(jobId: string): Promise<void>;
  completeMilestonesByCode(jobId: string, codes: readonly string[], userId: string | null): Promise<void>;
  listMilestones(jobId: string): Promise<MilestoneDto[]>;
  addMilestone(jobId: string, m: { name: string; description?: string; plannedDate?: string }): Promise<MilestoneDto>;
  completeMilestone(jobId: string, milestoneId: string, userId: string): Promise<MilestoneDto | null>;
  createQrToken(jobId: string, hash: string, expiresAt: Date): Promise<void>;
  findQrToken(hash: string): Promise<{ id: string; jobId: string; expiresAt: Date; usedAt: Date | null } | null>;
  markQrTokenUsed(id: string): Promise<void>;
  confirmedCheckin(jobId: string): Promise<{ id: string; scannedAt: Date } | null>;
  insertCheckin(c: { jobId: string; employeeId: string; qrTokenId: string | null; method: 'QR' | 'ADMIN_OVERRIDE'; latitude: number | null; longitude: number | null; accuracy: number | null; confirmedBy: string | null; reason: string | null }): Promise<string>;
  listCheckins(jobId: string): Promise<CheckinDto[]>;
  addNote(jobId: string, authorUserId: string, body: string, visibility: 'INTERNAL' | 'CUSTOMER'): Promise<string>;
  listNotes(jobId: string, includeInternal: boolean): Promise<JobNoteDto[]>;
  addAttachment(jobId: string, fileId: string, uploadedBy: string): Promise<void>;
  attachmentFileIds(jobId: string): Promise<string[]>;
  logAssignment(a: { jobId: string; assignedBy: string; assignedTo: string; previousEmployeeId: string | null; start: string; end: string; notes?: string }): Promise<void>;
  listAssignments(jobId: string): Promise<AssignmentLogDto[]>;
  recalcMaterialsCost(jobId: string): Promise<number>;
}

export class PostgresJobRepository implements IJobRepository {
  constructor(private readonly db: Queryable) {}

  async insert(job: NewJob): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO jobs (customer_id, service_type_id, site_address, site_latitude, site_longitude, description, urgency, source,
                         contact_phone, preferred_date, preferred_time_window, contact_query_id, ai_conversation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        job.customerId, job.serviceTypeId, job.siteAddress, job.siteLatitude ?? null, job.siteLongitude ?? null, job.description,
        job.urgency, job.source, job.contactPhone ?? null, job.preferredDate ?? null, job.preferredTimeWindow ?? 'ANY', job.contactQueryId ?? null,
        job.aiConversationId ?? null,
      ],
    );
    return rows[0]!.id;
  }

  async findById(id: string, forUpdate = false) {
    const { rows } = await this.db.query<JobRow>(
      `SELECT ${ROW_COLS} ${ROW_FROM} WHERE j.id = $1 ${forUpdate ? 'FOR UPDATE OF j' : ''}`,
      [id],
    );
    return rows[0] ?? null;
  }

  async summary(id: string) {
    const { rows } = await this.db.query<JobSummaryDto>(`${SUMMARY_SELECT} WHERE j.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async list(f: JobListFilter) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: (n: number) => string, v: unknown) => {
      params.push(v);
      where.push(sql(params.length));
    };
    if (f.customerId) add((n) => `j.customer_id = $${n}`, f.customerId);
    if (f.electricianId) add((n) => `j.electrician_id = $${n}`, f.electricianId);
    if (f.statuses?.length) add((n) => `j.status = ANY($${n}::text[])`, f.statuses);
    if (f.serviceTypeId) add((n) => `j.service_type_id = $${n}`, f.serviceTypeId);
    if (f.urgency) add((n) => `j.urgency = $${n}`, f.urgency);
    if (f.from) add((n) => `COALESCE(j.scheduled_start, j.created_at) >= ($${n}::date - interval '2 hours')`, f.from);
    if (f.to) add((n) => `COALESCE(j.scheduled_start, j.created_at) < ($${n}::date + interval '1 day' - interval '2 hours')`, f.to);
    if (f.search) {
      add(
        (n) => `(j.reference ILIKE $${n} OR j.site_address ILIKE $${n} OR st.name ILIKE $${n} OR (c.first_name || ' ' || c.last_name) ILIKE $${n})`,
        likePattern(f.search),
      );
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const order =
      f.sort === 'oldest' ? 'j.created_at ASC' : f.sort === 'scheduled' ? 'j.scheduled_start ASC NULLS LAST, j.created_at DESC' : 'j.created_at DESC';
    const count = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM jobs j JOIN customers c ON c.id = j.customer_id JOIN service_types st ON st.id = j.service_type_id ${w}`,
      params,
    );
    const { rows } = await this.db.query<JobSummaryDto>(
      `${SUMMARY_SELECT} ${w} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: count.rows[0]?.n ?? 0 };
  }

  /** Optimistic transition: only succeeds if the row is still in the expected `from` status. */
  async updateStatus(id: string, from: JobStatus, to: JobStatus, extra: { completedAt?: Date; cancelledReason?: string } = {}) {
    const r = await this.db.query(
      `UPDATE jobs SET status = $3, version = version + 1,
              completed_at = COALESCE($4, completed_at), cancelled_reason = COALESCE($5, cancelled_reason)
        WHERE id = $1 AND status = $2`,
      [id, from, to, extra.completedAt ?? null, extra.cancelledReason ?? null],
    );
    return (r.rowCount ?? 0) === 1;
  }

  async setAssignment(id: string, employeeId: string, start: string, end: string) {
    await this.db.query(
      'UPDATE jobs SET electrician_id = $2, scheduled_start = $3, scheduled_end = $4, version = version + 1 WHERE id = $1',
      [id, employeeId, start, end],
    );
  }

  async recordStatusHistory(jobId: string, from: JobStatus | null, to: JobStatus, event: string, actorUserId: string | null, note?: string) {
    await this.db.query(
      'INSERT INTO job_status_history (job_id, from_status, to_status, event, actor_user_id, note) VALUES ($1,$2,$3,$4,$5,$6)',
      [jobId, from, to, event, actorUserId, note ?? null],
    );
  }

  async createMilestones(jobId: string) {
    const codes = MILESTONE_TEMPLATE.map((m) => m.code);
    const names = MILESTONE_TEMPLATE.map((m) => m.name);
    const descs = MILESTONE_TEMPLATE.map((m) => m.description);
    await this.db.query(
      `INSERT INTO job_milestones (job_id, code, name, description, sequence_order)
       SELECT $1, code, name, description, (ord * 10)::int
         FROM unnest($2::text[], $3::text[], $4::text[]) WITH ORDINALITY AS t(code, name, description, ord)`,
      [jobId, codes, names, descs],
    );
  }

  async completeMilestonesByCode(jobId: string, codes: readonly string[], userId: string | null) {
    if (!codes.length) return;
    await this.db.query(
      `UPDATE job_milestones SET status = 'COMPLETED', completed_at = now(), completed_by = $3
        WHERE job_id = $1 AND code = ANY($2::text[]) AND status = 'PENDING'`,
      [jobId, [...codes], userId],
    );
  }

  async listMilestones(jobId: string) {
    const { rows } = await this.db.query<MilestoneDto>(
      `SELECT id, code, name, description, status, sequence_order AS "sequenceOrder", planned_date AS "plannedDate",
              completed_at AS "completedAt"
         FROM job_milestones WHERE job_id = $1 ORDER BY sequence_order, name`,
      [jobId],
    );
    return rows;
  }

  /** Custom on-site milestones are slotted between "In Progress" (70) and "Inspection" (80). */
  async addMilestone(jobId: string, m: { name: string; description?: string; plannedDate?: string }) {
    const { rows } = await this.db.query<MilestoneDto>(
      `INSERT INTO job_milestones (job_id, name, description, planned_date, sequence_order)
       VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sequence_order) FILTER (WHERE sequence_order > 70 AND sequence_order < 80), 70) + 1
                                  FROM job_milestones WHERE job_id = $1))
       RETURNING id, code, name, description, status, sequence_order AS "sequenceOrder", planned_date AS "plannedDate", completed_at AS "completedAt"`,
      [jobId, m.name, m.description ?? null, m.plannedDate ?? null],
    );
    return rows[0]!;
  }

  async completeMilestone(jobId: string, milestoneId: string, userId: string) {
    const { rows } = await this.db.query<MilestoneDto>(
      `UPDATE job_milestones SET status = 'COMPLETED', completed_at = now(), completed_by = $3
        WHERE id = $2 AND job_id = $1 AND status = 'PENDING'
        RETURNING id, code, name, description, status, sequence_order AS "sequenceOrder", planned_date AS "plannedDate", completed_at AS "completedAt"`,
      [jobId, milestoneId, userId],
    );
    return rows[0] ?? null;
  }

  async createQrToken(jobId: string, hash: string, expiresAt: Date) {
    // Rotation: any older unused token for this job is expired immediately.
    await this.db.query(`UPDATE job_qr_tokens SET expires_at = LEAST(expires_at, now()) WHERE job_id = $1 AND used_at IS NULL`, [jobId]);
    await this.db.query('INSERT INTO job_qr_tokens (job_id, token_hash, expires_at) VALUES ($1, $2, $3)', [jobId, hash, expiresAt]);
  }

  async findQrToken(hash: string) {
    const { rows } = await this.db.query<{ id: string; jobId: string; expiresAt: Date; usedAt: Date | null }>(
      `SELECT id, job_id AS "jobId", expires_at AS "expiresAt", used_at AS "usedAt" FROM job_qr_tokens WHERE token_hash = $1 FOR UPDATE`,
      [hash],
    );
    return rows[0] ?? null;
  }

  async markQrTokenUsed(id: string) {
    await this.db.query('UPDATE job_qr_tokens SET used_at = now() WHERE id = $1', [id]);
  }

  async confirmedCheckin(jobId: string) {
    const { rows } = await this.db.query<{ id: string; scannedAt: Date }>(
      `SELECT id, scanned_at AS "scannedAt" FROM job_checkins WHERE job_id = $1 AND status = 'CONFIRMED'`,
      [jobId],
    );
    return rows[0] ?? null;
  }

  async insertCheckin(c: { jobId: string; employeeId: string; qrTokenId: string | null; method: 'QR' | 'ADMIN_OVERRIDE'; latitude: number | null; longitude: number | null; accuracy: number | null; confirmedBy: string | null; reason: string | null }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO job_checkins (job_id, employee_id, qr_token_id, method, latitude, longitude, accuracy_m, confirmed_by, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [c.jobId, c.employeeId, c.qrTokenId, c.method, c.latitude, c.longitude, c.accuracy, c.confirmedBy, c.reason],
    );
    return rows[0]!.id;
  }

  async listCheckins(jobId: string) {
    const { rows } = await this.db.query<CheckinDto>(
      `SELECT ck.id, TRIM(e.first_name || ' ' || e.last_name) AS "employeeName", ck.method, ck.scanned_at AS "scannedAt",
              ck.latitude, ck.longitude, ck.accuracy_m AS accuracy
         FROM job_checkins ck JOIN employees e ON e.id = ck.employee_id
        WHERE ck.job_id = $1 AND ck.status = 'CONFIRMED' ORDER BY ck.scanned_at`,
      [jobId],
    );
    return rows;
  }

  async addNote(jobId: string, authorUserId: string, body: string, visibility: 'INTERNAL' | 'CUSTOMER') {
    const { rows } = await this.db.query<{ id: string }>(
      'INSERT INTO job_notes (job_id, author_user_id, body, visibility) VALUES ($1,$2,$3,$4) RETURNING id',
      [jobId, authorUserId, body, visibility],
    );
    return rows[0]!.id;
  }

  async listNotes(jobId: string, includeInternal: boolean) {
    const { rows } = await this.db.query<JobNoteDto>(
      `SELECT n.id, TRIM(COALESCE(c.first_name, e.first_name, a.first_name, '') || ' ' || COALESCE(c.last_name, e.last_name, a.last_name, '')) AS "authorName",
              u.role AS "authorRole", n.body, n.visibility, n.created_at AS "createdAt"
         FROM job_notes n JOIN users u ON u.id = n.author_user_id
         LEFT JOIN customers c ON c.user_id = u.id LEFT JOIN employees e ON e.user_id = u.id LEFT JOIN admins a ON a.user_id = u.id
        WHERE n.job_id = $1 ${includeInternal ? '' : `AND n.visibility = 'CUSTOMER'`}
        ORDER BY n.created_at`,
      [jobId],
    );
    return rows;
  }

  async addAttachment(jobId: string, fileId: string, uploadedBy: string) {
    await this.db.query('INSERT INTO job_attachments (job_id, file_id, uploaded_by) VALUES ($1,$2,$3)', [jobId, fileId, uploadedBy]);
    await this.db.query('UPDATE files SET attached = true WHERE id = $1', [fileId]);
  }

  async attachmentFileIds(jobId: string) {
    const { rows } = await this.db.query<{ fileId: string }>('SELECT file_id AS "fileId" FROM job_attachments WHERE job_id = $1 ORDER BY created_at', [jobId]);
    return rows.map((r) => r.fileId);
  }

  async logAssignment(a: { jobId: string; assignedBy: string; assignedTo: string; previousEmployeeId: string | null; start: string; end: string; notes?: string }) {
    await this.db.query(
      `INSERT INTO job_assignments (job_id, assigned_by, assigned_to, previous_employee_id, scheduled_start, scheduled_end, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [a.jobId, a.assignedBy, a.assignedTo, a.previousEmployeeId, a.start, a.end, a.notes ?? null],
    );
  }

  async listAssignments(jobId: string) {
    const { rows } = await this.db.query<AssignmentLogDto>(
      `SELECT ja.id, TRIM(e.first_name || ' ' || e.last_name) AS "assignedToName",
              TRIM(COALESCE(a.first_name, '') || ' ' || COALESCE(a.last_name, '')) AS "assignedByName", ja.notes, ja.created_at AS "createdAt"
         FROM job_assignments ja JOIN employees e ON e.id = ja.assigned_to LEFT JOIN admins a ON a.user_id = ja.assigned_by
        WHERE ja.job_id = $1 ORDER BY ja.created_at`,
      [jobId],
    );
    return rows;
  }

  async clearCompletedAt(jobId: string) {
    await this.db.query('UPDATE jobs SET completed_at = NULL WHERE id = $1', [jobId]);
  }

  async recalcMaterialsCost(jobId: string) {
    const { rows } = await this.db.query<{ cost: number }>(
      `UPDATE jobs SET materials_cost = COALESCE((SELECT ROUND(SUM(quantity_used * cost_at_time), 2) FROM job_materials WHERE job_id = $1), 0)
        WHERE id = $1 RETURNING materials_cost AS cost`,
      [jobId],
    );
    return rows[0]?.cost ?? 0;
  }
}
