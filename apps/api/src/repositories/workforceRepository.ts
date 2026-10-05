/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type {
  CustomerDto,
  EmployeeDto,
  LeaveRequestDto,
  LeaveStatus,
  LeaveType,
  PayrollDto,
  PayrollStatus,
  ScheduleEventDto,
  ScheduleEventType,
  TimesheetDto,
  TimesheetStatus,
} from '@hydra/shared';
import type { Queryable } from '../db/pool';
import { likePattern } from '../utils/pagination';

export interface Conflict {
  type: 'JOB' | 'LEAVE' | 'EVENT';
  title: string;
  startAt: string;
  endAt: string;
}

export interface EmployeeRow {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  hourlyRate: number;
  taxRate: number;
  isActive: boolean;
}

const EMPLOYEE_DTO = `
  SELECT e.id, e.user_id AS "userId", u.staff_number AS "staffNumber", e.first_name AS "firstName", e.last_name AS "lastName",
         u.email, e.phone, e.certification_no AS "certificationNo", e.specialisation, e.hourly_rate AS "hourlyRate",
         e.tax_rate AS "taxRate", (e.is_active AND u.status = 'ACTIVE') AS "isActive",
         EXISTS (SELECT 1 FROM timesheets t WHERE t.employee_id = e.id AND t.clock_out IS NULL) AS "clockedIn",
         EXISTS (SELECT 1 FROM leave_requests l WHERE l.employee_id = e.id AND l.status = 'APPROVED'
                   AND (now() AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN l.start_date AND l.end_date) AS "onLeaveToday",
         (SELECT count(*)::int FROM jobs j WHERE j.electrician_id = e.id AND j.status IN ('SCHEDULED','IN_PROGRESS','INSPECTION_PENDING')) AS "activeJobCount"
    FROM employees e JOIN users u ON u.id = e.user_id`;

const TIMESHEET_DTO = `
  SELECT t.id, t.employee_id AS "employeeId", TRIM(e.first_name || ' ' || e.last_name) AS "employeeName", t.job_id AS "jobId",
         j.reference AS "jobReference", t.work_date AS "workDate", t.clock_in AS "clockIn", t.clock_out AS "clockOut",
         t.total_hours AS "totalHours", t.status, t.notes, t.payroll_id AS "payrollId"
    FROM timesheets t JOIN employees e ON e.id = t.employee_id LEFT JOIN jobs j ON j.id = t.job_id`;

const LEAVE_DTO = `
  SELECT l.id, l.employee_id AS "employeeId", TRIM(e.first_name || ' ' || e.last_name) AS "employeeName", l.leave_type AS "leaveType",
         l.start_date AS "startDate", l.end_date AS "endDate", (l.end_date - l.start_date + 1) AS days, l.reason, l.status,
         NULLIF(TRIM(COALESCE(a.first_name, '') || ' ' || COALESCE(a.last_name, '')), '') AS "decidedByName",
         l.decided_at AS "decidedAt", l.decision_note AS "decisionNote", l.created_at AS "createdAt"
    FROM leave_requests l JOIN employees e ON e.id = l.employee_id LEFT JOIN admins a ON a.user_id = l.approved_by`;

const PAYROLL_DTO = `
  SELECT p.id, p.employee_id AS "employeeId", TRIM(e.first_name || ' ' || e.last_name) AS "employeeName",
         p.period_start AS "periodStart", p.period_end AS "periodEnd", p.total_hours AS "totalHours", p.hourly_rate AS "hourlyRate",
         p.gross_pay AS "grossPay", p.deductions, p.net_pay AS "netPay", p.status,
         TRIM(COALESCE(pa.first_name, '') || ' ' || COALESCE(pa.last_name, '')) AS "processedByName",
         NULLIF(TRIM(COALESCE(aa.first_name, '') || ' ' || COALESCE(aa.last_name, '')), '') AS "approvedByName",
         p.processed_date AS "processedDate", p.finalised_at AS "finalisedAt", p.corrects_payroll_id AS "correctsPayrollId",
         p.correction_reason AS "correctionReason",
         (SELECT count(*)::int FROM payroll_items pi WHERE pi.payroll_id = p.id) AS "timesheetCount"
    FROM payrolls p JOIN employees e ON e.id = p.employee_id
    LEFT JOIN admins pa ON pa.user_id = p.processed_by LEFT JOIN admins aa ON aa.user_id = p.approved_by`;

