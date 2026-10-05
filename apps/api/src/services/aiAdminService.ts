import {
  AI_CASE_STATUS_LABELS,
  AI_ESCALATION_REASON_LABELS,
  type AdminAiAssessmentEditInput,
  type AiAnalyticsDto,
  type AiCaseDetailDto,
  type AiCaseSummaryDto,
  type AiKnowledgeEntryDto,
  type AiKnowledgeStatus,
  type AiQueueTab,
  type AiSettings,
  type AiSettingsDto,
  type JobAiSummaryDto,
  type KnowledgeEntryInput,
  type KnowledgeUpdateInput,
  type Paginated,
  type PricingPolicy,
  type SeverityPolicy,
} from '@hydra/shared';
import { config } from '../config/env';
import { db, type Queryable } from '../db/pool';
import { calculateEstimate, resolveCategory, responseWindow } from '../ai/engine';
import { CORE_SAFETY_RULES, PROMPT_VERSION } from '../ai/policies';
import { integrations } from '../integrations';
import { PostgresKnowledgeRepository } from '../repositories/aiKnowledgeRepository';
import { PostgresAiRepository, type AssessmentRow, type ConversationRow, type PolicyKind } from '../repositories/aiRepository';
import { PostgresContentRepository } from '../repositories/contentRepository';
import { PostgresJobRepository } from '../repositories/jobRepository';
import { PostgresSettingsRepository } from '../repositories/settingsRepository';
import type { AuthContext } from '../types/express';
import { addDays, todayIso } from '../utils/dates';
import { badRequest, businessRule, forbidden, notFound } from '../utils/errors';
import { paginated } from '../utils/pagination';
import { canAccessJob, isOwner } from './accessControl';
import { audit, SYSTEM_ACTOR, type Actor } from './auditService';
import { featureEnabled, loadAiConfig, providerFor, type AiConfig } from './ai/config';
import { adminAssessmentDto, attachmentDtos, messageDtos, proposalDto } from './ai/dto';
import { createJobFromCase } from './aiAssistantService';
import { transactional } from './events';
import { SIGNED_URL_TTL_SECONDS } from './fileService';

const iso = (v: string | Date) => new Date(v).toISOString();
const OPEN = (c: ConversationRow) => !['CLOSED', 'CONVERTED_TO_JOB'].includes(c.status);

async function loadCase(q: Queryable, id: string, forUpdate = false): Promise<ConversationRow> {
  const c = await new PostgresAiRepository(q).conversation(id, forUpdate);
  if (!c) throw notFound('AI case');
  return c;
}

// ---- Queue ---------------------------------------------------------------------------------------------

