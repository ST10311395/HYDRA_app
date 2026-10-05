import { z } from 'zod';
import { JOB_URGENCIES, type JobUrgency } from '../enums.js';
import { isoDate, money, optionalText, paginationQuery, trimmed, uuid } from './common.js';

/**
 * HYDRA Smart Quote — AI quotation & triage assistant (docs/AI_ASSISTANT.md).
 *
 * The AI provider only *suggests* (structured JSON validated by `aiAnalysisSchema`). Severity floors,
 * escalation, confidence outcomes and displayed prices are decided by deterministic server code using the
 * versioned policies below. Enum values are mirrored by CHECK constraints in migration 006.
 */

// ---- Enumerations ------------------------------------------------------------------------------------

export const AI_CASE_STATUSES = [
  'NEW',
  'AI_PROCESSING',
  'NEEDS_INFORMATION',
  'AI_ANSWERED',
  'NEEDS_ADMIN_REVIEW',
  'ADMIN_RESPONDED',
  'PROPOSAL_SENT',
  'CUSTOMER_ACCEPTED',
  'CONVERTED_TO_JOB',
  'CLOSED',
] as const;
export type AiCaseStatus = (typeof AI_CASE_STATUSES)[number];

export const AI_CASE_STATUS_LABELS: Record<AiCaseStatus, string> = {
  NEW: 'New',
  AI_PROCESSING: 'Assessing',
  NEEDS_INFORMATION: 'More information needed',
  AI_ANSWERED: 'Preliminary proposal ready',
  NEEDS_ADMIN_REVIEW: 'With our team for review',
  ADMIN_RESPONDED: 'Team responded',
  PROPOSAL_SENT: 'Proposal ready',
  CUSTOMER_ACCEPTED: 'Proposal accepted',
  CONVERTED_TO_JOB: 'Service request created',
  CLOSED: 'Closed',
};

export const AI_MESSAGE_ROLES = ['CUSTOMER', 'ASSISTANT', 'ADMIN', 'SYSTEM'] as const;
export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

export const AI_MESSAGE_KINDS = [
  'TEXT',
  'CLARIFICATION',
  'ASSESSMENT',
  'SAFETY_WARNING',
  'ESCALATION_NOTICE',
  'ADMIN_REPLY',
  'INFO_REQUEST',
  'PROPOSAL',
  'STATUS',
] as const;
export type AiMessageKind = (typeof AI_MESSAGE_KINDS)[number];

export const AI_OUTCOMES = ['NEEDS_INFORMATION', 'PROPOSAL', 'PROPOSAL_REVIEW_RECOMMENDED', 'ADMIN_REVIEW', 'SAFETY_ESCALATION'] as const;
export type AiOutcome = (typeof AI_OUTCOMES)[number];

export const AI_ESCALATION_REASONS = [
  'LOW_CONFIDENCE',
  'REVIEW_RECOMMENDED',
  'HIGH_SEVERITY',
  'CRITICAL_SAFETY',
  'SAFETY_TRIGGER',
  'UNSUPPORTED_CATEGORY',
  'IMAGE_UNCLEAR',
  'CONFLICTING_INFORMATION',
  'PRICE_CONFIDENCE_POOR',
  'PRICE_INPUTS_OUT_OF_RANGE',
  'HISTORICAL_PRICE_DEVIATION',
  'PROVIDER_UNAVAILABLE',
  'MALFORMED_AI_RESPONSE',
  'UNSAFE_AI_OUTPUT',
  'AI_REQUESTED_REVIEW',
  'CUSTOMER_REQUESTED_HUMAN',
  'CUSTOMER_REPLIED',
  'POLICY_REQUIRES_APPROVAL',
  'MAX_CLARIFICATIONS_REACHED',
] as const;
export type AiEscalationReason = (typeof AI_ESCALATION_REASONS)[number];

