import {
  AI_CASE_STATUS_LABELS,
  AI_DISCLAIMER,
  AI_ESTIMATE_NOTICE,
  AI_SAFETY_MESSAGE,
  AI_SIMULATION_LABEL,
  type AiAdminAssessmentDto,
  type AiAssessmentDto,
  type AiAttachmentDto,
  type AiConversationDto,
  type AiConversationSummaryDto,
  type AiMessageDto,
  type AiProposalDto,
} from '@hydra/shared';
import { integrations } from '../../integrations';
import type { AssessmentRow, AttachmentRow, ConversationRow, MessageRow, ProposalRow } from '../../repositories/aiRepository';
import { SIGNED_URL_TTL_SECONDS } from '../fileService';

const iso = (v: string | Date | null): string | null => (v === null ? null : new Date(v).toISOString());

const AUTHOR: Record<MessageRow['role'], string> = {
  CUSTOMER: 'You',
  ASSISTANT: 'HYDRA Smart Quote',
  ADMIN: 'PSG Electrical team response',
  SYSTEM: 'HYDRA',
};

export async function attachmentDtos(rows: AttachmentRow[]): Promise<AiAttachmentDto[]> {
  return Promise.all(
    rows.map(async (a) => ({
      id: a.id,
      fileId: a.fileId,
      messageId: a.messageId,
      fileName: a.originalName,
      mimeType: a.mimeType,
      url: await integrations().storage.signedUrl(a.storageKey, SIGNED_URL_TTL_SECONDS, a.originalName),
      analysisStatus: a.analysisStatus,
      createdAt: iso(a.createdAt)!,
    })),
  );
}

export function messageDtos(rows: MessageRow[], attachments: AiAttachmentDto[], simulation: boolean): AiMessageDto[] {
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    kind: m.kind,
    body: m.body,
    authorLabel: m.role === 'ASSISTANT' && simulation ? `HYDRA Smart Quote · ${AI_SIMULATION_LABEL}` : AUTHOR[m.role],
    questions: m.questions ?? [],
    attachments: attachments.filter((a) => a.messageId === m.id),
    createdAt: iso(m.createdAt)!,
  }));
}

/** Customer-safe assessment view. Pricing appears only through an issued proposal. */
export function assessmentDto(a: AssessmentRow, proposal: ProposalRow | null): AiAssessmentDto {
  const showSystemPrice = !!proposal && proposal.assessmentId === a.id && proposal.priceSource === 'SYSTEM' && !!a.priceBreakdown;
  return {
    id: a.id,
    version: a.version,
    source: a.source,
    summary: a.summary,
    serviceCategory: a.serviceCategory,
    serviceCategoryLabel: a.serviceCategoryLabel,
    observations: a.observations,
    severity: a.finalSeverity,
    severityName: a.responseWindow.severityName,
    severityReason: a.severityReason,
    safetyFlags: (a.safetyTriggers ?? []).filter((t) => !t.negated).map((t) => t.label),
    confidence: a.finalConfidence,
    outcome: a.outcome,
    response: a.responseWindow,
    estimate: showSystemPrice ? { ...a.priceBreakdown!, min: proposal!.priceMin, max: proposal!.priceMax } : null,
    imageAnalysis: a.imageAnalysis?.status ? a.imageAnalysis : { status: 'NOT_PROVIDED', notice: null, notes: [] },
    isSimulation: a.isSimulation,
    createdAt: iso(a.createdAt)!,
  };
}

export function adminAssessmentDto(a: AssessmentRow): AiAdminAssessmentDto {
  return {
    ...assessmentDto(a, null),
    estimate: a.priceBreakdown,
    systemEstimate: a.priceBreakdown,
    provider: a.provider,
    model: a.model,
    promptVersion: a.promptVersion,
    severityPolicyVersion: a.severityPolicyVersion,
    pricingPolicyVersion: a.pricingPolicyVersion,
    settingsVersion: a.settingsVersion,
    aiSeverity: a.aiSeverity,
    ruleSeverityFloor: a.ruleSeverityFloor,
    aiConfidence: a.aiConfidence,
    safetyTriggers: a.safetyTriggers ?? [],
    escalationReasons: a.escalationReasons ?? [],
    requiresAdminReview: a.requiresAdminReview,
    aiInputs: a.aiInputs,
    adminPrice: a.adminPriceMin !== null && a.adminPriceMax !== null ? { min: a.adminPriceMin, max: a.adminPriceMax } : null,
    historicalReference: a.historicalReference,
    retrievedKnowledge: a.retrievedKnowledge ?? [],
    createdByName: a.createdByName,
    latencyMs: a.latencyMs,
    errorCode: a.errorCode,
  };
}