export interface IWorkforceRepository {
  // employees & customers
  employee(id: string): Promise<EmployeeRow | null>;
  employeeByUser(userId: string): Promise<EmployeeRow | null>;
  employeeDto(id: string): Promise<EmployeeDto | null>;
  listEmployees(f: { search?: string; activeOnly?: boolean }): Promise<EmployeeDto[]>;
  updateEmployee(id: string, p: { certificationNo?: string; specialisation?: string; hourlyRate?: number; taxRate?: number; isActive?: boolean }): Promise<void>;
  listCustomers(f: { search?: string; limit: number; offset: number }): Promise<{ items: CustomerDto[]; total: number }>;
  customerDto(id: string): Promise<CustomerDto | null>;
  // schedule
  conflicts(employeeId: string, start: string, end: string, excludeJobId?: string): Promise<Conflict[]>;
  upsertJobEvent(employeeId: string, jobId: string, title: string, start: string, end: string, createdBy: string): Promise<void>;
  deleteJobEvent(jobId: string): Promise<void>;
  createEvent(e: { employeeId: string; eventType: ScheduleEventType; title: string; startAt: string; endAt: string; notes?: string; createdBy: string; leaveRequestId?: string }): Promise<string>;
  deleteEvent(id: string): Promise<{ employeeId: string; eventType: string } | null>;
  listEvents(f: { employeeId?: string; from: Date; to: Date }): Promise<ScheduleEventDto[]>;
  // timesheets
  openShift(employeeId: string): Promise<TimesheetDto | null>;
  clockIn(employeeId: string, jobId: string | null, workDate: string, notes?: string): Promise<string>;
  clockOut(id: string, hours: number, notes?: string): Promise<void>;
  timesheet(id: string, forUpdate?: boolean): Promise<TimesheetDto | null>;
  listTimesheets(f: { employeeId?: string; status?: TimesheetStatus; from?: string; to?: string; limit: number; offset: number }): Promise<{ items: TimesheetDto[]; total: number }>;
  reviewTimesheet(id: string, status: 'CONFIRMED' | 'REJECTED', reviewer: string, note?: string): Promise<boolean>;
  hoursOn(employeeId: string, workDate: string): Promise<number>;
  clockedInCount(): Promise<number>;
  // leave
  createLeave(employeeId: string, l: { leaveType: LeaveType; startDate: string; endDate: string; reason: string }): Promise<string>;
  leave(id: string, forUpdate?: boolean): Promise<LeaveRequestDto | null>;
  listLeave(f: { employeeId?: string; status?: LeaveStatus; limit: number; offset: number }): Promise<{ items: LeaveRequestDto[]; total: number }>;
  overlappingLeave(employeeId: string, startDate: string, endDate: string): Promise<LeaveRequestDto[]>;
  decideLeave(id: string, status: LeaveStatus, approver: string | null, note?: string): Promise<boolean>;
  pendingLeaveCount(): Promise<number>;
  // payroll
  payableTimesheets(employeeId: string, start: string, end: string): Promise<{ id: string; totalHours: number; jobId: string | null; invoiceStatus: string | null }[]>;
  regularPayrollExists(employeeId: string, start: string, end: string): Promise<boolean>;
  createPayroll(p: { employeeId: string; periodStart: string; periodEnd: string; totalHours: number; hourlyRate: number; grossPay: number; paye: number; uif: number; deductions: number; netPay: number; processedBy: string; correctsPayrollId?: string | null; correctionReason?: string | null }): Promise<string>;
  attachTimesheets(payrollId: string, items: { timesheetId: string; hours: number; amount: number }[]): Promise<void>;
  payroll(id: string, forUpdate?: boolean): Promise<PayrollDto | null>;
  listPayrolls(f: { employeeId?: string; status?: PayrollStatus; limit: number; offset: number }): Promise<{ items: PayrollDto[]; total: number }>;
  setPayrollStatus(id: string, status: PayrollStatus, userId: string): Promise<void>;
  deleteDraftPayroll(id: string): Promise<void>;
  markPayrollTimesheetsPaid(payrollId: string): Promise<void>;
}

export class PostgresWorkforceRepository implements IWorkforceRepository {
  constructor(private readonly db: Queryable) {}

  private async employeeWhere(where: string, v: string) {
    const { rows } = await this.db.query<EmployeeRow>(
      `SELECT e.id, e.user_id AS "userId", e.first_name AS "firstName", e.last_name AS "lastName", e.hourly_rate AS "hourlyRate",
              e.tax_rate AS "taxRate", (e.is_active AND u.status = 'ACTIVE') AS "isActive"
         FROM employees e JOIN users u ON u.id = e.user_id WHERE ${where}`,
      [v],
    );
    return rows[0] ?? null;
  }

