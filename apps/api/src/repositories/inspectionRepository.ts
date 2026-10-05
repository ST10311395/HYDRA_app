/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { ComplianceStatus, SubmitInspectionInput } from '@hydra/shared';
import type { Queryable } from '../db/pool';

export interface InspectionRow {
  id: string;
  jobId: string;
  jobReference: string;
  employeeName: string;
  inspectionDate: string;
  complianceStatus: ComplianceStatus;
  certificateNumber: string | null;
  findings: string;
  notes: string | null;
  checklist: { key: string; label: string; result: 'PASS' | 'FAIL' | 'NA'; reading?: string }[];
  signatureName: string;
  submittedAt: string;
  documentFileId: string | null;
  attachmentFileIds: string[];
  customerId: string;
  employeeId: string;
}

const SELECT = `
  SELECT ir.id, ir.job_id AS "jobId", j.reference AS "jobReference", TRIM(e.first_name || ' ' || e.last_name) AS "employeeName",
         ir.inspection_date AS "inspectionDate", ir.compliance_status AS "complianceStatus", ir.certificate_number AS "certificateNumber",
         ir.findings, ir.notes, ir.checklist, ir.signature_name AS "signatureName", ir.submitted_at AS "submittedAt",
         ir.document_file_id AS "documentFileId",
         COALESCE((SELECT array_agg(ia.file_id) FROM inspection_attachments ia WHERE ia.report_id = ir.id), '{}') AS "attachmentFileIds",
         j.customer_id AS "customerId", ir.employee_id AS "employeeId"
    FROM inspection_reports ir JOIN jobs j ON j.id = ir.job_id JOIN employees e ON e.id = ir.employee_id`;

export interface IInspectionRepository {
  insert(jobId: string, employeeId: string, input: SubmitInspectionInput): Promise<string>;
  findById(id: string): Promise<InspectionRow | null>;
  forJob(jobId: string): Promise<InspectionRow[]>;
  list(f: { customerId?: string; employeeId?: string; status?: ComplianceStatus; limit: number; offset: number }): Promise<{ items: InspectionRow[]; total: number }>;
}

export class PostgresInspectionRepository implements IInspectionRepository {
  constructor(private readonly db: Queryable) {}

  async insert(jobId: string, employeeId: string, input: SubmitInspectionInput) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO inspection_reports (job_id, employee_id, compliance_status, certificate_number, findings, notes, checklist, signature_name, document_file_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        jobId, employeeId, input.complianceStatus, input.certificateNumber ?? null, input.findings, input.notes ?? null,
        JSON.stringify(input.checklist), input.signatureName, input.documentId ?? null,
      ],
    );
    const id = rows[0]!.id;
    for (const fileId of input.attachmentIds) {
      await this.db.query('INSERT INTO inspection_attachments (report_id, file_id) VALUES ($1, $2)', [id, fileId]);
    }
    return id;
  }

  async findById(id: string) {
    const { rows } = await this.db.query<InspectionRow>(`${SELECT} WHERE ir.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async forJob(jobId: string) {
    const { rows } = await this.db.query<InspectionRow>(`${SELECT} WHERE ir.job_id = $1 ORDER BY ir.submitted_at DESC`, [jobId]);
    return rows;
  }

  async list(f: { customerId?: string; employeeId?: string; status?: ComplianceStatus; limit: number; offset: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.customerId) {
      params.push(f.customerId);
      where.push(`j.customer_id = $${params.length}`);
    }
    if (f.employeeId) {
      params.push(f.employeeId);
      where.push(`ir.employee_id = $${params.length}`);
    }
    if (f.status) {
      params.push(f.status);
      where.push(`ir.compliance_status = $${params.length}`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM inspection_reports ir JOIN jobs j ON j.id = ir.job_id ${w}`, params);
    const { rows } = await this.db.query<InspectionRow>(
      `${SELECT} ${w} ORDER BY ir.submitted_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }
}