export const AI_ESCALATION_REASON_LABELS: Record<AiEscalationReason, string> = {
  LOW_CONFIDENCE: 'AI confidence below the review threshold',
  REVIEW_RECOMMENDED: 'AI confidence in the review-recommended band',
  HIGH_SEVERITY: 'Severity 4 or higher',
  CRITICAL_SAFETY: 'Severity 5 — potential immediate danger',
  SAFETY_TRIGGER: 'Deterministic safety rule triggered',
  UNSUPPORTED_CATEGORY: 'Service category not supported for automatic estimates',
  IMAGE_UNCLEAR: 'Images unclear or could not be analysed',
  CONFLICTING_INFORMATION: 'Conflicting information in the request',
  PRICE_CONFIDENCE_POOR: 'Price range confidence is poor',
  PRICE_INPUTS_OUT_OF_RANGE: 'AI pricing inputs outside allowed thresholds (clamped)',
  HISTORICAL_PRICE_DEVIATION: 'Estimate deviates from approved historical jobs',
  PROVIDER_UNAVAILABLE: 'AI provider unavailable (timeout, rate limit or error)',
  MALFORMED_AI_RESPONSE: 'AI response failed validation',
  UNSAFE_AI_OUTPUT: 'AI output contained unsafe instructions (removed)',
  AI_REQUESTED_REVIEW: 'The AI asked for human review',
  CUSTOMER_REQUESTED_HUMAN: 'Customer asked for a person',
  CUSTOMER_REPLIED: 'Customer replied to the team',
  POLICY_REQUIRES_APPROVAL: 'Business rule requires admin approval',
  MAX_CLARIFICATIONS_REACHED: 'Clarification limit reached without enough detail',
};

export const AI_PROPERTY_TYPES = ['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL'] as const;
export type AiPropertyType = (typeof AI_PROPERTY_TYPES)[number];

export const AI_PROPOSAL_STATUSES = ['SENT', 'ACCEPTED', 'DECLINED', 'SUPERSEDED', 'WITHDRAWN'] as const;
export type AiProposalStatus = (typeof AI_PROPOSAL_STATUSES)[number];

export const AI_KNOWLEDGE_STATUSES = ['PENDING', 'APPROVED', 'ARCHIVED'] as const;
export type AiKnowledgeStatus = (typeof AI_KNOWLEDGE_STATUSES)[number];

export const AI_ASSESSMENT_VERDICTS = ['CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT'] as const;
export const AI_SEVERITY_VERDICTS = ['CORRECT', 'TOO_LOW', 'TOO_HIGH'] as const;
export const AI_PRICE_VERDICTS = ['ACCURATE', 'TOO_LOW', 'TOO_HIGH'] as const;
export const AI_HELPFUL_ANSWERS = ['YES', 'PARTLY', 'NO'] as const;

export const AI_QUEUE_TABS = ['NEEDS_REVIEW', 'URGENT', 'WAITING_CUSTOMER', 'RESPONDED', 'ACCEPTED', 'CLOSED', 'ALL'] as const;
export type AiQueueTab = (typeof AI_QUEUE_TABS)[number];

export const AI_PROVIDER_MODES = ['ENV_DEFAULT', 'HUMAN_ONLY'] as const;

/** Customer-facing wording that must accompany every preliminary estimate / proposal. */
export const AI_ESTIMATE_NOTICE = 'Preliminary estimate only. Final pricing may change following on-site inspection.';
export const AI_DISCLAIMER =
  'This assessment is based on the information and images provided. It is a preliminary estimate and not a final electrical diagnosis or binding quotation. Final scope and pricing may change following inspection by a qualified PSG Electrical/TRITE Solar technician.';
export const AI_SAFETY_MESSAGE =
  "This may represent an immediate electrical safety risk. Do not touch damaged electrical equipment. Move away from the affected area where appropriate and contact emergency services or PSG Electrical's emergency service if immediate assistance is required.";
export const AI_ESCALATION_MESSAGE =
  "I need a member of our team to review this request. Your enquiry has been sent to PSG Electrical. You'll receive a response through HYDRA.";
export const AI_PROVIDER_FAILURE_MESSAGE = 'Your request has been saved and sent to our team for review.';
export const AI_IMAGE_UNAVAILABLE_NOTICE = 'AI image analysis is unavailable in this development environment.';
export const AI_SIMULATION_LABEL = 'Development AI simulation';

// ---- Provider structured output (never trusted raw) --------------------------------------------------

const shortText = (max: number) => z.string().trim().max(max);