  employee(id: string) {
    return this.employeeWhere('e.id = $1', id);
  }

  employeeByUser(userId: string) {
    return this.employeeWhere('e.user_id = $1', userId);
  }

  async employeeDto(id: string) {
    const { rows } = await this.db.query<EmployeeDto>(`${EMPLOYEE_DTO} WHERE e.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async listEmployees(f: { search?: string; activeOnly?: boolean }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.activeOnly) where.push(`e.is_active AND u.status = 'ACTIVE'`);
    if (f.search) {
      params.push(likePattern(f.search));
      where.push(`((e.first_name || ' ' || e.last_name) ILIKE $1 OR e.specialisation ILIKE $1 OR u.staff_number ILIKE $1)`);
    }
    const { rows } = await this.db.query<EmployeeDto>(
      `${EMPLOYEE_DTO} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.first_name, e.last_name`,
      params,
    );
    return rows;
  }

  async updateEmployee(id: string, p: { certificationNo?: string; specialisation?: string; hourlyRate?: number; taxRate?: number; isActive?: boolean }) {
    const map: Record<string, string> = {
      certificationNo: 'certification_no', specialisation: 'specialisation', hourlyRate: 'hourly_rate', taxRate: 'tax_rate', isActive: 'is_active',
    };
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const [k, col] of Object.entries(map)) {
      const v = (p as Record<string, unknown>)[k];
      if (v !== undefined) {
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (sets.length) await this.db.query(`UPDATE employees SET ${sets.join(', ')} WHERE id = $1`, params);
  }

  async listCustomers(f: { search?: string; limit: number; offset: number }) {
    const params: unknown[] = [];
    let w = '';
    if (f.search) {
      params.push(likePattern(f.search));
      w = `WHERE ((c.first_name || ' ' || c.last_name) ILIKE $1 OR u.email ILIKE $1 OR c.phone ILIKE $1)`;
    }
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM customers c JOIN users u ON u.id = c.user_id ${w}`, params);
    const { rows } = await this.db.query<CustomerDto>(
      `${CUSTOMER_DTO} ${w} ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async customerDto(id: string) {
    const { rows } = await this.db.query<CustomerDto>(`${CUSTOMER_DTO} WHERE c.id = $1`, [id]);
    return rows[0] ?? null;
  }

  /** Overlapping jobs/events and approved leave for an employee in [start, end) — PDF Fig. 12 ConflictCheck. */
  async conflicts(employeeId: string, start: string, end: string, excludeJobId?: string) {
    const { rows } = await this.db.query<Conflict>(
      `SELECT CASE WHEN s.event_type = 'JOB' THEN 'JOB' WHEN s.event_type = 'LEAVE' THEN 'LEAVE' ELSE 'EVENT' END AS type,
              s.title, s.start_at AS "startAt", s.end_at AS "endAt"
         FROM employee_schedules s
        WHERE s.employee_id = $1 AND tstzrange(s.start_at, s.end_at) && tstzrange($2::timestamptz, $3::timestamptz)
          AND ($4::uuid IS NULL OR s.job_id IS DISTINCT FROM $4::uuid)
       UNION ALL
       SELECT 'LEAVE', 'Approved ' || lower(l.leave_type) || ' leave', l.start_date::timestamptz, (l.end_date + 1)::timestamptz
         FROM leave_requests l
        WHERE l.employee_id = $1 AND l.status = 'APPROVED'
          AND daterange(l.start_date, l.end_date, '[]') && daterange(($2::timestamptz AT TIME ZONE 'Africa/Johannesburg')::date,
                                                                     ($3::timestamptz AT TIME ZONE 'Africa/Johannesburg')::date, '[]')
          AND NOT EXISTS (SELECT 1 FROM employee_schedules s2 WHERE s2.leave_request_id = l.id)`,
      [employeeId, start, end, excludeJobId ?? null],
    );
    return rows.map((r) => ({ ...r, startAt: new Date(r.startAt).toISOString(), endAt: new Date(r.endAt).toISOString() }));
  }

  async upsertJobEvent(employeeId: string, jobId: string, title: string, start: string, end: string, createdBy: string) {
    await this.db.query(
      `INSERT INTO employee_schedules (employee_id, job_id, event_type, title, start_at, end_at, created_by)
       VALUES ($1, $2, 'JOB', $3, $4, $5, $6)
       ON CONFLICT (job_id) WHERE event_type = 'JOB'
       DO UPDATE SET employee_id = EXCLUDED.employee_id, title = EXCLUDED.title, start_at = EXCLUDED.start_at, end_at = EXCLUDED.end_at`,
      [employeeId, jobId, title, start, end, createdBy],
    );
  }

  async deleteJobEvent(jobId: string) {
    await this.db.query(`DELETE FROM employee_schedules WHERE job_id = $1 AND event_type = 'JOB'`, [jobId]);
  }

  async createEvent(e: { employeeId: string; eventType: ScheduleEventType; title: string; startAt: string; endAt: string; notes?: string; createdBy: string; leaveRequestId?: string }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO employee_schedules (employee_id, event_type, title, start_at, end_at, notes, created_by, leave_request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [e.employeeId, e.eventType, e.title, e.startAt, e.endAt, e.notes ?? null, e.createdBy, e.leaveRequestId ?? null],
    );
    return rows[0]!.id;
  }

  async deleteEvent(id: string) {
    const { rows } = await this.db.query<{ employeeId: string; eventType: string }>(
      `DELETE FROM employee_schedules WHERE id = $1 AND event_type NOT IN ('JOB','LEAVE') RETURNING employee_id AS "employeeId", event_type AS "eventType"`,
      [id],
    );
    return rows[0] ?? null;
  }

  async listEvents(f: { employeeId?: string; from: Date; to: Date }) {
    const params: unknown[] = [f.from, f.to];
    let w = '';
    if (f.employeeId) {
      params.push(f.employeeId);
      w = 'AND s.employee_id = $3';
    }
    const { rows } = await this.db.query<ScheduleEventDto>(
      `SELECT s.id, s.employee_id AS "employeeId", TRIM(e.first_name || ' ' || e.last_name) AS "employeeName", s.event_type AS "eventType",
              s.title, s.start_at AS "startAt", s.end_at AS "endAt", s.notes,
              CASE WHEN j.id IS NULL THEN NULL ELSE json_build_object('id', j.id, 'reference', j.reference, 'status', j.status,
                   'siteAddress', j.site_address, 'serviceName', st.name) END AS job
         FROM employee_schedules s JOIN employees e ON e.id = s.employee_id
         LEFT JOIN jobs j ON j.id = s.job_id LEFT JOIN service_types st ON st.id = j.service_type_id
        WHERE tstzrange(s.start_at, s.end_at) && tstzrange($1, $2) ${w}
          AND (j.id IS NULL OR j.status NOT IN ('CANCELLED'))
        ORDER BY s.start_at`,
      params,
    );
    return rows;
  }

  async openShift(employeeId: string) {
    const { rows } = await this.db.query<TimesheetDto>(`${TIMESHEET_DTO} WHERE t.employee_id = $1 AND t.clock_out IS NULL`, [employeeId]);
    return rows[0] ?? null;
  }

  async clockIn(employeeId: string, jobId: string | null, workDate: string, notes?: string) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO timesheets (employee_id, job_id, work_date, clock_in, notes) VALUES ($1,$2,$3, now(), $4) RETURNING id`,
      [employeeId, jobId, workDate, notes ?? null],
    );
    return rows[0]!.id;
  }

