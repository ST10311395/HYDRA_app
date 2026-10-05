/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import type { InvoiceStatus, JobStatus, LeaveStatus, TimesheetStatus } from './enums.js';

/**
 * Job lifecycle — the single source of legal transitions (PDF §4.1 Fig. 4 + build spec §24).
 * Every job status change in the API goes through `assertJobTransition`.
 */
export const JOB_EVENTS = [
  'SEND_QUOTE',
  'ACCEPT_QUOTE',
  'DECLINE_QUOTE',
  'ASSIGN',
  'REASSIGN',
  'CHECK_IN',
  'COMPLETE_WORK',
  'INSPECTION_PASSED',
  'INSPECTION_FAILED',
  'ISSUE_INVOICE',
  'PARTIAL_PAYMENT',
  'FULL_PAYMENT',
  'CANCEL',
] as const;
export type JobEvent = (typeof JOB_EVENTS)[number];

type TransitionTable = Record<JobEvent, Partial<Record<JobStatus, JobStatus>>>;

export const JOB_TRANSITIONS: TransitionTable = {
  SEND_QUOTE: { REQUESTED: 'QUOTED', QUOTED: 'QUOTED', QUOTE_DECLINED: 'QUOTED' },
  ACCEPT_QUOTE: { QUOTED: 'QUOTE_ACCEPTED' },
  DECLINE_QUOTE: { QUOTED: 'QUOTE_DECLINED' },
  ASSIGN: { QUOTE_ACCEPTED: 'SCHEDULED' },
  REASSIGN: { SCHEDULED: 'SCHEDULED', IN_PROGRESS: 'IN_PROGRESS' },
  CHECK_IN: { SCHEDULED: 'IN_PROGRESS' },
  COMPLETE_WORK: { IN_PROGRESS: 'INSPECTION_PENDING' },
  INSPECTION_PASSED: { INSPECTION_PENDING: 'COMPLETED' },
  INSPECTION_FAILED: { INSPECTION_PENDING: 'IN_PROGRESS' },
  ISSUE_INVOICE: { COMPLETED: 'INVOICED' },
  PARTIAL_PAYMENT: { INVOICED: 'PARTIALLY_PAID', PARTIALLY_PAID: 'PARTIALLY_PAID' },
  FULL_PAYMENT: { INVOICED: 'PAID', PARTIALLY_PAID: 'PAID' },
  CANCEL: {
    REQUESTED: 'CANCELLED',
    QUOTED: 'CANCELLED',
    QUOTE_DECLINED: 'CANCELLED',
    QUOTE_ACCEPTED: 'CANCELLED',
    SCHEDULED: 'CANCELLED',
    IN_PROGRESS: 'CANCELLED',
  },
};

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ['PAID', 'CANCELLED'];

/** Statuses in which an electrician is actively responsible for on-site work. */
export const FIELD_ACTIVE_STATUSES: readonly JobStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'INSPECTION_PENDING'];

export function nextJobStatus(current: JobStatus, event: JobEvent): JobStatus | null {
  return JOB_TRANSITIONS[event][current] ?? null;
}

export function canTransitionJob(current: JobStatus, event: JobEvent): boolean {
  return nextJobStatus(current, event) !== null;
}

export function allowedJobEvents(current: JobStatus): JobEvent[] {
  return JOB_EVENTS.filter((e) => canTransitionJob(current, e));
}

/** Invoice lifecycle (PDF §4.1 Fig. 5). */
export const INVOICE_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  DRAFT: ['SENT', 'VOID'],
  SENT: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'],
  PARTIALLY_PAID: ['PARTIALLY_PAID', 'PAID', 'OVERDUE'],
  OVERDUE: ['PARTIALLY_PAID', 'PAID', 'OVERDUE'],
  PAID: [],
  VOID: [],
};

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return INVOICE_TRANSITIONS[from].includes(to);
}

export const LEAVE_TRANSITIONS: Record<LeaveStatus, readonly LeaveStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
};

export const TIMESHEET_TRANSITIONS: Record<TimesheetStatus, readonly TimesheetStatus[]> = {
  OPEN: ['SUBMITTED'],
  SUBMITTED: ['CONFIRMED', 'REJECTED'],
  CONFIRMED: ['PAID', 'REJECTED'],
  REJECTED: ['SUBMITTED'],
  PAID: [],
};

/**
 * Customer-facing milestone template (spec §8.4). Each job receives these rows on creation;
 * the server marks them complete as the lifecycle advances. Codes are stable identifiers.
 */
export const MILESTONE_TEMPLATE = [
  { code: 'REQUESTED', name: 'Requested', description: 'Service request received' },
  { code: 'QUOTE_PREPARED', name: 'Quote Prepared', description: 'Engineer-reviewed quotation issued' },
  { code: 'QUOTE_ACCEPTED', name: 'Quote Accepted', description: 'You approved the quotation' },
  { code: 'SCHEDULED', name: 'Scheduled', description: 'Date and time confirmed' },
  { code: 'ELECTRICIAN_ASSIGNED', name: 'Electrician Assigned', description: 'A certified electrician is assigned' },
  { code: 'ARRIVED', name: 'Arrived / QR Confirmed', description: 'On-site arrival verified by QR + GPS' },
  { code: 'IN_PROGRESS', name: 'In Progress', description: 'Work under way on site' },
  { code: 'INSPECTION', name: 'Inspection', description: 'Compliance testing and inspection' },
  { code: 'COMPLETED', name: 'Completed', description: 'Work completed and certified' },
  { code: 'INVOICE_ISSUED', name: 'Invoice Issued', description: 'Invoice available for payment' },
  { code: 'PAID', name: 'Paid', description: 'Account settled — thank you' },
] as const;
export type MilestoneCode = (typeof MILESTONE_TEMPLATE)[number]['code'];

/** Milestones automatically completed when a job enters a status. */
export const STATUS_MILESTONES: Partial<Record<JobStatus, readonly MilestoneCode[]>> = {
  REQUESTED: ['REQUESTED'],
  QUOTED: ['QUOTE_PREPARED'],
  QUOTE_ACCEPTED: ['QUOTE_ACCEPTED'],
  SCHEDULED: ['SCHEDULED', 'ELECTRICIAN_ASSIGNED'],
  IN_PROGRESS: ['ARRIVED', 'IN_PROGRESS'],
  INSPECTION_PENDING: [],
  COMPLETED: ['INSPECTION', 'COMPLETED'],
  INVOICED: ['INVOICE_ISSUED'],
  PAID: ['INVOICE_ISSUED', 'PAID'],
};

/** Milestones an electrician may mark manually while on site. */
export const EMPLOYEE_MANUAL_MILESTONES: readonly MilestoneCode[] = ['IN_PROGRESS', 'INSPECTION'];