export const aiAnalysisSchema = z.object({
  summary: z.string().trim().min(3).max(600),
  serviceCategory: z.string().trim().min(2).max(60),
  severity: z.coerce.number().int().min(1).max(5),
  severityReason: shortText(600).default(''),
  observations: z.array(shortText(300)).max(10).default([]),
  clarifyingQuestions: z.array(z.string().trim().min(3).max(300)).max(5).default([]),
  needsMoreInformation: z.boolean().default(false),
  estimatedLabourHours: z
    .object({ min: z.coerce.number().min(0).max(2000), max: z.coerce.number().min(0).max(2000) })
    .refine((v) => v.min <= v.max, { message: 'min must be <= max' })
    .nullable()
    .default(null),
  suggestedPricingFactors: z.array(shortText(200)).max(10).default([]),
  confidence: z.coerce.number().min(0).max(100).transform((v) => Math.round(v)),
  requiresAdminReview: z.boolean().default(false),
  adminReviewReason: shortText(300).nullable().default(null),
  safetyFlags: z.array(shortText(80)).max(10).default([]),
  imageFindings: z
    .object({
      status: z.enum(['ANALYSED', 'UNCLEAR', 'NOT_PROVIDED', 'UNAVAILABLE']),
      notes: z.array(shortText(300)).max(10).default([]),
    })
    .default({ status: 'NOT_PROVIDED', notes: [] }),
  conflictingInformation: z.boolean().default(false),
});
export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;

// ---- Customer requests -----------------------------------------------------------------------------

export const startAiConversationSchema = z
  .object({
    message: trimmed(2000, 5),
    attachmentIds: z.array(uuid).max(6).default([]),
    propertyType: z.enum(AI_PROPERTY_TYPES).optional(),
    /** Suburb / town only — the full site address is collected when a proposal is accepted. */
    siteArea: optionalText(120),
    urgency: z.enum(JOB_URGENCIES).optional(),
  })
  .strict();
export type StartAiConversationInput = z.infer<typeof startAiConversationSchema>;

export const aiMessageSchema = z
  .object({
    body: trimmed(2000, 1),
    attachmentIds: z.array(uuid).max(6).default([]),
  })
  .strict();
export type AiMessageInput = z.infer<typeof aiMessageSchema>;

export const acceptAiProposalSchema = z
  .object({
    siteAddress: trimmed(300, 5),
    contactPhone: optionalText(24),
    preferredDate: isoDate.optional(),
    confirm: z.literal(true, { message: 'Please confirm you understand this is a preliminary estimate' }),
  })
  .strict();
export type AcceptAiProposalInput = z.infer<typeof acceptAiProposalSchema>;

export const declineAiProposalSchema = z.object({ reason: optionalText(500) }).strict();
export const requestAiReviewSchema = z.object({ note: optionalText(500) }).strict();
export const customerAiFeedbackSchema = z
  .object({ helpful: z.enum(AI_HELPFUL_ANSWERS), comment: optionalText(500) })
  .strict();

// ---- Admin requests ----------------------------------------------------------------------------------

export const aiCaseListQuery = paginationQuery.extend({
  tab: z.enum(AI_QUEUE_TABS).default('NEEDS_REVIEW'),
  severity: z.coerce.number().int().min(1).max(5).optional(),
});

export const adminAiReplySchema = z
  .object({
    body: trimmed(2000, 2),
    /** True when the reply asks the customer for more information (status → NEEDS_INFORMATION). */
    requestInformation: z.boolean().default(false),
  })
  .strict();

export const adminAiAssessmentEditSchema = z
  .object({
    summary: optionalText(600),
    serviceCategory: optionalText(60),
    severity: z.number().int().min(1).max(5).optional(),
    severityReason: optionalText(600),
    priceMin: money.optional(),
    priceMax: money.optional(),
    note: trimmed(500, 3),
  })
  .strict()
  .refine((v) => (v.priceMin === undefined) === (v.priceMax === undefined), {
    message: 'Provide both a minimum and maximum price',
    path: ['priceMax'],
  })
  .refine((v) => v.priceMin === undefined || v.priceMax === undefined || v.priceMin <= v.priceMax, {
    message: 'Minimum must not exceed maximum',
    path: ['priceMax'],
  })
  .refine((v) => v.priceMin === undefined || v.priceMin > 0, { message: 'Price must be greater than 0', path: ['priceMin'] });
export type AdminAiAssessmentEditInput = z.infer<typeof adminAiAssessmentEditSchema>;

export const adminSendProposalSchema = z.object({ message: optionalText(1000) }).strict();

export const adminAiConvertSchema = z
  .object({
    serviceTypeId: uuid,
    siteAddress: trimmed(300, 5),
    description: optionalText(2000),
  })
  .strict();

export const adminAiCloseSchema = z.object({ reason: trimmed(500, 3) }).strict();