export function proposalDto(p: ProposalRow, a: AssessmentRow | null): AiProposalDto {
  const system = p.priceSource === 'SYSTEM';
  const includes = system
    ? [a?.priceBreakdown?.callout ? 'Call-out' : null, 'Fault investigation / assessment on site', 'Estimated labour', a?.priceBreakdown?.materialsMax ? 'Allowance for typical materials' : null].filter((x): x is string => !!x)
    : ['Scope and range reviewed by the PSG Electrical team'];
  return {
    id: p.id,
    status: p.status,
    assessmentId: p.assessmentId,
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    priceSource: p.priceSource,
    severity: p.severity,
    severityName: p.responseWindow.severityName,
    targetResponse: p.responseWindow.targetResponse,
    responseWording: p.responseWindow.wording,
    serviceCategoryLabel: a?.serviceCategoryLabel ?? 'Electrical service',
    summary: a?.summary ?? '',
    message: p.message,
    includes,
    potentialAdditionalCosts: ['Replacement components or parts if required', 'Additional work found during inspection', 'After-hours attendance if requested'],
    approvedByAdmin: !!p.approvedBy,
    sentAt: iso(p.sentAt)!,
    acceptedAt: iso(p.acceptedAt),
    declinedAt: iso(p.declinedAt),
    jobId: p.jobId,
    jobReference: p.jobReference,
  };
}

const COMPLETED_JOB = ['COMPLETED', 'INVOICED', 'PARTIALLY_PAID', 'PAID'];

export function summaryDto(
  c: ConversationRow,
  extra: { proposalStatus: AiProposalDto['status'] | null; estimateMin: number | null; estimateMax: number | null; adminEngaged: boolean },
): AiConversationSummaryDto {
  return {
    id: c.id,
    reference: c.reference,
    title: c.title,
    status: c.status,
    statusLabel: AI_CASE_STATUS_LABELS[c.status],
    severity: c.currentSeverity,
    estimateMin: extra.estimateMin,
    estimateMax: extra.estimateMax,
    adminReview: c.status === 'NEEDS_ADMIN_REVIEW' || c.reviewRequired ? 'PENDING' : extra.adminEngaged ? 'REVIEWED' : 'NOT_REQUIRED',
    proposalStatus: extra.proposalStatus,
    jobId: c.convertedJobId,
    jobReference: c.convertedJobReference,
    isSimulation: c.isSimulation,
    createdAt: iso(c.createdAt)!,
    updatedAt: iso(c.lastActivityAt)!,
  };
}

export function conversationDto(input: {
  c: ConversationRow;
  messages: AiMessageDto[];
  latest: AssessmentRow | null;
  proposal: ProposalRow | null;
  proposalAssessment: AssessmentRow | null;
  adminEngaged: boolean;
  customerFeedback: string | null;
  maxClarificationRounds: number;
  enabled: boolean;
}): AiConversationDto {
  const { c, latest, proposal } = input;
  const live = proposal && proposal.status !== 'WITHDRAWN' ? proposal : null;
  const visibleAssessment = latest && latest.outcome !== 'NEEDS_INFORMATION' ? latest : null;
  const closed = ['CUSTOMER_ACCEPTED', 'CONVERTED_TO_JOB', 'CLOSED'].includes(c.status);
  const proposalOpen = live?.status === 'SENT' && ['AI_ANSWERED', 'PROPOSAL_SENT'].includes(c.status);
  return {
    ...summaryDto(c, { proposalStatus: live?.status ?? null, estimateMin: live?.priceMin ?? null, estimateMax: live?.priceMax ?? null, adminEngaged: input.adminEngaged }),
    propertyType: c.propertyType,
    siteArea: c.siteArea,
    urgency: c.customerUrgency,
    messages: input.messages,
    assessment: visibleAssessment ? assessmentDto(visibleAssessment, live && live.assessmentId === visibleAssessment.id ? live : null) : null,
    proposal: live ? proposalDto(live, input.proposalAssessment) : null,
    clarificationRounds: c.clarificationRounds,
    maxClarificationRounds: input.maxClarificationRounds,
    safetyWarning: c.currentSeverity === 5 && c.status !== 'CLOSED' ? AI_SAFETY_MESSAGE : null,
    pendingReview: c.status === 'NEEDS_ADMIN_REVIEW',
    customerFeedback: input.customerFeedback,
    can: {
      sendMessage: input.enabled && !closed && c.status !== 'AI_PROCESSING',
      accept: input.enabled && proposalOpen,
      decline: proposalOpen,
      requestReview: input.enabled && !closed && !c.humanRequested && c.status !== 'NEEDS_ADMIN_REVIEW',
      giveFeedback: !!c.convertedJobStatus && COMPLETED_JOB.includes(c.convertedJobStatus),
    },
    notices: { disclaimer: AI_DISCLAIMER, estimateNotice: AI_ESTIMATE_NOTICE, simulation: c.isSimulation ? AI_SIMULATION_LABEL : null },
  };
}
