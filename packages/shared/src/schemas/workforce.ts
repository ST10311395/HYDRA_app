import { z } from 'zod';
import { LEAVE_TYPES, SCHEDULE_EVENT_TYPES } from '../enums.js';
import { isoDate, isoDateTime, optionalText, paginationQuery, trimmed, uuid } from './common.js';

export const scheduleQuery = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    employeeId: uuid.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'Invalid range', path: ['to'] });

export const createScheduleSchema = z
  .object({
    employeeId: uuid,
    eventType: z.enum(SCHEDULE_EVENT_TYPES).exclude(['JOB', 'LEAVE']),
    title: trimmed(120, 2),
    startAt: isoDateTime,
    endAt: isoDateTime,
    notes: optionalText(500),
    overrideConflicts: z.boolean().default(false),
  })
  .refine((v) => Date.parse(v.endAt) > Date.parse(v.startAt), { message: 'End must be after start', path: ['endAt'] });

export const clockInSchema = z.object({
  jobId: uuid.optional(),
  notes: optionalText(300),
});
export const clockOutSchema = z.object({ notes: optionalText(300) });

export const timesheetListQuery = paginationQuery.extend({
  employeeId: uuid.optional(),
  status: z.enum(['OPEN', 'SUBMITTED', 'CONFIRMED', 'REJECTED', 'PAID']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const reviewTimesheetSchema = z.object({
  decision: z.enum(['CONFIRM', 'REJECT']),
  note: optionalText(300),
});

export const leaveRequestSchema = z
  .object({
    leaveType: z.enum(LEAVE_TYPES).default('ANNUAL'),
    startDate: isoDate,
    endDate: isoDate,
    reason: trimmed(500, 3),
  })
  .refine((v) => v.startDate <= v.endDate, { message: 'End date must be on or after start date', path: ['endDate'] });
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

export const decideLeaveSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: optionalText(300),
});

export const payrollPreviewSchema = z
  .object({
    periodStart: isoDate,
    periodEnd: isoDate,
    employeeIds: z.array(uuid).max(200).optional(),
  })
  .refine((v) => v.periodStart <= v.periodEnd, { message: 'Invalid period', path: ['periodEnd'] });
export type PayrollPreviewInput = z.infer<typeof payrollPreviewSchema>;

export const payrollCorrectionSchema = z.object({
  reason: trimmed(500, 5),
  grossAdjustment: z.number().finite().min(-1_000_000).max(1_000_000),
  deductionsAdjustment: z.number().finite().min(-1_000_000).max(1_000_000).default(0),
});

export const employeeUpdateSchema = z.object({
  certificationNo: optionalText(60),
  specialisation: optionalText(120),
  hourlyRate: z.number().min(0).max(10_000).optional(),
  taxRate: z.number().min(0).max(0.45).optional(),
  isActive: z.boolean().optional(),
});
