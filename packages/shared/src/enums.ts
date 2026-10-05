/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
/**
 * Canonical HYDRA enumerations. These values are mirrored by CHECK constraints in the
 * PostgreSQL migrations — change both together.
 */

export const ROLES = ['CUSTOMER', 'EMPLOYEE', 'ADMIN_OFFICE', 'ADMIN_OWNER'] as const;
export type Role = (typeof ROLES)[number];
export const ADMIN_ROLES: readonly Role[] = ['ADMIN_OFFICE', 'ADMIN_OWNER'];
export const STAFF_ROLES: readonly Role[] = ['EMPLOYEE', 'ADMIN_OFFICE', 'ADMIN_OWNER'];

export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const JOB_STATUSES = [
  'REQUESTED',
  'QUOTED',
  'QUOTE_ACCEPTED',
  'QUOTE_DECLINED',
  'SCHEDULED',
  'IN_PROGRESS',
  'INSPECTION_PENDING',
  'COMPLETED',
  'INVOICED',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_URGENCIES = ['STANDARD', 'HIGH', 'EMERGENCY'] as const;
export type JobUrgency = (typeof JOB_URGENCIES)[number];

export const JOB_SOURCES = ['APP', 'CONTACT_QUERY', 'ADMIN', 'MISSED_CALL', 'AI_ASSESSMENT'] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const MILESTONE_STATUSES = ['PENDING', 'COMPLETED', 'SKIPPED'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const QUOTE_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SUPERSEDED'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_ITEM_KINDS = ['LABOUR', 'MATERIAL', 'FEE'] as const;
export type QuoteItemKind = (typeof QUOTE_ITEM_KINDS)[number];

export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'OVERDUE', 'PAID', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['CARD', 'EFT', 'CASH', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const COMPLIANCE_STATUSES = ['PASS', 'FAIL', 'CONDITIONAL'] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export const CHECKIN_METHODS = ['QR', 'ADMIN_OVERRIDE'] as const;
export type CheckinMethod = (typeof CHECKIN_METHODS)[number];

export const STOCK_MOVEMENT_REASONS = ['JOB_USAGE', 'RESTOCK', 'ADJUSTMENT', 'OVERRIDE', 'REVERSAL'] as const;
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number];

export const TIMESHEET_STATUSES = ['OPEN', 'SUBMITTED', 'CONFIRMED', 'REJECTED', 'PAID'] as const;
export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number];

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_TYPES = ['ANNUAL', 'SICK', 'FAMILY', 'UNPAID', 'OTHER'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const SCHEDULE_EVENT_TYPES = ['JOB', 'LEAVE', 'TRAINING', 'MEETING', 'OTHER'] as const;
export type ScheduleEventType = (typeof SCHEDULE_EVENT_TYPES)[number];

export const PAYROLL_STATUSES = ['DRAFT', 'APPROVED', 'FINALISED'] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

export const CONTACT_QUERY_STATUSES = ['NEW', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'] as const;
export type ContactQueryStatus = (typeof CONTACT_QUERY_STATUSES)[number];

export const CONTACT_QUERY_SOURCES = ['CONTACT_FORM', 'QUOTE_TOOL', 'SPECIALIST_REQUEST', 'COMPONENT_QUOTE'] as const;
export type ContactQuerySource = (typeof CONTACT_QUERY_SOURCES)[number];

export const MISSED_CALL_STATUSES = [
  'NEW',
  'AUTO_REPLIED',
  'REVIEW_REQUIRED',
  'REPLIED',
  'DISMISSED',
  'FAILED',
] as const;
export type MissedCallStatus = (typeof MISSED_CALL_STATUSES)[number];

export const MESSAGE_CHANNELS = ['SMS', 'WHATSAPP'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const DELIVERY_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'NOT_CONFIGURED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DISCOUNT_TYPES = ['PERCENT', 'FIXED'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const REWARD_TX_TYPES = ['EARN', 'REDEEM', 'ADJUST'] as const;
export type RewardTxType = (typeof REWARD_TX_TYPES)[number];

export const REWARD_TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const;
export type RewardTier = (typeof REWARD_TIERS)[number];

export const FILE_PURPOSES = [
  'JOB_PHOTO',
  'INSPECTION_EVIDENCE',
  'COMPLIANCE_DOCUMENT',
  'PROFILE_IMAGE',
  'AI_ASSESSMENT_PHOTO',
] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

export const EXPORT_TYPES = [
  'CUSTOMERS',
  'EMPLOYEES',
  'JOBS',
  'INVOICES',
  'PAYMENTS',
  'TIMESHEETS',
  'PAYROLL',
  'INVENTORY',
  'ENQUIRIES',
] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export const EXPORT_FORMATS = ['CSV', 'PDF'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const SERVICE_CATEGORIES = [
  'SOLAR',
  'CABLING',
  'SUBSTATIONS',
  'EMERGENCY',
  'COMPLIANCE',
  'AUTOMATION',
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const PORTFOLIO_CATEGORIES = ['INDUSTRIAL', 'COMMERCIAL', 'SOLAR', 'DATA_FIBRE'] as const;
export type PortfolioCategory = (typeof PORTFOLIO_CATEGORIES)[number];

export const PARTNER_CATEGORIES = [
  'EQUIPMENT_OEM',
  'SOLAR_STORAGE',
  'CABLES_CONDUCTORS',
  'COMPLIANCE_AUDITING',
  'ENTERPRISE_CLIENT',
] as const;
export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];

export const TEAM_CATEGORIES = ['ENGINEERING', 'TECHNICIANS', 'MANAGEMENT', 'COMPLIANCE'] as const;
export type TeamCategory = (typeof TEAM_CATEGORIES)[number];

export const NOTIFICATION_TYPES = [
  'QUOTE_READY',
  'QUOTE_ACCEPTED',
  'QUOTE_DECLINED',
  'JOB_ASSIGNED',
  'JOB_SCHEDULED',
  'JOB_REASSIGNED',
  'CHECKED_IN',
  'MILESTONE_UPDATED',
  'JOB_COMPLETED',
  'INSPECTION_SUBMITTED',
  'INVOICE_ISSUED',
  'INVOICE_OVERDUE',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'REWARDS_CREDITED',
  'LEAVE_REQUESTED',
  'LEAVE_DECIDED',
  'SCHEDULE_CHANGED',
  'NEW_ENQUIRY',
  'NEW_JOB_REQUEST',
  'LOW_STOCK',
  'MISSED_CALL_REVIEW',
  'MESSAGE_FAILED',
  'ADMIN_NOTE',
  'AI_CASE_REVIEW',
  'AI_CASE_CRITICAL',
  'AI_CASE_UPDATE',
  'AI_PROPOSAL_READY',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Human-friendly labels used by the mobile UI. */
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  REQUESTED: 'Requested',
  QUOTED: 'Quote Ready',
  QUOTE_ACCEPTED: 'Quote Accepted',
  QUOTE_DECLINED: 'Quote Declined',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  INSPECTION_PENDING: 'Inspection',
  COMPLETED: 'Completed',
  INVOICED: 'Invoice Issued',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
};

export const ROLE_LABELS: Record<Role, string> = {
  CUSTOMER: 'Customer',
  EMPLOYEE: 'Electrician',
  ADMIN_OFFICE: 'Admin · Office',
  ADMIN_OWNER: 'Admin · Owner',
};
