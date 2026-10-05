/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import {
  calculatePayroll,
  hoursBetween,
  roundMoney,
  type LeaveRequestInput,
  type LeaveStatus,
  type PayrollPreviewInput,
  type PayrollPreviewLineDto,
  type TimesheetStatus,
} from '@hydra/shared';
import { db } from '../db/pool';
import { PostgresSettingsRepository } from '../repositories/settingsRepository';
import { PostgresWorkforceRepository } from '../repositories/workforceRepository';
import type { AuthContext } from '../types/express';
import { addDays, businessDayStart, toBusinessDate, todayIso } from '../utils/dates';
import { AppError, businessRule, conflict, forbidden, notFound } from '../utils/errors';
import { paginated } from '../utils/pagination';
import { isAdminRole, isOwner } from './accessControl';
import { audit, type Actor } from './auditService';
import { transactional } from './events';

export const UIF_RATE = 0.01;
export const UIF_MONTHLY_CAP = 177.12;

function employeeScope(auth: AuthContext, requested?: string): string | undefined {
  if (auth.role === 'EMPLOYEE') {
    if (!auth.employeeId) throw forbidden();
    if (requested && requested !== auth.employeeId) throw forbidden('You can only view your own schedule');
    return auth.employeeId;
  }
  if (isAdminRole(auth)) return requested;
  throw forbidden();
}

/** Calendar (PDF Story 3): short look-ahead by default (today + 7 days) for weak mobile data. */
export async function listSchedule(auth: AuthContext, q: { from?: string; to?: string; employeeId?: string }) {
  const employeeId = employeeScope(auth, q.employeeId);
  const from = q.from ?? todayIso();
  const to = q.to ?? addDays(from, 7);
  if (Date.parse(to) - Date.parse(from) > 92 * 86_400_000) throw businessRule('Choose a range of at most 3 months');
  return new PostgresWorkforceRepository(db()).listEvents({ employeeId, from: businessDayStart(from), to: businessDayStart(addDays(to, 1)) });
}

export async function createScheduleEvent(auth: AuthContext, input: { employeeId: string; eventType: 'TRAINING' | 'MEETING' | 'OTHER'; title: string; startAt: string; endAt: string; notes?: string; overrideConflicts: boolean }, actor: Actor) {
  return transactional(async (tx, events) => {
    const repo = new PostgresWorkforceRepository(tx);
    const emp = await repo.employee(input.employeeId);
    if (!emp) throw notFound('Employee');
    const conflicts = await repo.conflicts(emp.id, input.startAt, input.endAt);
    if (conflicts.length && !input.overrideConflicts) {
      throw new AppError(409, 'SCHEDULE_CONFLICT', 'The event overlaps existing bookings', conflicts.map((c) => ({ path: c.type, message: `${c.title} (${c.startAt} → ${c.endAt})` })));
    }
    const id = await repo.createEvent({ ...input, createdBy: auth.userId });
    await events.notify([emp.userId], { type: 'SCHEDULE_CHANGED', title: `New calendar event: ${input.title}`, body: new Date(input.startAt).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }), data: { route: '/employee/calendar' } });
    events.emit(`user:${emp.userId}`, 'schedule.updated', { eventId: id });
    await audit(tx, actor, 'SCHEDULE_EVENT_CREATED', 'employee_schedule', id, { employeeId: emp.id, conflictsOverridden: conflicts.length > 0 });
    return { id };
  });
}

export async function deleteScheduleEvent(id: string, actor: Actor) {
  await transactional(async (tx, events) => {
    const repo = new PostgresWorkforceRepository(tx);
    const deleted = await repo.deleteEvent(id);
    if (!deleted) throw notFound('Schedule event');
    const emp = await repo.employee(deleted.employeeId);
    if (emp) events.emit(`user:${emp.userId}`, 'schedule.updated', { eventId: id });
    await audit(tx, actor, 'SCHEDULE_EVENT_DELETED', 'employee_schedule', id);
  });
}

