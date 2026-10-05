/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
/**
 * API response DTOs. The API maps database rows to these shapes; the mobile app consumes them.
 * Monetary values are numbers with 2-decimal precision; timestamps are ISO-8601 strings.
 */
import type {
  CheckinMethod,
  ComplianceStatus,
  ContactQueryStatus,
  DeliveryStatus,
  DiscountType,
  InvoiceStatus,
  JobStatus,
  JobUrgency,
  LeaveStatus,
  LeaveType,
  MessageChannel,
  MilestoneStatus,
  MissedCallStatus,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  PayrollStatus,
  PortfolioCategory,
  QuoteItemKind,
  QuoteStatus,
  RewardTier,
  RewardTxType,
  Role,
  ScheduleEventType,
  ServiceCategory,
  StockMovementReason,
  TimesheetStatus,
} from './enums.js';

export interface ServiceTypeDto {
  id: string;
  slug: string;
  name: string;
  category: ServiceCategory;
  description: string;
  basePrice: number;
  slaText: string | null;
  badge: string | null;
  imageKey: string | null;
  specs: { label: string; value: string }[];
  features: string[];
  isActive: boolean;
  displayOrder: number;
}

export interface PortfolioItemDto {
  id: string;
  title: string;
  clientName: string;
  location: string;
  category: PortfolioCategory;
  description: string;
  imageKey: string | null;
  completedDate: string;
  featured: boolean;
  highlights: string[];
  specBadge: string | null;
  accreditation: string | null;
  serviceTypeId: string | null;
  isDemo: boolean;
}

export interface FaqDto {
  id: string;
  question: string;
  answer: string;
  category: string;
  displayOrder: number;
}

export interface PartnerDto {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  establishedYear: number | null;
  description: string;
  tags: string[];
  certification: string | null;
  guarantee: string | null;
  logoKey: string | null;
  isDemo: boolean;
}

export interface TeamMemberDto {
  id: string;
  name: string;
  title: string;
  category: string;
  rating: number | null;
  registration: string | null;
  licence: string | null;
  skills: string[];
  experienceYears: number;
  projectsCount: number;
  leadProject: string | null;
  availability: 'AVAILABLE' | 'ON_SITE' | 'IN_DISPATCH';
  photoKey: string | null;
  isDemo: boolean;
}

export interface OfficeDto {
  id: string;
  region: string;
  name: string;
  area: string;
  address: string;
  phone: string;
  email: string;
  manager: string | null;
  hours: string;
  latitude: number | null;
  longitude: number | null;
}

export interface DepartmentContactDto {
  id: string;
  name: string;
  email: string;
  phone: string;
  sla: string;
  icon: string;
}

export interface PublicContentDto {
  /** Server truth for payment copy: `simulated` (dev sandbox) and `test` never move real money. */
  paymentMode?: 'simulated' | 'test' | 'live';
  company: {
    name: string;
    tagline: string;
    hotline: string;
    emergencyLine: string;
    whatsapp: string;
    email: string;
    established: number;
  };
  /** Marketing metrics grouped by screen section: home | work | why | partners | team. */
  metrics: { group: string; key: string; value: string; label: string; caption: string; accent: 'primary' | 'secondary' | 'neutral' }[];
  accreditations: { code: string; title: string; caption: string; accent: 'primary' | 'secondary' }[];
  certifications: { title: string; caption: string; accent: 'primary' | 'secondary' }[];
  testimonial: { quote: string; author: string; role: string; rating: number } | null;
  isDemoContent: boolean;
}

export interface PersonSummary {
  id: string;
  name: string;
  phone: string | null;
}

export interface MilestoneDto {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  status: MilestoneStatus;
  sequenceOrder: number;
  plannedDate: string | null;
  completedAt: string | null;
}

export interface CheckinDto {
  id: string;
  employeeName: string;
  method: CheckinMethod;
  scannedAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

export interface AssignmentLogDto {
  id: string;
  assignedToName: string;
  assignedByName: string;
  notes: string | null;
  createdAt: string;
}

export interface JobNoteDto {
  id: string;
  authorName: string;
  authorRole: Role;
  body: string;
  visibility: 'INTERNAL' | 'CUSTOMER';
  createdAt: string;
}

export interface FileRefDto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  purpose: string;
  createdAt: string;
}

export interface JobMaterialDto {
  id: string;
  materialId: string;
  materialName: string;
  unit: string;
  quantityUsed: number;
  costAtTime: number;
  lineCost: number;
  notes: string | null;
  loggedByName: string;
  createdAt: string;
}

export interface InspectionReportDto {
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
  attachments: FileRefDto[];
  document: FileRefDto | null;
}