export const adminAiFeedbackSchema = z
  .object({
    assessmentVerdict: z.enum(AI_ASSESSMENT_VERDICTS),
    severityVerdict: z.enum(AI_SEVERITY_VERDICTS),
    priceVerdict: z.enum(AI_PRICE_VERDICTS),
    comment: optionalText(1000),
  })
  .strict();

// ---- Knowledge base ----------------------------------------------------------------------------------

export const knowledgeEntrySchema = z
  .object({
    title: trimmed(160, 5),
    serviceCategory: trimmed(60, 2),
    problemSummary: trimmed(1500, 10),
    symptoms: z.array(trimmed(200, 2)).max(15).default([]),
    severity: z.number().int().min(1).max(5),
    pricingContext: optionalText(1000),
    recommendedResponse: trimmed(3000, 10),
    clarifyingQuestions: z.array(trimmed(300, 3)).max(5).default([]),
    keywords: z.array(trimmed(40, 2)).max(25).default([]),
    sourceConversationId: uuid.optional(),
  })
  .strict();
export type KnowledgeEntryInput = z.infer<typeof knowledgeEntrySchema>;

export const knowledgeUpdateSchema = z
  .object({
    title: trimmed(160, 5).optional(),
    serviceCategory: trimmed(60, 2).optional(),
    problemSummary: trimmed(1500, 10).optional(),
    symptoms: z.array(trimmed(200, 2)).max(15).optional(),
    severity: z.number().int().min(1).max(5).optional(),
    pricingContext: optionalText(1000),
    recommendedResponse: trimmed(3000, 10).optional(),
    clarifyingQuestions: z.array(trimmed(300, 3)).max(5).optional(),
    keywords: z.array(trimmed(40, 2)).max(25).optional(),
    changeNote: trimmed(300, 3),
  })
  .strict();
export type KnowledgeUpdateInput = z.infer<typeof knowledgeUpdateSchema>;

export const knowledgeListQuery = paginationQuery.extend({
  status: z.enum(AI_KNOWLEDGE_STATUSES).optional(),
  category: optionalText(60),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

// ---- Owner configuration (versioned policies) ----------------------------------------------------------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Use HH:MM' });

export const aiSettingsSchema = z
  .object({
    featureEnabled: z.boolean(),
    providerMode: z.enum(AI_PROVIDER_MODES),
    /** Overrides AI_MODEL for the configured provider; never a secret. */
    modelName: z.string().trim().max(80).regex(/^[A-Za-z0-9._:\-/]*$/, { message: 'Invalid model name' }),
    maxClarificationRounds: z.number().int().min(0).max(5),
    proposalConfidenceThreshold: z.number().int().min(50).max(100),
    reviewConfidenceThreshold: z.number().int().min(0).max(99),
    escalateSeverityAtOrAbove: z.number().int().min(3).max(4),
    requireAdminApprovalForAllProposals: z.boolean(),
    knowledgeRetrievalCount: z.number().int().min(0).max(10),
    officeAdminCanApproveKnowledge: z.boolean(),
    pricingTolerancePct: z.number().min(5).max(300),
    maxImagesPerConversation: z.number().int().min(1).max(20),
    reviewAgeingHours: z.number().int().min(1).max(168),
  })
  .strict()
  .refine((v) => v.reviewConfidenceThreshold < v.proposalConfidenceThreshold, {
    message: 'The review threshold must be below the proposal threshold',
    path: ['reviewConfidenceThreshold'],
  });
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const severityLevelSchema = z
  .object({
    level: z.number().int().min(1).max(5),
    name: trimmed(40, 2),
    description: trimmed(500, 5),
    examples: z.array(trimmed(120, 2)).max(12),
    targetResponse: trimmed(80, 3),
    responseWindow: trimmed(120, 3),
    customerWording: trimmed(500, 10),
    escalate: z.boolean(),
    adminApprovalRequired: z.boolean(),
    jobUrgency: z.enum(JOB_URGENCIES),
  })
  .strict();
export type SeverityLevel = z.infer<typeof severityLevelSchema>;

export const safetyRuleSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{2,39}$/, { message: 'Use UPPER_SNAKE_CASE' }),
    label: trimmed(80, 3),
    keywords: z.array(z.string().trim().toLowerCase().min(3).max(60)).min(1).max(30),
    minSeverity: z.number().int().min(3).max(5),
  })
  .strict();
export type SafetyRule = z.infer<typeof safetyRuleSchema>;