  async clockOut(id: string, hours: number, notes?: string) {
    await this.db.query(
      `UPDATE timesheets SET clock_out = now(), total_hours = $2, status = 'SUBMITTED',
              notes = CASE WHEN $3::text IS NULL THEN notes ELSE TRIM(COALESCE(notes || E'\\n', '') || $3::text) END
        WHERE id = $1 AND clock_out IS NULL`,
      [id, hours, notes ?? null],
    );
  }

  async timesheet(id: string, forUpdate = false) {
    const { rows } = await this.db.query<TimesheetDto>(`${TIMESHEET_DTO} WHERE t.id = $1 ${forUpdate ? 'FOR UPDATE OF t' : ''}`, [id]);
    return rows[0] ?? null;
  }

  async listTimesheets(f: { employeeId?: string; status?: TimesheetStatus; from?: string; to?: string; limit: number; offset: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: (n: number) => string, v: unknown) => {
      params.push(v);
      where.push(sql(params.length));
    };
    if (f.employeeId) add((n) => `t.employee_id = $${n}`, f.employeeId);
    if (f.status) add((n) => `t.status = $${n}`, f.status);
    if (f.from) add((n) => `t.work_date >= $${n}`, f.from);
    if (f.to) add((n) => `t.work_date <= $${n}`, f.to);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM timesheets t ${w}`, params);
    const { rows } = await this.db.query<TimesheetDto>(
      `${TIMESHEET_DTO} ${w} ORDER BY t.clock_in DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async reviewTimesheet(id: string, status: 'CONFIRMED' | 'REJECTED', reviewer: string, note?: string) {
    const r = await this.db.query(
      `UPDATE timesheets SET status = $2, reviewed_by = $3, reviewed_at = now(),
              notes = CASE WHEN $4::text IS NULL THEN notes ELSE TRIM(COALESCE(notes || E'\\n', '') || 'Review: ' || $4::text) END
        WHERE id = $1 AND status IN ('SUBMITTED', 'CONFIRMED', 'REJECTED') AND payroll_id IS NULL`,
      [id, status, reviewer, note ?? null],
    );
    return (r.rowCount ?? 0) === 1;
  }

  async hoursOn(employeeId: string, workDate: string) {
    const { rows } = await this.db.query<{ h: number }>(
      `SELECT COALESCE(SUM(COALESCE(total_hours, EXTRACT(EPOCH FROM (now() - clock_in)) / 3600)), 0)::float8 AS h
         FROM timesheets WHERE employee_id = $1 AND work_date = $2`,
      [employeeId, workDate],
    );
    return Math.round((rows[0]?.h ?? 0) * 100) / 100;
  }

  async clockedInCount() {
    const { rows } = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM timesheets WHERE clock_out IS NULL');
    return rows[0]?.n ?? 0;
  }

  async createLeave(employeeId: string, l: { leaveType: LeaveType; startDate: string; endDate: string; reason: string }) {
    const { rows } = await this.db.query<{ id: string }>(
      'INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [employeeId, l.leaveType, l.startDate, l.endDate, l.reason],
    );
    return rows[0]!.id;
  }

  async leave(id: string, forUpdate = false) {
    const { rows } = await this.db.query<LeaveRequestDto>(`${LEAVE_DTO} WHERE l.id = $1 ${forUpdate ? 'FOR UPDATE OF l' : ''}`, [id]);
    return rows[0] ?? null;
  }

  async listLeave(f: { employeeId?: string; status?: LeaveStatus; limit: number; offset: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.employeeId) {
      params.push(f.employeeId);
      where.push(`l.employee_id = $${params.length}`);
    }
    if (f.status) {
      params.push(f.status);
      where.push(`l.status = $${params.length}`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM leave_requests l ${w}`, params);
    const { rows } = await this.db.query<LeaveRequestDto>(
      `${LEAVE_DTO} ${w} ORDER BY (l.status = 'PENDING') DESC, l.start_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async overlappingLeave(employeeId: string, startDate: string, endDate: string) {
    const { rows } = await this.db.query<LeaveRequestDto>(
      `${LEAVE_DTO} WHERE l.employee_id = $1 AND l.status IN ('PENDING','APPROVED')
         AND daterange(l.start_date, l.end_date, '[]') && daterange($2::date, $3::date, '[]')`,
      [employeeId, startDate, endDate],
    );
    return rows;
  }

  async decideLeave(id: string, status: LeaveStatus, approver: string | null, note?: string) {
    const r = await this.db.query(
      `UPDATE leave_requests SET status = $2, approved_by = COALESCE($3, approved_by), decided_at = CASE WHEN $3::uuid IS NULL THEN decided_at ELSE now() END,
              decision_note = COALESCE($4, decision_note) WHERE id = $1`,
      [id, status, approver, note ?? null],
    );
    return (r.rowCount ?? 0) === 1;
  }

  async pendingLeaveCount() {
    const { rows } = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM leave_requests WHERE status = 'PENDING'`);
    return rows[0]?.n ?? 0;
  }

  async payableTimesheets(employeeId: string, start: string, end: string) {
    const { rows } = await this.db.query<{ id: string; totalHours: number; jobId: string | null; invoiceStatus: string | null }>(
      `SELECT t.id, t.total_hours AS "totalHours", t.job_id AS "jobId", i.status AS "invoiceStatus"
         FROM timesheets t LEFT JOIN invoices i ON i.job_id = t.job_id
        WHERE t.employee_id = $1 AND t.status = 'CONFIRMED' AND t.payroll_id IS NULL AND t.work_date BETWEEN $2 AND $3
        ORDER BY t.work_date`,
      [employeeId, start, end],
    );
    return rows;
  }

  async regularPayrollExists(employeeId: string, start: string, end: string) {
    const { rows } = await this.db.query<{ e: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM payrolls WHERE employee_id = $1 AND period_start = $2 AND period_end = $3 AND corrects_payroll_id IS NULL) AS e`,
      [employeeId, start, end],
    );
    return rows[0]?.e ?? false;
  }

  async createPayroll(p: { employeeId: string; periodStart: string; periodEnd: string; totalHours: number; hourlyRate: number; grossPay: number; paye: number; uif: number; deductions: number; netPay: number; processedBy: string; correctsPayrollId?: string | null; correctionReason?: string | null }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO payrolls (employee_id, period_start, period_end, total_hours, hourly_rate, gross_pay, paye, uif, deductions, net_pay,
                             processed_by, corrects_payroll_id, correction_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [p.employeeId, p.periodStart, p.periodEnd, p.totalHours, p.hourlyRate, p.grossPay, p.paye, p.uif, p.deductions, p.netPay,
        p.processedBy, p.correctsPayrollId ?? null, p.correctionReason ?? null],
    );
    return rows[0]!.id;
  }

  async attachTimesheets(payrollId: string, items: { timesheetId: string; hours: number; amount: number }[]) {
    for (const it of items) {
      await this.db.query('INSERT INTO payroll_items (payroll_id, timesheet_id, hours, amount) VALUES ($1,$2,$3,$4)', [payrollId, it.timesheetId, it.hours, it.amount]);
      await this.db.query('UPDATE timesheets SET payroll_id = $1 WHERE id = $2', [payrollId, it.timesheetId]);
    }
  }

  async payroll(id: string, forUpdate = false) {
    const { rows } = await this.db.query<PayrollDto>(`${PAYROLL_DTO} WHERE p.id = $1 ${forUpdate ? 'FOR UPDATE OF p' : ''}`, [id]);
    return rows[0] ?? null;
  }

  async listPayrolls(f: { employeeId?: string; status?: PayrollStatus; limit: number; offset: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.employeeId) {
      params.push(f.employeeId);
      where.push(`p.employee_id = $${params.length}`);
    }
    if (f.status) {
      params.push(f.status);
      where.push(`p.status = $${params.length}`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM payrolls p ${w}`, params);
    const { rows } = await this.db.query<PayrollDto>(
      `${PAYROLL_DTO} ${w} ORDER BY p.period_end DESC, e.first_name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async setPayrollStatus(id: string, status: PayrollStatus, userId: string) {
    await this.db.query(
      `UPDATE payrolls SET status = $2::text,
              approved_by = CASE WHEN $2::text = 'APPROVED' THEN $3::uuid ELSE approved_by END,
              approved_at = CASE WHEN $2::text = 'APPROVED' THEN now() ELSE approved_at END,
              finalised_at = CASE WHEN $2::text = 'FINALISED' THEN now() ELSE finalised_at END
        WHERE id = $1`,
      [id, status, userId],
    );
  }

  async deleteDraftPayroll(id: string) {
    await this.db.query('UPDATE timesheets SET payroll_id = NULL WHERE payroll_id = $1', [id]);
    await this.db.query(`DELETE FROM payrolls WHERE id = $1 AND status = 'DRAFT'`, [id]);
  }

  async markPayrollTimesheetsPaid(payrollId: string) {
    await this.db.query(`UPDATE timesheets SET status = 'PAID' WHERE payroll_id = $1`, [payrollId]);
  }
}

const CUSTOMER_DTO = `
  SELECT c.id, c.user_id AS "userId", c.first_name AS "firstName", c.last_name AS "lastName", u.email, c.phone, c.address,
         c.created_at AS "createdAt",
         (SELECT count(*)::int FROM jobs j WHERE j.customer_id = c.id) AS "jobCount",
         COALESCE((SELECT SUM(i.amount_due) FROM invoices i WHERE i.customer_id = c.id AND i.status IN ('SENT','PARTIALLY_PAID','OVERDUE')), 0)::float8 AS "outstandingBalance",
         COALESCE((SELECT ra.points_balance FROM rewards_accounts ra WHERE ra.customer_id = c.id), 0) AS "pointsBalance",
         u.status
    FROM customers c JOIN users u ON u.id = c.user_id`;