export interface QuoteItemDto {
  id: string;
  kind: QuoteItemKind;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface QuoteDto {
  id: string;
  jobId: string;
  jobReference: string;
  version: number;
  status: QuoteStatus;
  labourCost: number;
  materialsCost: number;
  fees: number;
  discountAmount: number;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  validUntil: string;
  terms: string | null;
  notes: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  declineReason: string | null;
  items: QuoteItemDto[];
  createdAt: string;
}

export interface JobSummaryDto {
  id: string;
  reference: string;
  status: JobStatus;
  urgency: JobUrgency;
  serviceType: { id: string; name: string; category: ServiceCategory };
  siteAddress: string;
  customer: PersonSummary;
  electrician: PersonSummary | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  preferredDate: string | null;
  nextMilestone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobDetailDto extends JobSummaryDto {
  description: string;
  siteLatitude: number | null;
  siteLongitude: number | null;
  preferredTimeWindow: string;
  source: string;
  materialsCost: number;
  cancelledReason: string | null;
  completedAt: string | null;
  milestones: MilestoneDto[];
  checkins: CheckinDto[];
  notes: JobNoteDto[];
  attachments: FileRefDto[];
  materials: JobMaterialDto[];
  inspections: InspectionReportDto[];
  quote: QuoteDto | null;
  invoice: { id: string; number: string; status: InvoiceStatus; total: number; amountDue: number } | null;
  assignmentHistory: AssignmentLogDto[] | null;
  timeOnSiteMinutes: number | null;
  allowedActions: string[];
}

export interface InvoiceItemDto {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PaymentDto {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  provider: string;
  providerReference: string | null;
  status: PaymentStatus;
  checkoutUrl: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface InvoiceDto {
  id: string;
  number: string;
  jobId: string;
  jobReference: string;
  quoteId: string | null;
  customer: PersonSummary & { email: string };
  status: InvoiceStatus;
  subtotal: number;
  materialsAdjustment: number;
  discountTotal: number;
  vatAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  invoiceDate: string;
  dueDate: string;
  sentAt: string | null;
  paidAt: string | null;
  notes: string | null;
  items: InvoiceItemDto[];
  payments: PaymentDto[];
  discounts: { code: string; description: string; amountApplied: number; pointsSpent: number }[];
}

export interface RewardsSummaryDto {
  accountId: string;
  pointsBalance: number;
  lifetimePoints: number;
  tier: RewardTier;
  nextTier: RewardTier | null;
  pointsToNextTier: number | null;
  randPerPoint: number;
}

export interface RewardTransactionDto {
  id: string;
  type: RewardTxType;
  pointsEarned: number;
  pointsRedeemed: number;
  description: string;
  jobReference: string | null;
  invoiceNumber: string | null;
  createdAt: string;
}

export interface DiscountDto {
  id: string;
  code: string;
  description: string;
  discountType: DiscountType;
  value: number;
  pointsCost: number;
  minSpend: number;
  validFrom: string;
  validUntil: string;
  active: boolean;
  maxRedemptions: number | null;
  redemptionCount: number;
  /** Customer-specific eligibility (only on customer endpoints). */
  eligible?: boolean;
  ineligibleReason?: string | null;
}

export interface MaterialDto {
  id: string;
  sku: string;
  name: string;
  unit: string;
  unitCost: number;
  stockLevel: number;
  reorderLevel: number;
  isLowStock: boolean;
  supplierName: string | null;
  supplierContact: string | null;
  isArchived: boolean;
  updatedAt: string;
}

export interface StockMovementDto {
  id: string;
  materialId: string;
  materialName: string;
  delta: number;
  reason: StockMovementReason;
  stockAfter: number;
  jobReference: string | null;
  actorName: string;
  note: string | null;
  createdAt: string;
}

export interface ScheduleEventDto {
  id: string;
  employeeId: string;
  employeeName: string;
  eventType: ScheduleEventType;
  title: string;
  startAt: string;
  endAt: string;
  notes: string | null;
  job: { id: string; reference: string; status: JobStatus; siteAddress: string; serviceName: string } | null;
}

export interface TimesheetDto {
  id: string;
  employeeId: string;
  employeeName: string;
  jobId: string | null;
  jobReference: string | null;
  workDate: string;
  clockIn: string;
  clockOut: string | null;
  totalHours: number | null;
  status: TimesheetStatus;
  notes: string | null;
  payrollId: string | null;
}

export interface LeaveRequestDto {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface PayrollDto {
  id: string;
  employeeId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  hourlyRate: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  status: PayrollStatus;
  processedByName: string;
  approvedByName: string | null;
  processedDate: string;
  finalisedAt: string | null;
  correctsPayrollId: string | null;
  correctionReason: string | null;
  timesheetCount: number;
}

export interface PayrollPreviewLineDto {
  employeeId: string;
  employeeName: string;
  hourlyRate: number;
  timesheetIds: string[];
  heldTimesheetIds: string[];
  totalHours: number;
  grossPay: number;
  paye: number;
  uif: number;
  deductions: number;
  netPay: number;
  alreadyProcessed: boolean;
}

export interface EmployeeDto {
  id: string;
  userId: string;
  staffNumber: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  certificationNo: string | null;
  specialisation: string | null;
  hourlyRate: number;
  taxRate: number;
  isActive: boolean;
  clockedIn: boolean;
  onLeaveToday: boolean;
  activeJobCount: number;
}

export interface EmployeeAvailabilityDto extends EmployeeDto {
  available: boolean;
  conflicts: { type: 'JOB' | 'LEAVE' | 'EVENT'; title: string; startAt: string; endAt: string }[];
}

export interface CustomerDto {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  address: string | null;
  createdAt: string;
  jobCount: number;
  outstandingBalance: number;
  pointsBalance: number;
  status: 'ACTIVE' | 'DISABLED';
}

export interface ContactQueryDto {
  id: string;
  reference: string;
  name: string;
  email: string;
  phone: string;
  sector: string | null;
  urgency: JobUrgency;
  message: string;
  source: string;
  details: Record<string, unknown> | null;
  status: ContactQueryStatus;
  assignedAdminName: string | null;
  adminNotes: string | null;
  convertedJobId: string | null;
  convertedJobReference: string | null;
  convertedCustomerId: string | null;
  submittedAt: string;
  updatedAt: string;
}

export interface MessageLogDto {
  id: string;
  missedCallId: string | null;
  channel: MessageChannel;
  recipient: string;
  messageContent: string;
  deliveryStatus: DeliveryStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  approvedByName: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface MissedCallDto {
  id: string;
  phoneNumber: string;
  contactName: string | null;
  linkedCustomerId: string | null;
  callAt: string;
  durationSeconds: number;
  status: MissedCallStatus;
  classification: string | null;
  suggestedReply: string | null;
  source: string;
  messages: MessageLogDto[];
  createdAt: string;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, string> | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ExportLogDto {
  id: string;
  exportType: string;
  format: string;
  filters: Record<string, unknown>;
  rowCount: number;
  adminName: string;
  createdAt: string;
}

export interface SettingsDto {
  missedCallAutomationEnabled: boolean;
  missedCallAutoReplyTemplate: string;
  missedCallDefaultChannel: MessageChannel;
  rewardsRandPerPoint: number;
  vatRate: number;
  payrollRequirePaidInvoice: boolean;
  invoiceIncludeMaterialVariance: boolean;
  lowStockAlertsEnabled: boolean;
  integrations: {
    googleSignIn: boolean;
    payments: string;
    storage: string;
    sms: boolean;
    whatsapp: boolean;
    push: boolean;
    email: string;
  };
}

export interface CustomerDashboardDto {
  firstName: string;
  onboardingCompleted: boolean;
  rewards: RewardsSummaryDto;
  activeJob: JobSummaryDto | null;
  activeJobs: JobSummaryDto[];
  quotesAwaiting: { id: string; jobId: string; jobReference: string; total: number; validUntil: string }[];
  invoicesDue: { id: string; number: string; amountDue: number; dueDate: string; status: InvoiceStatus }[];
  recentNotifications: NotificationDto[];
  unreadNotifications: number;
}

export interface EmployeeTodayDto {
  employee: { id: string; name: string; staffNumber: string | null };
  openShift: TimesheetDto | null;
  todayHours: number;
  nextJob: JobSummaryDto | null;
  todaysJobs: JobSummaryDto[];
  upcomingJobs: JobSummaryDto[];
  /** All jobs currently assigned to this electrician and not yet finished (any date). */
  assignedOpenJobs: number;
  pendingTasks: { jobId: string; jobReference: string; task: string }[];
  pendingLeave: LeaveRequestDto[];
  recentNotifications: NotificationDto[];
  unreadNotifications: number;
}

export interface AdminDashboardDto {
  kpis: {
    activeJobs: number;
    requestedJobs: number;
    quotesAwaiting: number;
    invoicesOutstanding: number;
    outstandingAmount: number;
    lowStockCount: number;
    staffClockedIn: number;
    pendingLeave: number;
    newEnquiries: number;
    missedCallsToReview: number;
    revenueThisMonth: number;
  };
  urgentJobs: JobSummaryDto[];
  activeJobs: JobSummaryDto[];
  recentActivity: { id: string; action: string; entityType: string; entityId: string | null; actorName: string | null; createdAt: string }[];
  unreadNotifications: number;
}

export interface ReportSummaryDto {
  from: string;
  to: string;
  revenue: number;
  paymentsCount: number;
  jobsCreated: number;
  jobsCompleted: number;
  jobsByStatus: { status: JobStatus; count: number }[];
  jobsByService: { serviceName: string; count: number }[];
  averageQuoteValue: number;
  quoteAcceptanceRate: number;
  outstandingAmount: number;
  materialsCost: number;
  labourHours: number;
  payrollNet: number;
  enquiries: number;
  enquiryConversionRate: number;
}

export interface QrTokenDto {
  jobId: string;
  jobReference: string;
  token: string;
  payload: string;
  expiresAt: string;
}