export const severityPolicySchema = z
  .object({
    levels: z.array(severityLevelSchema).length(5),
    additionalSafetyRules: z.array(safetyRuleSchema).max(30),
    businessHours: z
      .object({ timezone: z.string().min(3).max(60), days: z.array(z.number().int().min(0).max(6)).min(1).max(7), start: hhmm, end: hhmm })
      .strict()
      .refine((b) => b.start < b.end, { message: 'Start must be before end', path: ['end'] }),
    outOfHoursNotice: trimmed(300, 10),
  })
  .strict()
  .refine((p) => p.levels.every((l, i) => l.level === i + 1), { message: 'Levels must be 1–5 in order', path: ['levels'] })
  .refine((p) => p.levels[4]!.escalate && p.levels[4]!.adminApprovalRequired && p.levels[3]!.escalate, {
    message: 'Severity 4 must escalate; severity 5 must escalate and require admin approval',
    path: ['levels'],
  });
export type SeverityPolicy = z.infer<typeof severityPolicySchema>;

const range = (min: z.ZodNumber) =>
  z.object({ min, max: min }).strict().refine((r) => r.min <= r.max, { message: 'min must be <= max' });

export const pricingCategorySchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/, { message: 'Use UPPER_SNAKE_CASE' }),
    label: trimmed(80, 2),
    /** Existing `service_types.slug` the accepted proposal becomes a job under (no duplicate services). */
    serviceTypeSlug: z.string().trim().max(80).nullable(),
    supported: z.boolean(),
    keywords: z.array(z.string().trim().toLowerCase().min(2).max(40)).max(40),
    calloutFee: money,
    labourHours: range(z.number().min(0).max(2000)),
    materials: range(money),
    typicalMaterials: z
      .array(z.object({ sku: trimmed(40, 1), qtyMin: z.number().min(0).max(10_000), qtyMax: z.number().min(0).max(10_000) }).strict())
      .max(10),
    priceFloor: money,
    priceCeiling: money,
    defaultSeverity: z.number().int().min(1).max(5),
  })
  .strict()
  .refine((c) => c.priceFloor <= c.priceCeiling, { message: 'Floor must not exceed ceiling', path: ['priceCeiling'] });
export type PricingCategory = z.infer<typeof pricingCategorySchema>;

export const pricingPolicySchema = z
  .object({
    labourRatePerHour: money.refine((v) => v >= 50, { message: 'Labour rate must be at least R50/h' }),
    afterHoursMultiplier: z.number().min(1).max(3),
    afterHoursCalloutSurcharge: money,
    urgencyUpliftPct: z.array(z.number().min(0).max(100)).length(5),
    materialMarkupPct: z.number().min(0).max(200),
    globalMinimum: money,
    globalMaximum: money,
    roundTo: z.number().int().min(1).max(1000),
    includeVat: z.boolean(),
    categories: z.array(pricingCategorySchema).min(1).max(40),
  })
  .strict()
  .refine((p) => p.globalMinimum < p.globalMaximum, { message: 'Global minimum must be below maximum', path: ['globalMaximum'] })
  .refine((p) => new Set(p.categories.map((c) => c.code)).size === p.categories.length, { message: 'Category codes must be unique', path: ['categories'] });
export type PricingPolicy = z.infer<typeof pricingPolicySchema>;

export const aiAnalyticsQuery = z
  .object({ from: isoDate.optional(), to: isoDate.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: '`from` must be on or before `to`', path: ['to'] });

// ---- Response DTOs -------------------------------------------------------------------------------------

export interface AiStatusDto {
  enabled: boolean;
  simulation: boolean;
  simulationLabel: string | null;
  providerConfigured: boolean;
  supportsImages: boolean;
  humanOnly: boolean;
  maxImagesPerConversation: number;
  maxImagesPerMessage: number;
  maxClarificationRounds: number;
  disclaimer: string;
  estimateNotice: string;
  unavailableReason: string | null;
}

export interface AiAttachmentDto {
  id: string;
  fileId: string;
  messageId: string | null;
  fileName: string;
  mimeType: string;
  url: string;
  analysisStatus: 'PENDING' | 'ANALYSED' | 'UNCLEAR' | 'UNAVAILABLE' | 'NOT_SENT';
  createdAt: string;
}