/** Clock in (PDF Story 15). The partial unique index guarantees at most one open shift per employee. */
export async function clockIn(auth: AuthContext, jobId: string | undefined, notes: string | undefined, actor: Actor) {
  if (auth.role !== 'EMPLOYEE' || !auth.employeeId) throw forbidden();
  const employeeId = auth.employeeId;
  return transactional(async (tx) => {
    const repo = new PostgresWorkforceRepository(tx);
    if (await repo.openShift(employeeId)) throw conflict('You are already clocked in', 'ALREADY_CLOCKED_IN');
    if (jobId) {
      const { rows } = await tx.query<{ id: string }>('SELECT id FROM jobs WHERE id = $1 AND electrician_id = $2', [jobId, employeeId]);
      if (!rows[0]) throw notFound('Job');
    }
    const id = await repo.clockIn(employeeId, jobId ?? null, toBusinessDate(new Date()), notes);
    await audit(tx, actor, 'CLOCK_IN', 'timesheet', id, { jobId });
    return (await repo.timesheet(id))!;
  });
}

export async function clockOut(auth: AuthContext, notes: string | undefined, actor: Actor) {
  if (auth.role !== 'EMPLOYEE' || !auth.employeeId) throw forbidden();
  const employeeId = auth.employeeId;
  return transactional(async (tx, events) => {
    const repo = new PostgresWorkforceRepository(tx);
    const open = await repo.openShift(employeeId);
    if (!open) throw businessRule('You are not clocked in', 'NOT_CLOCKED_IN');
    const locked = (await repo.timesheet(open.id, true))!;
    const hours = hoursBetween(new Date(locked.clockIn), new Date());
    if (hours > 24) throw businessRule('This shift is longer than 24 hours. Ask the office to correct it.', 'SHIFT_TOO_LONG');
    await repo.clockOut(open.id, hours, notes);
    await events.notifyAdmins({ type: 'SYSTEM', title: 'Timesheet submitted', body: `${locked.employeeName}: ${hours}h on ${locked.workDate}`, data: { timesheetId: open.id, route: '/admin/workforce' } });
    await audit(tx, actor, 'CLOCK_OUT', 'timesheet', open.id, { hours });
    return (await repo.timesheet(open.id))!;
  });
}

export async function currentShift(auth: AuthContext) {
  if (auth.role !== 'EMPLOYEE' || !auth.employeeId) throw forbidden();
  const repo = new PostgresWorkforceRepository(db());
  return { openShift: await repo.openShift(auth.employeeId), todayHours: await repo.hoursOn(auth.employeeId, todayIso()) };
}

