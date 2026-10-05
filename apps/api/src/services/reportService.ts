/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import PDFDocument from 'pdfkit';
import type { ExportRequestInput, ReportSummaryDto } from '@hydra/shared';
import { db, getPool, withTransaction } from '../db/pool';
import { PostgresAuditRepository } from '../repositories/auditRepository';
import { toCsv } from '../utils/csv';
import { addDays, businessDayStart } from '../utils/dates';
import { paginated } from '../utils/pagination';
import { audit, type Actor } from './auditService';

export async function reportSummary(from: string, to: string): Promise<ReportSummaryDto> {
  const start = businessDayStart(from);
  const end = businessDayStart(addDays(to, 1));
  const q = db();
  const one = async <T>(sql: string, params: unknown[] = [start, end]) => (await q.query<T & Record<string, unknown>>(sql, params)).rows[0] as T;
  const [rev, jobs, byStatus, byService, quotes, outstanding, mat, hours, payroll, enq] = await Promise.all([
    one<{ revenue: number; n: number }>(`SELECT COALESCE(SUM(amount),0)::float8 AS revenue, count(*)::int AS n FROM payments WHERE status='SUCCEEDED' AND paid_at >= $1 AND paid_at < $2`),
    one<{ created: number; completed: number }>(
      `SELECT count(*) FILTER (WHERE created_at >= $1 AND created_at < $2)::int AS created,
              count(*) FILTER (WHERE completed_at >= $1 AND completed_at < $2 AND status IN ('COMPLETED','INVOICED','PARTIALLY_PAID','PAID'))::int AS completed FROM jobs`,
    ),
    q.query<{ status: ReportSummaryDto['jobsByStatus'][number]['status']; count: number }>(
      `SELECT status, count(*)::int AS count FROM jobs WHERE created_at >= $1 AND created_at < $2 GROUP BY status ORDER BY count DESC`, [start, end]),
    q.query<{ serviceName: string; count: number }>(
      `SELECT st.name AS "serviceName", count(*)::int AS count FROM jobs j JOIN service_types st ON st.id = j.service_type_id
        WHERE j.created_at >= $1 AND j.created_at < $2 GROUP BY st.name ORDER BY count DESC`, [start, end]),
    one<{ avg: number; accepted: number; responded: number }>(
      `SELECT COALESCE(AVG(total),0)::float8 AS avg, count(*) FILTER (WHERE status='ACCEPTED')::int AS accepted,
              count(*) FILTER (WHERE status IN ('ACCEPTED','DECLINED'))::int AS responded
         FROM quotes WHERE created_at >= $1 AND created_at < $2 AND status <> 'DRAFT'`),
    one<{ amount: number }>(`SELECT COALESCE(SUM(amount_due),0)::float8 AS amount FROM invoices WHERE status IN ('SENT','PARTIALLY_PAID','OVERDUE')`, []),
    one<{ cost: number }>(`SELECT COALESCE(SUM(quantity_used*cost_at_time),0)::float8 AS cost FROM job_materials WHERE created_at >= $1 AND created_at < $2`),
    one<{ hours: number }>(`SELECT COALESCE(SUM(total_hours),0)::float8 AS hours FROM timesheets WHERE clock_in >= $1 AND clock_in < $2 AND status <> 'REJECTED'`),
    one<{ net: number }>(`SELECT COALESCE(SUM(net_pay),0)::float8 AS net FROM payrolls WHERE status='FINALISED' AND finalised_at >= $1 AND finalised_at < $2`),
    one<{ total: number; converted: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE status='CONVERTED')::int AS converted FROM contact_queries WHERE submitted_at >= $1 AND submitted_at < $2`),
  ]);
  return {
    from,
    to,
    revenue: rev.revenue,
    paymentsCount: rev.n,
    jobsCreated: jobs.created,
    jobsCompleted: jobs.completed,
    jobsByStatus: byStatus.rows,
    jobsByService: byService.rows,
    averageQuoteValue: Math.round(quotes.avg * 100) / 100,
    quoteAcceptanceRate: quotes.responded ? Math.round((quotes.accepted / quotes.responded) * 1000) / 10 : 0,
    outstandingAmount: outstanding.amount,
    materialsCost: Math.round(mat.cost * 100) / 100,
    labourHours: Math.round(hours.hours * 100) / 100,
    payrollNet: payroll.net,
    enquiries: enq.total,
    enquiryConversionRate: enq.total ? Math.round((enq.converted / enq.total) * 1000) / 10 : 0,
  };
}

interface Dataset {
  headers: string[];
  sql: string;
}

/** Export datasets: only the requested category and date range (PDF Story 21). No password hashes/tokens. */
const DATASETS: Record<ExportRequestInput['type'], Dataset> = {
  CUSTOMERS: {
    headers: ['Customer ID', 'First name', 'Last name', 'Email', 'Phone', 'Address', 'Marketing opt-in', 'Created'],
    sql: `SELECT c.id, c.first_name, c.last_name, u.email, c.phone, c.address, c.marketing_opt_in, c.created_at
            FROM customers c JOIN users u ON u.id = c.user_id WHERE c.created_at >= $1 AND c.created_at < $2 ORDER BY c.created_at`,
  },
  EMPLOYEES: {
    headers: ['Employee ID', 'Staff number', 'First name', 'Last name', 'Email', 'Phone', 'Certification', 'Specialisation', 'Hourly rate', 'Active', 'Created'],
    sql: `SELECT e.id, u.staff_number, e.first_name, e.last_name, u.email, e.phone, e.certification_no, e.specialisation, e.hourly_rate, e.is_active, e.created_at
            FROM employees e JOIN users u ON u.id = e.user_id WHERE e.created_at < $2 AND $1::timestamptz IS NOT NULL ORDER BY e.first_name`,
  },
  JOBS: {
    headers: ['Reference', 'Status', 'Urgency', 'Service', 'Customer', 'Electrician', 'Site address', 'Scheduled start', 'Completed', 'Materials cost', 'Created'],
    sql: `SELECT j.reference, j.status, j.urgency, st.name, c.first_name || ' ' || c.last_name, e.first_name || ' ' || e.last_name, j.site_address,
                 j.scheduled_start, j.completed_at, j.materials_cost, j.created_at
            FROM jobs j JOIN service_types st ON st.id = j.service_type_id JOIN customers c ON c.id = j.customer_id
            LEFT JOIN employees e ON e.id = j.electrician_id WHERE j.created_at >= $1 AND j.created_at < $2 ORDER BY j.created_at`,
  },
  INVOICES: {
    headers: ['Number', 'Job', 'Customer', 'Status', 'Subtotal', 'Materials adj.', 'VAT', 'Total', 'Discounts', 'Paid', 'Due', 'Invoice date', 'Due date'],
    sql: `SELECT i.number, j.reference, c.first_name || ' ' || c.last_name, i.status, i.subtotal, i.materials_adjustment, i.vat_amount, i.total,
                 i.discount_total, i.amount_paid, i.amount_due, i.invoice_date, i.due_date
            FROM invoices i JOIN jobs j ON j.id = i.job_id JOIN customers c ON c.id = i.customer_id
           WHERE i.created_at >= $1 AND i.created_at < $2 ORDER BY i.created_at`,
  },
  PAYMENTS: {
    headers: ['Payment ID', 'Invoice', 'Amount', 'Currency', 'Method', 'Provider', 'Reference', 'Status', 'Paid at', 'Created'],
    sql: `SELECT p.id, i.number, p.amount, p.currency, p.method, p.provider, p.provider_reference, p.status, p.paid_at, p.created_at
            FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.created_at >= $1 AND p.created_at < $2 ORDER BY p.created_at`,
  },
  TIMESHEETS: {
    headers: ['Employee', 'Work date', 'Clock in', 'Clock out', 'Hours', 'Status', 'Job'],
    sql: `SELECT e.first_name || ' ' || e.last_name, t.work_date, t.clock_in, t.clock_out, t.total_hours, t.status, j.reference
            FROM timesheets t JOIN employees e ON e.id = t.employee_id LEFT JOIN jobs j ON j.id = t.job_id
           WHERE t.clock_in >= $1 AND t.clock_in < $2 ORDER BY t.clock_in`,
  },
  PAYROLL: {
    headers: ['Employee', 'Period start', 'Period end', 'Hours', 'Rate', 'Gross', 'PAYE', 'UIF', 'Deductions', 'Net', 'Status', 'Correction of'],
    sql: `SELECT e.first_name || ' ' || e.last_name, p.period_start, p.period_end, p.total_hours, p.hourly_rate, p.gross_pay, p.paye, p.uif,
                 p.deductions, p.net_pay, p.status, p.corrects_payroll_id
            FROM payrolls p JOIN employees e ON e.id = p.employee_id WHERE p.created_at >= $1 AND p.created_at < $2 ORDER BY p.period_start`,
  },
  INVENTORY: {
    headers: ['SKU', 'Name', 'Unit', 'Unit cost', 'Stock', 'Reorder level', 'Low stock', 'Supplier', 'Archived', 'Movements in range'],
    sql: `SELECT m.sku, m.name, m.unit, m.unit_cost, m.stock_level, m.reorder_level, m.stock_level <= m.reorder_level, m.supplier_name, m.is_archived,
                 (SELECT count(*) FROM stock_movements sm WHERE sm.material_id = m.id AND sm.created_at >= $1 AND sm.created_at < $2)
            FROM materials m ORDER BY m.name`,
  },
  ENQUIRIES: {
    headers: ['Reference', 'Name', 'Email', 'Phone', 'Sector', 'Urgency', 'Source', 'Status', 'Submitted'],
    sql: `SELECT q.reference, q.name, q.email, q.phone, q.sector, q.urgency, q.source, q.status, q.submitted_at
            FROM contact_queries q WHERE q.submitted_at >= $1 AND q.submitted_at < $2 ORDER BY q.submitted_at`,
  },
};

function renderPdf(title: string, subtitle: string, headers: string[], rows: unknown[][]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(16).text(`PSG Electrical & Cables — ${title}`);
    doc.fontSize(9).fillColor('#555555').text(subtitle).moveDown();
    const colWidth = (doc.page.width - 72) / headers.length;
    const drawRow = (cells: unknown[], bold: boolean) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).fillColor('#000000');
      let maxH = 0;
      cells.forEach((c, i) => {
        const text = c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 16).replace('T', ' ') : String(c);
        const h = doc.heightOfString(text, { width: colWidth - 4 });
        doc.text(text, 36 + i * colWidth, y, { width: colWidth - 4 });
        maxH = Math.max(maxH, h);
      });
      doc.y = y + maxH + 4;
      if (doc.y > doc.page.height - 50) doc.addPage();
    };
    drawRow(headers, true);
    rows.forEach((r) => drawRow(r, false));
    doc.moveDown().fontSize(7).fillColor('#777777').text(`${rows.length} rows · Generated ${new Date().toISOString()} · Confidential — handle per POPIA`);
    doc.end();
  });
}

/** Owner-only export; the export event is written to DATA_EXPORT_LOG and the audit trail (spec rule 21). */
export async function exportData(input: ExportRequestInput, actor: Actor): Promise<{ fileName: string; contentType: string; body: Buffer; rowCount: number }> {
  const ds = DATASETS[input.type];
  const start = businessDayStart(input.from);
  const end = businessDayStart(addDays(input.to, 1));
  const { rows: data } = await getPool().query<unknown[]>({ text: ds.sql, values: [start, end], rowMode: 'array' });
  await withTransaction(async (tx) => {
    await new PostgresAuditRepository(tx).logExport({
      adminUserId: actor.userId!,
      exportType: input.type,
      format: input.format,
      filters: { from: input.from, to: input.to },
      rowCount: data.length,
    });
    await audit(tx, actor, 'DATA_EXPORTED', 'export', input.type, { format: input.format, from: input.from, to: input.to, rows: data.length });
  });
  const base = `hydra-${input.type.toLowerCase()}-${input.from}-to-${input.to}`;
  if (input.format === 'PDF') {
    return {
      fileName: `${base}.pdf`,
      contentType: 'application/pdf',
      body: await renderPdf(`${input.type.charAt(0)}${input.type.slice(1).toLowerCase()} report`, `${input.from} to ${input.to}`, ds.headers, data),
      rowCount: data.length,
    };
  }
  return { fileName: `${base}.csv`, contentType: 'text/csv; charset=utf-8', body: Buffer.from(toCsv(ds.headers, data), 'utf8'), rowCount: data.length };
}

export async function listExports(page: number, pageSize: number) {
  const { items, total } = await new PostgresAuditRepository(db()).listExports(pageSize, (page - 1) * pageSize);
  return paginated(items, page, pageSize, total);
}

export async function listAuditLogs(q: { action?: string; entityType?: string; actorUserId?: string; search?: string; page: number; pageSize: number }) {
  const { items, total } = await new PostgresAuditRepository(db()).list({ ...q, limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
  return paginated(items, q.page, q.pageSize, total);
}