export interface AiMessageDto {
  id: string;
  role: AiMessageRole;
  kind: AiMessageKind;
  body: string;
  /** "PSG Electrical team" for admin replies — never presented as AI output. */
  authorLabel: string;
  questions: string[];
  attachments: AiAttachmentDto[];
  createdAt: string;
}

export interface AiPriceDto {
  min: number;
  max: number;
  serviceMin: number;
  serviceMax: number;
  labourMin: number;
  labourMax: number;
  materialsMin: number;
  materialsMax: number;
  callout: number;
  urgencyMin: number;
  urgencyMax: number;
  afterHours: boolean;
  includesVat: boolean;
  basis: string[];
  clamped: boolean;
}

export interface AiResponseWindowDto {
  severity: number;
  severityName: string;
  targetResponse: string;
  responseWindow: string;
  wording: string;
  outOfHoursNotice: string | null;
}

export interface AiAssessmentDto {
  id: string;
  version: number;
  source: 'AI' | 'ADMIN' | 'FALLBACK';
  summary: string;
  serviceCategory: string;
  serviceCategoryLabel: string;
  observations: string[];
  severity: number;
  severityName: string;
  severityReason: string;
  safetyFlags: string[];
  confidence: number;
  outcome: AiOutcome;
  response: AiResponseWindowDto;
  /** Null when the estimate is withheld from the customer pending admin review. */
  estimate: AiPriceDto | null;
  imageAnalysis: { status: string; notice: string | null; notes: string[] };
  isSimulation: boolean;
  createdAt: string;
}

export interface AiProposalDto {
  id: string;
  status: AiProposalStatus;
  assessmentId: string;
  priceMin: number;
  priceMax: number;
  priceSource: 'SYSTEM' | 'ADMIN';
  severity: number;
  severityName: string;
  targetResponse: string;
  responseWording: string;
  serviceCategoryLabel: string;
  summary: string;
  message: string | null;
  includes: string[];
  potentialAdditionalCosts: string[];
  approvedByAdmin: boolean;
  sentAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  jobId: string | null;
  jobReference: string | null;
}