export async function listCases(q: { tab: AiQueueTab; severity?: number; search?: string; page: number; pageSize: number }): Promise<Paginated<AiCaseSummaryDto>> {
  const { items, total } = await new PostgresAiRepository(db()).listCases({ tab: q.tab, severity: q.severity, search: q.search, limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
  const now = Date.now();
  const out = await Promise.all(
    items.map(async (c): Promise<AiCaseSummaryDto> => ({
      id: c.id,
      reference: c.reference,
      title: c.title,
      status: c.status,
      statusLabel: AI_CASE_STATUS_LABELS[c.status],
      customerName: `${c.customerFirstName} ${c.customerLastName}`.trim(),
      firstMessage: (c.firstMessage ?? '').slice(0, 300),
      thumbnails: await Promise.all(c.thumbnailKeys.map((t) => integrations().storage.signedUrl(t.storageKey, SIGNED_URL_TTL_SECONDS, t.originalName))),
      serviceCategoryLabel: c.categoryLabel,
      severity: c.currentSeverity,
      confidence: c.confidence,
      estimateMin: c.adminMin ?? c.estMin,
      estimateMax: c.adminMax ?? c.estMax,
      escalationReasons: c.escalationReasons ?? [],
      reviewRequired: c.reviewRequired,
      humanRequested: c.humanRequested,
      isSimulation: c.isSimulation,
      ageMinutes: Math.max(0, Math.round((now - new Date(c.createdAt).getTime()) / 60_000)),
      createdAt: iso(c.createdAt),
      updatedAt: iso(c.lastActivityAt),
    })),
  );
  return paginated(out, q.page, q.pageSize, total);
}

export async function queueSummary() {
  return new PostgresAiRepository(db()).queueCounts();
}

function allowedActions(c: ConversationRow, latest: AssessmentRow | null, engaged: boolean, hasOpenProposal: boolean): string[] {
  const a: string[] = ['FEEDBACK'];
  if (OPEN(c)) a.push('REPLY', 'REQUEST_INFO', 'EDIT', 'CLOSE');
  if (OPEN(c) && c.status !== 'CUSTOMER_ACCEPTED' && latest && (latest.adminPriceMin !== null || latest.estMin !== null)) {
    a.push(latest.source === 'AI' && latest.adminPriceMin === null ? 'APPROVE_AI' : 'SEND_PROPOSAL');
  }
  if (OPEN(c) && !c.convertedJobId) a.push('CONVERT');
  if (engaged || !OPEN(c) || hasOpenProposal) a.push('CREATE_KNOWLEDGE');
  return a;
}

export async function getCase(id: string): Promise<AiCaseDetailDto> {
  const q = db();
  const repo = new PostgresAiRepository(q);
  const c = await loadCase(q, id);
  const [messages, attachmentRows, assessments, proposal, reviews, feedback, calls, engaged, knowledge] = await Promise.all([
    repo.messages(id), repo.attachments(id), repo.assessments(id), repo.currentProposal(id), repo.reviews(id), repo.feedback(id),
    repo.providerCalls(id), repo.hasAdminEngagement(id), new PostgresKnowledgeRepository(q).forConversation(id),
  ]);
  const attachments = await attachmentDtos(attachmentRows);
  const latest = assessments[0] ?? null;
  const proposalAssessment = proposal ? assessments.find((a) => a.id === proposal.assessmentId) ?? null : null;
  const admin = feedback.find((f) => f.source === 'ADMIN');
  const cust = feedback.find((f) => f.source === 'CUSTOMER');
  return {
    id: c.id,
    reference: c.reference,
    title: c.title,
    status: c.status,
    statusLabel: AI_CASE_STATUS_LABELS[c.status],
    customerName: `${c.customerFirstName} ${c.customerLastName}`.trim(),
    firstMessage: messages.find((m) => m.role === 'CUSTOMER')?.body ?? '',
    thumbnails: attachments.slice(0, 3).map((a) => a.url),
    serviceCategoryLabel: latest?.serviceCategoryLabel ?? null,
    severity: c.currentSeverity,
    confidence: latest?.finalConfidence ?? null,
    estimateMin: latest?.adminPriceMin ?? latest?.estMin ?? null,
    estimateMax: latest?.adminPriceMax ?? latest?.estMax ?? null,
    escalationReasons: c.escalationReasons ?? [],
    reviewRequired: c.reviewRequired,
    humanRequested: c.humanRequested,
    isSimulation: c.isSimulation,
    ageMinutes: Math.max(0, Math.round((Date.now() - new Date(c.createdAt).getTime()) / 60_000)),
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.lastActivityAt),
    customer: { id: c.customerId, userId: c.userId, name: `${c.customerFirstName} ${c.customerLastName}`.trim(), email: c.customerEmail, phone: c.customerPhone },
    propertyType: c.propertyType,
    siteArea: c.siteArea,
    urgency: c.customerUrgency,
    messages: messageDtos(messages, attachments, c.isSimulation),
    attachments,
    assessment: latest ? adminAssessmentDto(latest) : null,
    assessments: assessments.map(adminAssessmentDto),
    proposal: proposal ? proposalDto(proposal, proposalAssessment) : null,
    reviews: reviews.map((r) => ({ ...r, createdAt: iso(r.createdAt) })),
    adminFeedback: admin ? { assessmentVerdict: admin.assessmentVerdict!, severityVerdict: admin.severityVerdict!, priceVerdict: admin.priceVerdict!, comment: admin.comment } : null,
    customerFeedback: cust ? { helpful: cust.helpful!, comment: cust.comment } : null,
    providerCalls: calls.map((x) => ({ ...x, createdAt: iso(x.createdAt) })),
    knowledgeEntries: knowledge,
    jobId: c.convertedJobId,
    jobReference: c.convertedJobReference,
    allowedActions: allowedActions(c, latest, engaged, proposal?.status === 'SENT'),
  };
}

// ---- Human-in-the-loop actions --------------------------------------------------------------------------

export async function reply(auth: AuthContext, id: string, input: { body: string; requestInformation: boolean }, actor: Actor) {
  await transactional(async (tx, events) => {
    const repo = new PostgresAiRepository(tx);
    const c = await loadCase(tx, id, true);
    if (!OPEN(c)) throw businessRule('This case is closed', 'AI_CASE_CLOSED');
    const latest = await repo.latestAssessment(id);
    await repo.insertMessage({ conversationId: id, role: 'ADMIN', kind: input.requestInformation ? 'INFO_REQUEST' : 'ADMIN_REPLY', body: input.body, authorUserId: auth.userId });
    await repo.insertReview({ conversationId: id, assessmentId: latest?.id ?? null, adminUserId: auth.userId, action: input.requestInformation ? 'REQUEST_INFO' : 'REPLY', note: input.body });
    await repo.updateConversation(id, {
      status: input.requestInformation ? 'NEEDS_INFORMATION' : c.status === 'CUSTOMER_ACCEPTED' ? 'CUSTOMER_ACCEPTED' : 'ADMIN_RESPONDED',
      reviewRequired: false,
      reviewRequestedAt: null,
      assignedAdminId: auth.adminId ?? undefined,
    });
    await events.notify([c.userId], {
      type: 'AI_CASE_UPDATE',
      title: input.requestInformation ? `More information requested · ${c.reference}` : `PSG Electrical team replied · ${c.reference}`,
      body: input.body.slice(0, 300),
      data: { aiCaseId: id },
    });
    events.emit(`user:${c.userId}`, 'ai.updated', { conversationId: id });
    events.emit('admins', 'ai.updated', { conversationId: id });
    await audit(tx, actor, input.requestInformation ? 'AI_ADMIN_REQUEST_INFO' : 'AI_ADMIN_REPLY', 'ai_conversation', id);
  });
  return getCase(id);
}

/**
 * Admin edit = a new assessment version (source ADMIN). The previous AI version is kept unchanged for the
 * audit trail; the system price is recalculated for the (possibly new) category/severity and the
 * admin-approved price is stored separately.
 */
export async function editAssessment(auth: AuthContext, id: string, input: AdminAiAssessmentEditInput, actor: Actor) {
  await transactional(async (tx, events) => {
    const repo = new PostgresAiRepository(tx);
    const c = await loadCase(tx, id, true);
    if (!OPEN(c)) throw businessRule('This case is closed', 'AI_CASE_CLOSED');
    const latest = await repo.latestAssessment(id);
    if (!latest) throw businessRule('There is no assessment to edit yet', 'AI_NO_ASSESSMENT');
    const cfg = await loadAiConfig(tx);
    const category = input.serviceCategory ? resolveCategory(input.serviceCategory, cfg.pricing.categories) : resolveCategory(latest.serviceCategory, cfg.pricing.categories);
    if (!category) throw badRequest('Unknown service category');
    const severity = input.severity ?? latest.finalSeverity;
    const belowRuleFloor = latest.ruleSeverityFloor !== null && severity < latest.ruleSeverityFloor;
    const vatRate = (await new PostgresSettingsRepository(tx).getAll()).vatRate;
    const price = calculateEstimate(cfg.pricing, {
      category, suggestedHours: latest.aiInputs?.labourHours ?? null, severity, afterHours: latest.priceBreakdown?.afterHours ?? false, vatRate,
      unitCosts: await repo.unitCosts(category.typicalMaterials.map((m) => m.sku)),
    });
    const { hoursUsed: _h, inputsOutOfRange: _o, ...breakdown } = price;
    const changes: Record<string, unknown> = {};
    if (input.summary && input.summary !== latest.summary) changes.summary = { from: latest.summary, to: input.summary };
    if (category.code !== latest.serviceCategory) changes.serviceCategory = { from: latest.serviceCategory, to: category.code };
    if (severity !== latest.finalSeverity) changes.severity = { from: latest.finalSeverity, to: severity, belowRuleFloor };
    if (input.priceMin !== undefined) changes.price = { from: latest.adminPriceMin !== null ? [latest.adminPriceMin, latest.adminPriceMax] : [latest.estMin, latest.estMax], to: [input.priceMin, input.priceMax] };
    const assessmentId = await repo.insertAssessment({
      ...latest,
      source: 'ADMIN',
      summary: input.summary ?? latest.summary,
      serviceCategory: category.code,
      serviceCategoryLabel: category.label,
      finalSeverity: severity,
      severityReason: input.severityReason ?? latest.severityReason,
      outcome: 'PROPOSAL',
      requiresAdminReview: false,
      escalationReasons: latest.escalationReasons,
      estMin: price.min,
      estMax: price.max,
      priceBreakdown: breakdown,
      priceClamped: price.clamped,
      adminPriceMin: input.priceMin ?? latest.adminPriceMin,
      adminPriceMax: input.priceMax ?? latest.adminPriceMax,
      responseWindow: responseWindow(cfg.severity, severity),
      settingsVersion: cfg.settingsVersion,
      severityPolicyVersion: cfg.severityVersion,
      pricingPolicyVersion: cfg.pricingVersion,
      createdBy: auth.userId,
      latencyMs: null,
      errorCode: null,
    });
    await repo.insertReview({ conversationId: id, assessmentId, adminUserId: auth.userId, action: 'EDIT_ASSESSMENT', note: input.note, changes });
    await repo.updateConversation(id, { currentSeverity: severity, assignedAdminId: auth.adminId ?? undefined });
    events.emit('admins', 'ai.updated', { conversationId: id });
    await audit(tx, actor, 'AI_ASSESSMENT_EDITED', 'ai_conversation', id, { assessmentId, changes, note: input.note });
  });
  return getCase(id);
}

export async function sendProposal(auth: AuthContext, id: string, message: string | undefined, actor: Actor) {
  await transactional(async (tx, events) => {
    const repo = new PostgresAiRepository(tx);
    const c = await loadCase(tx, id, true);
    if (!OPEN(c) || c.status === 'CUSTOMER_ACCEPTED') throw businessRule('A proposal can no longer be sent on this case', 'AI_CASE_CLOSED');
    const latest = await repo.latestAssessment(id);
    if (!latest || (latest.adminPriceMin === null && latest.estMin === null)) throw businessRule('Set a price range before sending a proposal', 'AI_NO_PRICE');
    const adminPriced = latest.adminPriceMin !== null && latest.adminPriceMax !== null;
    const approvingAi = latest.source === 'AI' && !adminPriced;
    const replaced = await repo.supersedeSentProposals(id);
    const prior = await repo.currentProposal(id);
    await repo.insertProposal({
      conversationId: id, assessmentId: latest.id, priceMin: adminPriced ? latest.adminPriceMin! : latest.estMin!, priceMax: adminPriced ? latest.adminPriceMax! : latest.estMax!,
      priceSource: adminPriced ? 'ADMIN' : 'SYSTEM', severity: latest.finalSeverity, responseWindow: latest.responseWindow, message: message ?? null, approvedBy: auth.userId,
    });
    await repo.insertMessage({
      conversationId: id, role: 'ADMIN', kind: 'PROPOSAL', authorUserId: auth.userId, assessmentId: latest.id,
      body: message ?? (approvingAi ? 'PSG Electrical team has reviewed and approved this preliminary assessment.' : 'PSG Electrical team has reviewed your request and prepared a preliminary proposal.'),
    });
    await repo.insertReview({ conversationId: id, assessmentId: latest.id, adminUserId: auth.userId, action: approvingAi ? 'APPROVE_AI' : 'SEND_PROPOSAL', note: message ?? null });
    await repo.updateConversation(id, { status: 'PROPOSAL_SENT', reviewRequired: false, reviewRequestedAt: null, currentSeverity: latest.finalSeverity, assignedAdminId: auth.adminId ?? undefined });
    const adjusted = replaced > 0 || !!prior;
    await events.notify([c.userId], {
      type: 'AI_PROPOSAL_READY',
      title: approvingAi ? `Proposal approved · ${c.reference}` : adjusted ? `Proposal adjusted · ${c.reference}` : `Proposal ready · ${c.reference}`,
      body: 'Your preliminary Smart Quote proposal is ready to review in HYDRA.',
      data: { aiCaseId: id },
    });
    events.emit(`user:${c.userId}`, 'ai.updated', { conversationId: id });
    events.emit('admins', 'ai.updated', { conversationId: id });
    await audit(tx, actor, approvingAi ? 'AI_RESPONSE_APPROVED' : 'AI_PROPOSAL_SENT', 'ai_conversation', id, { assessmentId: latest.id, priceSource: adminPriced ? 'ADMIN' : 'SYSTEM' });
  });
  return getCase(id);
}

export async function convertCase(auth: AuthContext, id: string, input: { serviceTypeId: string; siteAddress: string; description?: string }, actor: Actor) {
  await transactional(async (tx, events) => {
    const repo = new PostgresAiRepository(tx);
    const c = await loadCase(tx, id, true);
    if (c.convertedJobId) return; // already converted (retry / double tap)
    if (c.status === 'CLOSED') throw businessRule('This case is closed', 'AI_CASE_CLOSED');
    const service = await new PostgresContentRepository(tx).getServiceType(input.serviceTypeId);
    if (!service?.isActive) throw badRequest('Selected service type is not available');
    const latest = await repo.latestAssessment(id);
    const cfg = await loadAiConfig(tx);
    const severity = latest?.finalSeverity ?? c.currentSeverity ?? 2;
    const { jobId, reference } = await createJobFromCase(tx, events, c, {
      serviceTypeId: service.id, siteAddress: input.siteAddress,
      description: input.description ?? `[HYDRA Smart Quote ${c.reference}] ${latest?.summary ?? c.title}`,
      urgency: cfg.severity.levels[severity - 1]!.jobUrgency, contactPhone: c.customerPhone, preferredDate: null,
    }, auth.userId, `Converted from Smart Quote ${c.reference} by the office (severity ${severity}/5).`);
    await repo.insertReview({ conversationId: id, assessmentId: latest?.id ?? null, adminUserId: auth.userId, action: 'CONVERT', changes: { jobId } });
    await events.notify([c.userId], { type: 'NEW_JOB_REQUEST', title: `Service request ${reference} created`, body: `Your Smart Quote ${c.reference} is now a service request. A formal quote will follow.`, data: { jobId, aiCaseId: id } });
    events.emit(`user:${c.userId}`, 'ai.updated', { conversationId: id });
    await audit(tx, actor, 'AI_CASE_CONVERTED', 'ai_conversation', id, { jobId });
  });
  return getCase(id);
}

export async function closeCase(auth: AuthContext, id: string, reason: string, actor: Actor) {
  await transactional(async (tx, events) => {
    const repo = new PostgresAiRepository(tx);
    const c = await loadCase(tx, id, true);
    if (c.status === 'CLOSED') return;
    if (c.status === 'CONVERTED_TO_JOB') throw businessRule('Converted cases are managed through the job', 'AI_CASE_CONVERTED');
    const p = await repo.currentProposal(id);
    if (p?.status === 'SENT') await repo.updateProposal(p.id, { status: 'WITHDRAWN' });
    await repo.insertMessage({ conversationId: id, role: 'ADMIN', kind: 'STATUS', authorUserId: auth.userId, body: `This enquiry was closed by PSG Electrical: ${reason}` });
    await repo.insertReview({ conversationId: id, assessmentId: null, adminUserId: auth.userId, action: 'CLOSE', note: reason });
    await repo.updateConversation(id, { status: 'CLOSED', closedAt: 'now', closeReason: reason, reviewRequired: false, reviewRequestedAt: null });
    await events.notify([c.userId], { type: 'AI_CASE_UPDATE', title: `Smart Quote ${c.reference} closed`, body: reason.slice(0, 300), data: { aiCaseId: id } });
    events.emit(`user:${c.userId}`, 'ai.updated', { conversationId: id });
    await audit(tx, actor, 'AI_CASE_CLOSED', 'ai_conversation', id, { reason });
  });
  return getCase(id);
}

/** Feedback informs analytics and retrieval quality only — it never changes pricing or safety rules. */
export async function adminFeedback(auth: AuthContext, id: string, input: { assessmentVerdict: string; severityVerdict: string; priceVerdict: string; comment?: string }, actor: Actor) {
  await transactional(async (tx) => {
    const repo = new PostgresAiRepository(tx);
    await loadCase(tx, id);
    const ai = (await repo.assessments(id)).find((a) => a.source === 'AI') ?? null;
    await repo.upsertFeedback({ conversationId: id, assessmentId: ai?.id ?? null, source: 'ADMIN', ...input, comment: input.comment ?? null, userId: auth.userId });
    await repo.insertReview({ conversationId: id, assessmentId: ai?.id ?? null, adminUserId: auth.userId, action: 'FEEDBACK', changes: { ...input } });
    await audit(tx, actor, 'AI_ADMIN_FEEDBACK', 'ai_conversation', id, input);
  });
  return getCase(id);
}

// ---- Knowledge (the only way the assistant "learns") ----------------------------------------------------

async function canApproveKnowledge(q: Queryable, auth: AuthContext): Promise<boolean> {
  if (isOwner(auth)) return true;
  return (await loadAiConfig(q)).settings.officeAdminCanApproveKnowledge;
}

/**
 * Turns an admin-resolved case into reusable knowledge. Only content the admin writes/approves is stored —
 * never raw customer statements or unreviewed AI output — and only once a person has resolved the case.
 */
export async function createKnowledgeFromCase(auth: AuthContext, id: string, input: KnowledgeEntryInput, actor: Actor): Promise<AiKnowledgeEntryDto> {
  const entryId = await transactional(async (tx) => {
    const repo = new PostgresAiRepository(tx);
    const c = await loadCase(tx, id, true);
    const engaged = await repo.hasAdminEngagement(id);
    if (!engaged && OPEN(c)) throw businessRule('Resolve the case (reply, adjust or send a proposal) before approving it as knowledge', 'AI_CASE_NOT_RESOLVED');
    const latest = await repo.latestAssessment(id);
    const approve = await canApproveKnowledge(tx, auth);
    const kId = await new PostgresKnowledgeRepository(tx).create({ ...input, sourceConversationId: id, sourceAssessmentId: latest?.id ?? null, createdBy: auth.userId, approve });
    await repo.insertReview({ conversationId: id, assessmentId: latest?.id ?? null, adminUserId: auth.userId, action: 'KNOWLEDGE_CREATED', changes: { knowledgeEntryId: kId, approved: approve } });
    await audit(tx, actor, approve ? 'AI_KNOWLEDGE_APPROVED' : 'AI_KNOWLEDGE_SUBMITTED', 'ai_knowledge_entry', kId, { sourceConversationId: id });
    return kId;
  });
  return getKnowledge(entryId);
}

export async function createKnowledge(auth: AuthContext, input: KnowledgeEntryInput, actor: Actor): Promise<AiKnowledgeEntryDto> {
  if (input.sourceConversationId) return createKnowledgeFromCase(auth, input.sourceConversationId, input, actor);
  const entryId = await transactional(async (tx) => {
    const approve = await canApproveKnowledge(tx, auth);
    const kId = await new PostgresKnowledgeRepository(tx).create({ ...input, sourceAssessmentId: null, createdBy: auth.userId, approve });
    await audit(tx, actor, approve ? 'AI_KNOWLEDGE_APPROVED' : 'AI_KNOWLEDGE_SUBMITTED', 'ai_knowledge_entry', kId);
    return kId;
  });
  return getKnowledge(entryId);
}

export async function listKnowledge(q: { status?: AiKnowledgeStatus; category?: string; active?: boolean; search?: string; page: number; pageSize: number }) {
  const { items, total } = await new PostgresKnowledgeRepository(db()).list({ ...q, limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
  return paginated(items, q.page, q.pageSize, total);
}

export async function getKnowledge(id: string): Promise<AiKnowledgeEntryDto> {
  const repo = new PostgresKnowledgeRepository(db());
  const k = await repo.get(id);
  if (!k) throw notFound('Knowledge entry');
  return { ...k, revisions: await repo.revisions(id) };
}

export async function updateKnowledge(auth: AuthContext, id: string, input: KnowledgeUpdateInput, actor: Actor) {
  await transactional(async (tx) => {
    const repo = new PostgresKnowledgeRepository(tx);
    const k = await repo.get(id, true);
    if (!k) throw notFound('Knowledge entry');
    if (k.status === 'ARCHIVED') throw businessRule('Archived entries cannot be edited', 'AI_KNOWLEDGE_ARCHIVED');
    const { changeNote, ...patch } = input;
    // An edit by someone who may not approve sends the entry back for approval (and out of retrieval).
    await repo.update(id, patch, { userId: auth.userId, changeNote, keepApproval: await canApproveKnowledge(tx, auth) });
    await audit(tx, actor, 'AI_KNOWLEDGE_EDITED', 'ai_knowledge_entry', id, { changeNote, fields: Object.keys(patch) });
  });
  return getKnowledge(id);
}

export async function approveKnowledge(auth: AuthContext, id: string, actor: Actor) {
  await transactional(async (tx) => {
    if (!(await canApproveKnowledge(tx, auth))) throw forbidden('Only the owner can approve knowledge entries');
    const repo = new PostgresKnowledgeRepository(tx);
    const k = await repo.get(id, true);
    if (!k) throw notFound('Knowledge entry');
    if (k.status === 'ARCHIVED') throw businessRule('Archived entries cannot be approved', 'AI_KNOWLEDGE_ARCHIVED');
    await repo.approve(id, auth.userId);
    await audit(tx, actor, 'AI_KNOWLEDGE_APPROVED', 'ai_knowledge_entry', id);
  });
  return getKnowledge(id);
}

export async function setKnowledgeActive(auth: AuthContext, id: string, active: boolean, actor: Actor) {
  await transactional(async (tx) => {
    const repo = new PostgresKnowledgeRepository(tx);
    const k = await repo.get(id, true);
    if (!k) throw notFound('Knowledge entry');
    if (active) {
      if (k.status !== 'APPROVED') throw businessRule('Only approved entries can be activated', 'AI_KNOWLEDGE_NOT_APPROVED');
      if (!(await canApproveKnowledge(tx, auth))) throw forbidden('Only the owner can activate knowledge entries');
    }
    await repo.setActive(id, active);
    await audit(tx, actor, active ? 'AI_KNOWLEDGE_ACTIVATED' : 'AI_KNOWLEDGE_DEACTIVATED', 'ai_knowledge_entry', id);
  });
  return getKnowledge(id);
}

export async function archiveKnowledge(id: string, actor: Actor) {
  await transactional(async (tx) => {
    const repo = new PostgresKnowledgeRepository(tx);
    if (!(await repo.get(id, true))) throw notFound('Knowledge entry');
    await repo.archive(id);
    await audit(tx, actor, 'AI_KNOWLEDGE_ARCHIVED', 'ai_knowledge_entry', id);
  });
  return getKnowledge(id);
}

export async function deleteKnowledge(id: string, actor: Actor) {
  await transactional(async (tx) => {
    const repo = new PostgresKnowledgeRepository(tx);
    const k = await repo.get(id, true);
    if (!k) throw notFound('Knowledge entry');
    await repo.delete(id);
    await audit(tx, actor, 'AI_KNOWLEDGE_DELETED', 'ai_knowledge_entry', id, { title: k.title, version: k.version });
  });
}

// ---- Owner configuration ------------------------------------------------------------------------------

export async function getAiSettings(auth: AuthContext): Promise<AiSettingsDto> {
  const cfg = await loadAiConfig(db());
  const provider = providerFor(cfg);
  const env = config();
  return {
    settings: cfg.settings,
    settingsVersion: cfg.settingsVersion,
    severityPolicy: cfg.severity,
    severityPolicyVersion: cfg.severityVersion,
    pricingPolicy: cfg.pricing,
    pricingPolicyVersion: cfg.pricingVersion,
    coreSafetyRules: CORE_SAFETY_RULES,
    promptVersion: PROMPT_VERSION,
    provider: {
      name: env.aiProvider,
      model: provider.model,
      configured: provider.configured,
      simulation: provider.simulation,
      supportsImages: provider.supportsImages,
      envEnabled: env.AI_ASSISTANT_ENABLED,
      // Secrets are never returned — only whether one is present.
      apiKey: env.AI_API_KEY ? 'Configured' : 'Not configured',
    },
    canEdit: isOwner(auth),
  };
}

async function savePolicy(auth: AuthContext, kind: PolicyKind, body: unknown, changeNote: string | undefined, actor: Actor) {
  await transactional(async (tx) => {
    const version = await new PostgresAiRepository(tx).insertPolicy(kind, body, changeNote ?? null, auth.userId);
    await audit(tx, actor, `AI_${kind}_POLICY_UPDATED`, 'ai_policy', `${kind}:${version}`, { version, changeNote: changeNote ?? null });
  });
  return getAiSettings(auth);
}

export const updateAiSettings = (auth: AuthContext, settings: AiSettings, note: string | undefined, actor: Actor) => savePolicy(auth, 'SETTINGS', settings, note, actor);
export const updateSeverityPolicy = (auth: AuthContext, policy: SeverityPolicy, note: string | undefined, actor: Actor) => savePolicy(auth, 'SEVERITY', policy, note, actor);
export async function updatePricingPolicy(auth: AuthContext, policy: PricingPolicy, note: string | undefined, actor: Actor) {
  const slugs = policy.categories.map((c) => c.serviceTypeSlug).filter((s): s is string => !!s);
  const content = new PostgresContentRepository(db());
  for (const slug of new Set(slugs)) {
    if (!(await content.getServiceTypeBySlug(slug))) throw badRequest(`Unknown service type slug "${slug}" — map categories to existing service types`);
  }
  return savePolicy(auth, 'PRICING', policy, note, actor);
}

export const policyVersions = (kind: PolicyKind) => new PostgresAiRepository(db()).policyVersions(kind);

// ---- Analytics (computed from stored data only) ------------------------------------------------------------

export async function refreshEstimateOutcomes(q: Queryable = db()): Promise<number> {
  const r = await q.query(
    `INSERT INTO ai_estimate_outcomes (conversation_id, job_id, estimate_min, estimate_max, quote_total, invoice_total, absolute_difference, percent_variance, computed_at)
     SELECT c.id, j.id, p.price_min, p.price_max, qt.total, inv.total,
            ABS(COALESCE(inv.total, qt.total) - (p.price_min + p.price_max) / 2),
            ROUND((COALESCE(inv.total, qt.total) - (p.price_min + p.price_max) / 2) / NULLIF((p.price_min + p.price_max) / 2, 0) * 100, 2),
            now()
       FROM ai_conversations c
       JOIN jobs j ON j.id = c.converted_job_id
       JOIN LATERAL (SELECT price_min, price_max FROM ai_proposals ap WHERE ap.conversation_id = c.id AND ap.status IN ('ACCEPTED','SENT')
                     ORDER BY (ap.status = 'ACCEPTED') DESC, ap.created_at DESC LIMIT 1) p ON true
       LEFT JOIN quotes qt ON qt.job_id = j.id AND qt.status = 'ACCEPTED'
       LEFT JOIN LATERAL (SELECT total FROM invoices i WHERE i.job_id = j.id AND i.status <> 'VOID' ORDER BY i.created_at DESC LIMIT 1) inv ON true
      WHERE qt.total IS NOT NULL OR inv.total IS NOT NULL
     ON CONFLICT (conversation_id) DO UPDATE SET quote_total = EXCLUDED.quote_total, invoice_total = EXCLUDED.invoice_total,
       absolute_difference = EXCLUDED.absolute_difference, percent_variance = EXCLUDED.percent_variance, computed_at = now()`,
  );
  return r.rowCount ?? 0;
}

export async function analytics(range: { from?: string; to?: string }): Promise<AiAnalyticsDto> {
  const q = db();
  const to = range.to ?? todayIso();
  const from = range.from ?? addDays(to, -90);
  await refreshEstimateOutcomes(q);
  const p = [from, to];
  const inRange = `c.created_at >= $1::date AND c.created_at < ($2::date + 1)`;
  const totals = (await q.query<AiAnalyticsDto['totals'] & { avgConfidence: number | null }>(
    `SELECT count(*)::int AS enquiries,
            count(*) FILTER (WHERE c.status IN ('AI_ANSWERED','CUSTOMER_ACCEPTED','CONVERTED_TO_JOB','CLOSED')
                             AND NOT EXISTS (SELECT 1 FROM ai_admin_reviews r WHERE r.conversation_id = c.id AND r.action IN ('REPLY','REQUEST_INFO','EDIT_ASSESSMENT','SEND_PROPOSAL'))
                             AND EXISTS (SELECT 1 FROM ai_proposals ap WHERE ap.conversation_id = c.id AND ap.approved_by IS NULL))::int AS "aiResolved",
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ai_assessments s WHERE s.conversation_id = c.id AND s.requires_admin_review) OR c.human_requested)::int AS escalated,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ai_proposals ap WHERE ap.conversation_id = c.id))::int AS proposals,
            count(*) FILTER (WHERE c.accepted_at IS NOT NULL)::int AS accepted,
            count(*) FILTER (WHERE c.converted_job_id IS NOT NULL)::int AS converted,
            (SELECT count(*)::int FROM ai_knowledge_entries k WHERE k.created_at >= $1::date AND k.created_at < ($2::date + 1)) AS "knowledgeAdded",
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ai_admin_reviews r WHERE r.conversation_id = c.id AND r.action = 'EDIT_ASSESSMENT'))::int AS "correctedByAdmin",
            (SELECT count(*)::int FROM ai_provider_calls pc WHERE pc.status NOT IN ('OK','REPAIRED') AND pc.created_at >= $1::date AND pc.created_at < ($2::date + 1)) AS "providerFailures",
            (SELECT ROUND(AVG(s.final_confidence))::int FROM ai_assessments s JOIN ai_conversations c2 ON c2.id = s.conversation_id
              WHERE s.source = 'AI' AND c2.created_at >= $1::date AND c2.created_at < ($2::date + 1)) AS "avgConfidence"
       FROM ai_conversations c WHERE ${inRange}`,
    p,
  )).rows[0]!;
  const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
  const bySeverity = (await q.query<{ severity: number; count: number }>(
    `SELECT c.current_severity AS severity, count(*)::int AS count FROM ai_conversations c WHERE ${inRange} AND c.current_severity IS NOT NULL GROUP BY 1 ORDER BY 1`, p,
  )).rows;
  const byCategory = (await q.query<{ category: string; label: string; count: number }>(
    `SELECT la.service_category AS category, max(la.service_category_label) AS label, count(*)::int AS count
       FROM ai_conversations c JOIN LATERAL (SELECT service_category, service_category_label FROM ai_assessments s WHERE s.conversation_id = c.id ORDER BY s.version DESC LIMIT 1) la ON true
      WHERE ${inRange} GROUP BY 1 ORDER BY 3 DESC LIMIT 12`, p,
  )).rows;
  const reasons = (await q.query<{ reason: string; count: number }>(
    `SELECT r AS reason, count(*)::int AS count FROM ai_conversations c, jsonb_array_elements_text(c.escalation_reasons) r WHERE ${inRange} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, p,
  )).rows;
  const common = (await q.query<{ title: string; count: number }>(
    `SELECT la.summary_key AS title, count(*)::int AS count FROM ai_conversations c
       JOIN LATERAL (SELECT service_category_label AS summary_key FROM ai_assessments s WHERE s.conversation_id = c.id AND s.source = 'AI' ORDER BY s.version LIMIT 1) la ON true
      WHERE ${inRange} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, p,
  )).rows;
  const unknown = (await q.query<{ reference: string; conversationId: string; message: string; createdAt: string }>(
    `SELECT c.reference, c.id AS "conversationId", c.title AS message, c.created_at AS "createdAt" FROM ai_conversations c
      WHERE ${inRange} AND (c.escalation_reasons ? 'UNSUPPORTED_CATEGORY' OR c.escalation_reasons ? 'LOW_CONFIDENCE')
      ORDER BY c.created_at DESC LIMIT 10`, p,
  )).rows;
  const fb = (await q.query<{ source: string; assessmentVerdict: string | null; severityVerdict: string | null; priceVerdict: string | null; helpful: string | null }>(
    `SELECT f.source, f.assessment_verdict AS "assessmentVerdict", f.severity_verdict AS "severityVerdict", f.price_verdict AS "priceVerdict", f.helpful
       FROM ai_feedback f JOIN ai_conversations c ON c.id = f.conversation_id WHERE ${inRange}`, p,
  )).rows;
  const tally = (vals: (string | null)[]) => vals.reduce<Record<string, number>>((acc, v) => (v ? { ...acc, [v]: (acc[v] ?? 0) + 1 } : acc), {});
  const variance = (await q.query<{ reference: string; jobReference: string; estimateMid: number; quoteTotal: number | null; invoiceTotal: number | null; percentVariance: number | null; absoluteDifference: number | null }>(
    `SELECT c.reference, j.reference AS "jobReference", ROUND((o.estimate_min + o.estimate_max) / 2, 2) AS "estimateMid", o.quote_total AS "quoteTotal",
            o.invoice_total AS "invoiceTotal", o.percent_variance AS "percentVariance", o.absolute_difference AS "absoluteDifference"
       FROM ai_estimate_outcomes o JOIN ai_conversations c ON c.id = o.conversation_id JOIN jobs j ON j.id = o.job_id
      WHERE ${inRange} ORDER BY o.computed_at DESC LIMIT 50`, p,
  )).rows;
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const { avgConfidence, ...t } = totals;
  return {
    from, to,
    totals: t,
    rates: { aiResolutionRate: rate(t.aiResolved, t.enquiries), escalationRate: rate(t.escalated, t.enquiries), acceptanceRate: rate(t.accepted, t.proposals) },
    averageConfidence: avgConfidence,
    bySeverity,
    byCategory,
    topEscalationReasons: reasons.map((r) => ({ ...r, label: AI_ESCALATION_REASON_LABELS[r.reason as keyof typeof AI_ESCALATION_REASON_LABELS] ?? r.reason })),
    commonProblems: common,
    unknownQuestions: unknown.map((u) => ({ ...u, createdAt: iso(u.createdAt) })),
    feedback: {
      assessment: tally(fb.filter((f) => f.source === 'ADMIN').map((f) => f.assessmentVerdict)),
      severity: tally(fb.filter((f) => f.source === 'ADMIN').map((f) => f.severityVerdict)),
      price: tally(fb.filter((f) => f.source === 'ADMIN').map((f) => f.priceVerdict)),
      customerHelpful: tally(fb.filter((f) => f.source === 'CUSTOMER').map((f) => f.helpful)),
    },
    estimateVariance: {
      samples: variance.length,
      averageAbsoluteDifference: avg(variance.map((v) => v.absoluteDifference).filter((v): v is number => v !== null)),
      averagePercentVariance: avg(variance.map((v) => v.percentVariance).filter((v): v is number => v !== null)),
      items: variance.map(({ absoluteDifference: _a, ...v }) => v),
    },
  };
}

// ---- Employee / job view --------------------------------------------------------------------------------

/** The AI assessment behind a job, for people who can access that job (assigned electrician, owner customer, admins). */
export async function jobAiSummary(auth: AuthContext, jobId: string): Promise<JobAiSummaryDto | null> {
  const q = db();
  const job = await new PostgresJobRepository(q).findById(jobId);
  if (!job || !canAccessJob(auth, job)) throw notFound('Job');
  const { rows } = await q.query<{ id: string }>('SELECT ai_conversation_id AS id FROM jobs WHERE id = $1 AND ai_conversation_id IS NOT NULL', [jobId]);
  if (!rows[0]) return null;
  const repo = new PostgresAiRepository(q);
  const c = await repo.conversation(rows[0].id);
  if (!c) return null;
  const [latest, proposal, attachments] = await Promise.all([repo.latestAssessment(c.id), repo.currentProposal(c.id), repo.attachments(c.id)]);
  if (!latest) return null;
  const showPrice = auth.role !== 'EMPLOYEE';
  return {
    conversationId: c.id,
    reference: c.reference,
    summary: latest.summary,
    serviceCategoryLabel: latest.serviceCategoryLabel,
    severity: latest.finalSeverity,
    severityName: latest.responseWindow.severityName,
    safetyFlags: (latest.safetyTriggers ?? []).filter((t) => !t.negated).map((t) => t.label),
    observations: latest.observations,
    attachments: await attachmentDtos(attachments),
    estimate: showPrice && proposal ? { min: proposal.priceMin, max: proposal.priceMax } : null,
    acceptedAt: c.acceptedAt ? iso(c.acceptedAt) : null,
  };
}

// ---- Scheduled tasks -------------------------------------------------------------------------------------

export async function reviewAgeingTask(): Promise<number> {
  const cfg: AiConfig = await loadAiConfig(db());
  if (!featureEnabled(cfg)) return 0;
  return transactional(async (tx, events) => {
    const aged = await new PostgresAiRepository(tx).ageingCases(cfg.settings.reviewAgeingHours);
    for (const c of aged) {
      await events.notifyAdmins({
        type: (c.currentSeverity ?? 0) >= 4 ? 'AI_CASE_CRITICAL' : 'AI_CASE_REVIEW',
        title: `Smart Quote waiting over ${cfg.settings.reviewAgeingHours}h · ${c.reference}`,
        body: 'This AI case still needs a response from the team.',
        data: { aiCaseId: c.id, route: `/admin/ai-case/${c.id}` },
      });
      await audit(tx, SYSTEM_ACTOR, 'AI_REVIEW_AGEING', 'ai_conversation', c.id);
    }
    return aged.length;
  });
}

// ---- Privacy (POPIA data requests) -------------------------------------------------------------------------

export async function exportCustomerAiData(q: Queryable, customerId: string) {
  const { rows } = await q.query(
    `SELECT c.reference, c.title, c.status, c.created_at AS "createdAt",
            COALESCE((SELECT json_agg(json_build_object('role', m.role, 'body', m.body, 'createdAt', m.created_at) ORDER BY m.created_at)
                        FROM ai_messages m WHERE m.conversation_id = c.id), '[]'::json) AS messages
       FROM ai_conversations c WHERE c.customer_id = $1 ORDER BY c.created_at`,
    [customerId],
  );
  return rows;
}

/** Deletion request: AI conversation text and unlinked photos are removed; structured, non-personal assessment data is retained. */
export async function anonymiseCustomerAi(q: Queryable, userId: string): Promise<string[]> {
  await q.query(`UPDATE ai_messages m SET body = '[removed at customer request]', questions = '[]'::jsonb FROM ai_conversations c
                  WHERE c.id = m.conversation_id AND c.user_id = $1`, [userId]);
  await q.query(`UPDATE ai_conversations SET title = '[removed]', site_area = NULL WHERE user_id = $1`, [userId]);
  await q.query(`UPDATE ai_assessments s SET summary = '[removed]', observations = '[]'::jsonb FROM ai_conversations c WHERE c.id = s.conversation_id AND c.user_id = $1`, [userId]);
  const { rows } = await q.query<{ fileId: string; storageKey: string }>(
    `DELETE FROM ai_attachments aa USING ai_conversations c, files f
      WHERE aa.conversation_id = c.id AND c.user_id = $1 AND f.id = aa.file_id
        AND NOT EXISTS (SELECT 1 FROM job_attachments ja WHERE ja.file_id = aa.file_id)
      RETURNING aa.file_id AS "fileId", f.storage_key AS "storageKey"`,
    [userId],
  );
  if (rows.length) await q.query('DELETE FROM files WHERE id = ANY($1::uuid[])', [rows.map((r) => r.fileId)]);
  return rows.map((r) => r.storageKey);
}