export async function listTimesheets(auth: AuthContext, q: { employeeId?: string; status?: TimesheetStatus; from?: string; to?: string; page: number; pageSize: number }) {
  const employeeId = employeeScope(auth, q.employeeId);
  const { items, total } = await new PostgresWorkforceRepository(db()).listTimesheets({ ...q, employeeId, limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
  return paginated(items, q.page, q.pageSize, total);
}

export async function reviewTimesheet(auth: AuthContext, id: string, decision: 'CONFIRM' | 'REJECT', note: string | undefined, actor: Actor) {
  return transactional(async (tx, events) => {
    const repo = new PostgresWorkforceRepository(tx);
    const ts = await repo.timesheet(id, true);
    if (!ts) throw notFound('Timesheet');
    if (ts.status === 'OPEN') throw businessRule('The shift is still open', 'SHIFT_OPEN');
    if (ts.payrollId) throw businessRule('This timesheet is already included in payroll', 'TIMESHEET_IN_PAYROLL');
    const status = decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';
    await repo.reviewTimesheet(id, status, auth.userId, note);
    const emp = await repo.employee(ts.employeeId);
    if (decision === 'REJECT') {
      await events.notify([emp?.userId], { type: 'ADMIN_NOTE', title: 'Timesheet needs attention', body: `${ts.workDate}: ${note ?? 'Please contact the office.'}`, data: { timesheetId: id } });
    }
    await audit(tx, actor, `TIMESHEET_${status}`, 'timesheet', id, { note });
    return (await repo.timesheet(id))!;
  });
}

export async function requestLeave(auth: AuthContext, input: LeaveRequestInput, actor: Actor) {
  if (auth.role !== 'EMPLOYEE' || !auth.employeeId) throw forbidden();
  const employeeId = auth.employeeId;
  if (input.startDate < todayIso()) throw businessRule('Leave cannot start in the past', 'INVALID_LEAVE_DATES');
  return transactional(async (tx, events) => {
    const repo = new PostgresWorkforceRepository(tx);
    if ((await repo.overlappingLeave(employeeId, input.startDate, input.endDate)).length) {
      throw conflict('You already have leave requested for part of this period', 'LEAVE_OVERLAP');
    }
    const id = await repo.createLeave(employeeId, input);
    const leave = (await repo.leave(id))!;
    await events.notifyAdmins({ type: 'LEAVE_REQUESTED', title: `Leave request · ${leave.employeeName}`, body: `${input.startDate} → ${input.endDate} (${leave.days} day${leave.days === 1 ? '' : 's'})`, data: { leaveId: id, route: '/admin/workforce' } });
    await audit(tx, actor, 'LEAVE_REQUESTED', 'leave_request', id, { startDate: input.startDate, endDate: input.endDate });
    return leave;
  });
}

export async function listLeave(auth: AuthContext, q: { employeeId?: string; status?: LeaveStatus; page: number; pageSize: number }) {
  const employeeId = employeeScope(auth, q.employeeId);
  const { items, total } = await new PostgresWorkforceRepository(db()).listLeave({ employeeId, status: q.status, limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
  return paginated(items, q.page, q.pageSize, total);
}

export async function cancelLeave(auth: AuthContext, id: string, actor: Actor) {
  return transactional(async (tx, events) => {
    const repo = new PostgresWorkforceRepository(tx);
    const leave = await repo.leave(id, true);
    if (!leave || (auth.role === 'EMPLOYEE' && leave.employeeId !== auth.employeeId)) throw notFound('Leave request');
    if (!['PENDING', 'APPROVED'].includes(leave.status)) throw businessRule('This leave request can no longer be cancelled');
    if (leave.status === 'APPROVED' && leave.startDate <= todayIso()) throw businessRule('Leave that has started cannot be cancelled in the app');
    await repo.decideLeave(id, 'CANCELLED', null);
    await tx.query('DELETE FROM employee_schedules WHERE leave_request_id = $1', [id]);
    await events.notifyAdmins({ type: 'LEAVE_REQUESTED', title: `Leave cancelled · ${leave.employeeName}`, body: `${leave.startDate} → ${leave.endDate}`, data: { leaveId: id } });
    await audit(tx, actor, 'LEAVE_CANCELLED', 'leave_request', id);
    return (await repo.leave(id))!;
  });
}

/**
 * PDF Story 17: approval blocks the employee's calendar (LEAVE event) so assignment screens and
 * conflict checks reflect reduced availability. Existing job clashes are returned as warnings.
 */
export async function decideLeave(auth: AuthContext, id: string, decision: 'APPROVE' | 'REJECT', note: string | undefined, actor: Actor) {
  return transactional(async (tx, events) => {
    const repo = new PostgresWorkforceRepository(tx);
    const leave = await repo.leave(id, true);
    if (!leave) throw notFound('Leave request');
    if (leave.status !== 'PENDING') throw businessRule('This leave request has already been decided', 'LEAVE_ALREADY_DECIDED');
    const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await repo.decideLeave(id, status, auth.userId, note);
    const emp = (await repo.employee(leave.employeeId))!;
    let clashes: { title: string; startAt: string; endAt: string }[] = [];
    if (status === 'APPROVED') {
      const start = businessDayStart(leave.startDate).toISOString();
      const end = businessDayStart(addDays(leave.endDate, 1)).toISOString();
      clashes = (await repo.conflicts(emp.id, start, end)).filter((c) => c.type === 'JOB');
      await repo.createEvent({ employeeId: emp.id, eventType: 'LEAVE', title: `${leave.leaveType.charAt(0)}${leave.leaveType.slice(1).toLowerCase()} leave`, startAt: start, endAt: end, createdBy: auth.userId, leaveRequestId: id });
      events.emit(`user:${emp.userId}`, 'schedule.updated', { leaveId: id });
    }
    await events.notify([emp.userId], {
      type: 'LEAVE_DECIDED',
      title: `Leave ${status.toLowerCase()}`,
      body: `${leave.startDate} → ${leave.endDate}${note ? ` — ${note}` : ''}`,
      data: { leaveId: id, route: '/employee/leave' },
    });
    await audit(tx, actor, `LEAVE_${status}`, 'leave_request', id, { clashes: clashes.length });
    return { leave: (await repo.leave(id))!, jobClashes: clashes };
  });
}

/**
 * Payroll preview (PDF Story 18): CONFIRMED timesheets in the period, not already paid. Timesheets
 * linked to jobs whose invoice is not yet PAID are held (PDF Fig. 14 cash-flow rule, configurable).
 */
export async function payrollPreview(input: PayrollPreviewInput): Promise<PayrollPreviewLineDto[]> {
  const repo = new PostgresWorkforceRepository(db());
  const settings = await new PostgresSettingsRepository(db()).getAll();
  const employees = (await repo.listEmployees({})).filter((e) => !input.employeeIds || input.employeeIds.includes(e.id));
  const lines: PayrollPreviewLineDto[] = [];
  for (const e of employees) {
    const sheets = await repo.payableTimesheets(e.id, input.periodStart, input.periodEnd);
    const held = settings.payrollRequirePaidInvoice ? sheets.filter((s) => s.jobId && s.invoiceStatus !== 'PAID') : [];
    const payable = sheets.filter((s) => !held.includes(s));
    const totalHours = roundMoney(payable.reduce((a, s) => a + s.totalHours, 0));
    const figures = calculatePayroll({ totalHours, hourlyRate: e.hourlyRate, taxRate: e.taxRate, uifRate: UIF_RATE, uifMonthlyCap: UIF_MONTHLY_CAP });
    lines.push({
      employeeId: e.id,
      employeeName: `${e.firstName} ${e.lastName}`,
      hourlyRate: e.hourlyRate,
      timesheetIds: payable.map((s) => s.id),
      heldTimesheetIds: held.map((s) => s.id),
      totalHours: figures.totalHours,
      grossPay: figures.grossPay,
      paye: figures.paye,
      uif: figures.uif,
      deductions: figures.deductions,
      netPay: figures.netPay,
      alreadyProcessed: await repo.regularPayrollExists(e.id, input.periodStart, input.periodEnd),
    });
  }
  return lines;
}

/** Creates DRAFT payroll records (office or owner). Figures are recomputed server-side — never trusted from the client. */
export async function processPayroll(auth: AuthContext, input: PayrollPreviewInput, actor: Actor) {
  const preview = await payrollPreview(input);
  return transactional(async (tx) => {
    const repo = new PostgresWorkforceRepository(tx);
    const created: string[] = [];
    for (const line of preview) {
      if (line.alreadyProcessed || line.timesheetIds.length === 0) continue;
      const sheets = await repo.payableTimesheets(line.employeeId, input.periodStart, input.periodEnd);
      const current = sheets.filter((s) => line.timesheetIds.includes(s.id));
      if (current.length !== line.timesheetIds.length) throw conflict('Timesheets changed while processing. Refresh and retry.', 'CONCURRENT_MODIFICATION');
      const id = await repo.createPayroll({
        employeeId: line.employeeId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        totalHours: line.totalHours,
        hourlyRate: line.hourlyRate,
        grossPay: line.grossPay,
        paye: line.paye,
        uif: line.uif,
        deductions: line.deductions,
        netPay: line.netPay,
        processedBy: auth.userId,
      });
      await repo.attachTimesheets(
        id,
        current.map((s) => ({ timesheetId: s.id, hours: s.totalHours, amount: roundMoney(s.totalHours * line.hourlyRate) })),
      );
      created.push(id);
      await audit(tx, actor, 'PAYROLL_PROCESSED', 'payroll', id, { employeeId: line.employeeId, gross: line.grossPay, net: line.netPay, period: `${input.periodStart}..${input.periodEnd}` });
    }
    return Promise.all(created.map(async (id) => (await repo.payroll(id))!));
  });
}

export async function listPayrolls(q: { employeeId?: string; status?: 'DRAFT' | 'APPROVED' | 'FINALISED'; page: number; pageSize: number }) {
  const { items, total } = await new PostgresWorkforceRepository(db()).listPayrolls({ ...q, limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
  return paginated(items, q.page, q.pageSize, total);
}

/** Owner-only sign-off steps (spec §10.9, independently authorised on the backend). */
export async function advancePayroll(auth: AuthContext, id: string, to: 'APPROVED' | 'FINALISED', actor: Actor) {
  if (!isOwner(auth)) throw forbidden('Only the owner can approve or finalise payroll');
  return transactional(async (tx, events) => {
    const repo = new PostgresWorkforceRepository(tx);
    const p = await repo.payroll(id, true);
    if (!p) throw notFound('Payroll');
    const from = to === 'APPROVED' ? 'DRAFT' : 'APPROVED';
    if (p.status !== from) throw businessRule(`Payroll must be ${from.toLowerCase()} first`, 'ILLEGAL_PAYROLL_TRANSITION');
    await repo.setPayrollStatus(id, to, auth.userId);
    if (to === 'FINALISED') {
      await repo.markPayrollTimesheetsPaid(id);
      const emp = await repo.employee(p.employeeId);
      await events.notify([emp?.userId], { type: 'SYSTEM', title: 'Payslip finalised', body: `Pay period ${p.periodStart} → ${p.periodEnd} has been finalised.`, data: {} });
    }
    await audit(tx, actor, `PAYROLL_${to}`, 'payroll', id, { employeeId: p.employeeId, net: p.netPay });
    return (await repo.payroll(id))!;
  });
}

export async function deleteDraftPayroll(id: string, actor: Actor) {
  await transactional(async (tx) => {
    const repo = new PostgresWorkforceRepository(tx);
    const p = await repo.payroll(id, true);
    if (!p) throw notFound('Payroll');
    if (p.status !== 'DRAFT') throw businessRule('Only draft payroll can be discarded');
    await repo.deleteDraftPayroll(id);
    await audit(tx, actor, 'PAYROLL_DISCARDED', 'payroll', id);
  });
}

/** Controlled correction of a finalised run: a new linked record, the original stays immutable. */
export async function correctPayroll(auth: AuthContext, id: string, input: { reason: string; grossAdjustment: number; deductionsAdjustment: number }, actor: Actor) {
  if (!isOwner(auth)) throw forbidden('Only the owner can correct finalised payroll');
  return transactional(async (tx) => {
    const repo = new PostgresWorkforceRepository(tx);
    const p = await repo.payroll(id);
    if (!p) throw notFound('Payroll');
    if (p.status !== 'FINALISED') throw businessRule('Only finalised payroll can be corrected; edit or discard drafts instead');
    const gross = roundMoney(input.grossAdjustment);
    const deductions = roundMoney(input.deductionsAdjustment);
    const newId = await repo.createPayroll({
      employeeId: p.employeeId,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      totalHours: 0,
      hourlyRate: p.hourlyRate,
      grossPay: gross,
      paye: deductions,
      uif: 0,
      deductions,
      netPay: roundMoney(gross - deductions),
      processedBy: auth.userId,
      correctsPayrollId: id,
      correctionReason: input.reason,
    });
    await audit(tx, actor, 'PAYROLL_CORRECTION_CREATED', 'payroll', newId, { corrects: id, gross, deductions, reason: input.reason });
    return (await repo.payroll(newId))!;
  });
}

export async function listEmployees(search?: string) {
  return new PostgresWorkforceRepository(db()).listEmployees({ search });
}

export async function getEmployee(auth: AuthContext, id: string) {
  if (auth.role === 'EMPLOYEE' && auth.employeeId !== id) throw notFound('Employee');
  const e = await new PostgresWorkforceRepository(db()).employeeDto(id);
  if (!e) throw notFound('Employee');
  if (auth.role === 'EMPLOYEE') return { ...e, hourlyRate: 0, taxRate: 0 };
  return e;
}

export async function updateEmployee(id: string, input: { certificationNo?: string; specialisation?: string; hourlyRate?: number; taxRate?: number; isActive?: boolean }, actor: Actor) {
  await transactional(async (tx) => {
    const repo = new PostgresWorkforceRepository(tx);
    if (!(await repo.employee(id))) throw notFound('Employee');
    await repo.updateEmployee(id, input);
    await audit(tx, actor, 'EMPLOYEE_UPDATED', 'employee', id, { fields: Object.keys(input) });
  });
  return (await new PostgresWorkforceRepository(db()).employeeDto(id))!;
}