export interface AiConversationSummaryDto {
  id: string;
  reference: string;
  title: string;
  status: AiCaseStatus;
  statusLabel: string;
  severity: number | null;
  estimateMin: number | null;
  estimateMax: number | null;
  adminReview: 'NOT_REQUIRED' | 'PENDING' | 'REVIEWED';
  proposalStatus: AiProposalStatus | null;
  jobId: string | null;
  jobReference: string | null;
  isSimulation: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversationDto extends AiConversationSummaryDto {
  propertyType: AiPropertyType | null;
  siteArea: string | null;
  urgency: JobUrgency | null;
  messages: AiMessageDto[];
  assessment: AiAssessmentDto | null;
  proposal: AiProposalDto | null;
  clarificationRounds: number;
  maxClarificationRounds: number;
  safetyWarning: string | null;
  pendingReview: boolean;
  customerFeedback: string | null;
  can: { sendMessage: boolean; accept: boolean; decline: boolean; requestReview: boolean; giveFeedback: boolean };
  notices: { disclaimer: string; estimateNotice: string; simulation: string | null };
}

export interface AiSafetyTriggerDto {
  code: string;
  label: string;
  matched: string;
  minSeverity: number;
  /** Mentioned but negated ("no burning smell") — shown to admins, never raises severity. */
  negated?: boolean;
}

export interface AiAdminAssessmentDto extends AiAssessmentDto {
  provider: string;
  model: string;
  promptVersion: string;
  severityPolicyVersion: number;
  pricingPolicyVersion: number;
  settingsVersion: number;
  aiSeverity: number | null;
  ruleSeverityFloor: number | null;
  aiConfidence: number | null;
  safetyTriggers: AiSafetyTriggerDto[];
  escalationReasons: AiEscalationReason[];
  requiresAdminReview: boolean;
  aiInputs: { labourHours: { min: number; max: number } | null; pricingFactors: string[]; rawCategory: string | null; clarifyingQuestions: string[] } | null;
  systemEstimate: AiPriceDto | null;
  adminPrice: { min: number; max: number } | null;
  historicalReference: { sampleSize: number; median: number; p25: number; p75: number; serviceType: string } | null;
  retrievedKnowledge: { id: string; version: number; title: string; score: number }[];
  createdByName: string | null;
  latencyMs: number | null;
  errorCode: string | null;
}

export interface AiCaseSummaryDto {
  id: string;
  reference: string;
  title: string;
  status: AiCaseStatus;
  statusLabel: string;
  customerName: string;
  firstMessage: string;
  thumbnails: string[];
  serviceCategoryLabel: string | null;
  severity: number | null;
  confidence: number | null;
  estimateMin: number | null;
  estimateMax: number | null;
  escalationReasons: AiEscalationReason[];
  reviewRequired: boolean;
  humanRequested: boolean;
  isSimulation: boolean;
  ageMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiAdminReviewDto {
  id: string;
  action: string;
  note: string | null;
  changes: Record<string, unknown> | null;
  adminName: string;
  createdAt: string;
}

export interface AiCaseDetailDto extends AiCaseSummaryDto {
  customer: { id: string; userId: string; name: string; email: string; phone: string | null };
  propertyType: AiPropertyType | null;
  siteArea: string | null;
  urgency: JobUrgency | null;
  messages: AiMessageDto[];
  attachments: AiAttachmentDto[];
  assessment: AiAdminAssessmentDto | null;
  assessments: AiAdminAssessmentDto[];
  proposal: AiProposalDto | null;
  reviews: AiAdminReviewDto[];
  adminFeedback: { assessmentVerdict: string; severityVerdict: string; priceVerdict: string; comment: string | null } | null;
  customerFeedback: { helpful: string; comment: string | null } | null;
  providerCalls: { id: string; provider: string; model: string; operation: string; status: string; latencyMs: number; attempt: number; createdAt: string }[];
  knowledgeEntries: { id: string; title: string; status: AiKnowledgeStatus }[];
  jobId: string | null;
  jobReference: string | null;
  allowedActions: string[];
}

export interface AiKnowledgeEntryDto {
  id: string;
  title: string;
  serviceCategory: string;
  problemSummary: string;
  symptoms: string[];
  severity: number;
  pricingContext: string | null;
  recommendedResponse: string;
  clarifyingQuestions: string[];
  keywords: string[];
  status: AiKnowledgeStatus;
  active: boolean;
  version: number;
  sourceConversationId: string | null;
  sourceReference: string | null;
  sourceAssessmentId: string | null;
  createdByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  timesRetrieved: number;
  createdAt: string;
  updatedAt: string;
  revisions?: { version: number; editedByName: string | null; changeNote: string | null; createdAt: string }[];
}

export interface AiSettingsDto {
  settings: AiSettings;
  settingsVersion: number;
  severityPolicy: SeverityPolicy;
  severityPolicyVersion: number;
  pricingPolicy: PricingPolicy;
  pricingPolicyVersion: number;
  coreSafetyRules: SafetyRule[];
  promptVersion: string;
  provider: { name: string; model: string; configured: boolean; simulation: boolean; supportsImages: boolean; envEnabled: boolean; apiKey: 'Configured' | 'Not configured' };
  canEdit: boolean;
}

export interface AiAnalyticsDto {
  from: string;
  to: string;
  totals: {
    enquiries: number;
    aiResolved: number;
    escalated: number;
    proposals: number;
    accepted: number;
    converted: number;
    knowledgeAdded: number;
    correctedByAdmin: number;
    providerFailures: number;
  };
  rates: { aiResolutionRate: number | null; escalationRate: number | null; acceptanceRate: number | null };
  averageConfidence: number | null;
  bySeverity: { severity: number; count: number }[];
  byCategory: { category: string; label: string; count: number }[];
  topEscalationReasons: { reason: string; label: string; count: number }[];
  commonProblems: { title: string; count: number }[];
  unknownQuestions: { reference: string; conversationId: string; message: string; createdAt: string }[];
  feedback: {
    assessment: Record<string, number>;
    severity: Record<string, number>;
    price: Record<string, number>;
    customerHelpful: Record<string, number>;
  };
  estimateVariance: {
    samples: number;
    averageAbsoluteDifference: number | null;
    averagePercentVariance: number | null;
    items: { reference: string; jobReference: string; estimateMid: number; quoteTotal: number | null; invoiceTotal: number | null; percentVariance: number | null }[];
  };
}

export interface JobAiSummaryDto {
  conversationId: string;
  reference: string;
  summary: string;
  serviceCategoryLabel: string;
  severity: number;
  severityName: string;
  safetyFlags: string[];
  observations: string[];
  attachments: AiAttachmentDto[];
  /** Pricing is shown to admins and the customer only. */
  estimate: { min: number; max: number } | null;
  acceptedAt: string | null;
}
