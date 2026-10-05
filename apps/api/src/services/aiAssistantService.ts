/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import {
  AI_DISCLAIMER,
  AI_ESTIMATE_NOTICE,
  AI_SIMULATION_LABEL,
  type AcceptAiProposalInput,
  type AiConversationDto,
  type AiConversationSummaryDto,
  type AiMessageInput,
  type AiStatusDto,
  type Paginated,
  type StartAiConversationInput,
} from '@hydra/shared';
import { db, type Queryable } from '../db/pool';
import { caseTitle } from '../ai/text';
import { PostgresAiRepository, type ConversationRow } from '../repositories/aiRepository';
import { PostgresContentRepository } from '../repositories/contentRepository';
import { PostgresFileRepository } from '../repositories/fileRepository';
import { PostgresJobRepository } from '../repositories/jobRepository';
import type { AuthContext } from '../types/express';
import { businessRule, forbidden, notFound, serviceUnavailable } from '../utils/errors';
import { paginated } from '../utils/pagination';
import { audit, type Actor } from './auditService';
import { featureEnabled, loadAiConfig, providerFor, type AiConfig } from './ai/config';
import { attachmentDtos, conversationDto, messageDtos, summaryDto } from './ai/dto';
import { applySafetyRulesOnly, runAssessment } from './ai/orchestrator';
import { transactional, type EventCollector } from './events';
import { assertOwnUnattachedFiles } from './fileService';

const MAX_IMAGES_PER_MESSAGE = 6;

function requireCustomer(auth: AuthContext): string {
  if (auth.role !== 'CUSTOMER' || !auth.customerId) throw forbidden('Smart Quote is available to customers');
  return auth.customerId;
}

function assertEnabled(cfg: AiConfig): void {
  if (!featureEnabled(cfg)) throw serviceUnavailable('HYDRA Smart Quote is currently unavailable. You can still request a service in the usual way.', 'AI_ASSISTANT_DISABLED');
}

/** Ownership check: another customer's case is reported as not found (no existence leak). */
async function ownConversation(q: Queryable, auth: AuthContext, id: string, forUpdate = false): Promise<ConversationRow> {
  const customerId = requireCustomer(auth);
  const c = await new PostgresAiRepository(q).conversation(id, forUpdate);
  if (!c || c.customerId !== customerId) throw notFound('Assessment');
  return c;
}

export async function aiStatus(): Promise<AiStatusDto> {
  const cfg = await loadAiConfig(db());
  const provider = providerFor(cfg);
  const enabled = featureEnabled(cfg);
  return {
    enabled,
    simulation: provider.simulation,
    simulationLabel: provider.simulation ? AI_SIMULATION_LABEL : null,
    providerConfigured: provider.configured,
    supportsImages: provider.supportsImages,
    humanOnly: !provider.configured,
    maxImagesPerConversation: cfg.settings.maxImagesPerConversation,
    maxImagesPerMessage: MAX_IMAGES_PER_MESSAGE,
    maxClarificationRounds: cfg.settings.maxClarificationRounds,
    disclaimer: AI_DISCLAIMER,
    estimateNotice: AI_ESTIMATE_NOTICE,
    unavailableReason: enabled ? null : 'HYDRA Smart Quote is switched off at the moment. You can still request a service or contact us directly.',
  };
}

async function attachToMessage(tx: Queryable, auth: AuthContext, conversationId: string, messageId: string, fileIds: string[], cfg: AiConfig) {
  if (!fileIds.length) return;
  await assertOwnUnattachedFiles(tx, auth, fileIds, ['AI_ASSESSMENT_PHOTO']);
  const repo = new PostgresAiRepository(tx);
  if ((await repo.attachmentCount(conversationId)) + fileIds.length > cfg.settings.maxImagesPerConversation) {
    throw businessRule(`You can attach up to ${cfg.settings.maxImagesPerConversation} photos to one assessment`, 'AI_TOO_MANY_IMAGES');
  }
  await repo.addAttachments(conversationId, messageId, fileIds);
  await new PostgresFileRepository(tx).markAttached(fileIds);
}

export async function startConversation(auth: AuthContext, input: StartAiConversationInput, actor: Actor): Promise<AiConversationDto> {
  const customerId = requireCustomer(auth);
  const cfg = await loadAiConfig(db());
  assertEnabled(cfg);
  const provider = providerFor(cfg);
  const { id, duplicate } = await transactional(async (tx) => {
    const repo = new PostgresAiRepository(tx);
    const existing = await repo.findRecentDuplicate(customerId, input.message);
    if (existing) return { id: existing, duplicate: true };
    const conversationId = await repo.insertConversation({
      customerId, userId: auth.userId, title: caseTitle(input.message), propertyType: input.propertyType ?? null, siteArea: input.siteArea ?? null,
      urgency: input.urgency ?? null, isSimulation: provider.simulation,
    });
    const messageId = await repo.insertMessage({ conversationId, role: 'CUSTOMER', kind: 'TEXT', body: input.message, authorUserId: auth.userId });
    await attachToMessage(tx, auth, conversationId, messageId, input.attachmentIds, cfg);
    await audit(tx, actor, 'AI_CONVERSATION_STARTED', 'ai_conversation', conversationId, { images: input.attachmentIds.length, propertyType: input.propertyType });
    return { id: conversationId, duplicate: false };
  });
  // The enquiry is committed before the AI runs: a provider failure can never lose it.
  if (!duplicate) await runAssessment(id, { actor });
  return getConversation(auth, id);
}

export async function sendMessage(auth: AuthContext, id: string, input: AiMessageInput, actor: Actor): Promise<AiConversationDto> {
  const cfg = await loadAiConfig(db());
  assertEnabled(cfg);
  const rerun = await transactional(async (tx, events) => {
    const repo = new PostgresAiRepository(tx);
    const c = await ownConversation(tx, auth, id, true);
    if (['CUSTOMER_ACCEPTED', 'CONVERTED_TO_JOB', 'CLOSED'].includes(c.status)) throw businessRule('This assessment is closed. Start a new Smart Quote or message us about your job.', 'AI_CASE_CLOSED');
    if (c.status === 'AI_PROCESSING') throw businessRule('Your previous message is still being assessed. Please wait a moment.', 'AI_PROCESSING');
    const messageId = await repo.insertMessage({ conversationId: id, role: 'CUSTOMER', kind: 'TEXT', body: input.body, authorUserId: auth.userId });
    await attachToMessage(tx, auth, id, messageId, input.attachmentIds, cfg);
    await audit(tx, actor, 'AI_CUSTOMER_MESSAGE', 'ai_conversation', id, { images: input.attachmentIds.length });
    const adminOwned = ['NEEDS_ADMIN_REVIEW', 'ADMIN_RESPONDED', 'PROPOSAL_SENT'].includes(c.status) || (await repo.hasAdminEngagement(id));
    if (!adminOwned) return true;
    // The team owns this case: the AI is not re-run, but safety rules still apply immediately.
    const escalated = await applySafetyRulesOnly(tx, events, c, await repo.latestAssessment(id), input.body, actor);
    if (!escalated) {
      await repo.updateConversation(id, { status: 'NEEDS_ADMIN_REVIEW', reviewRequired: true, reviewRequestedAt: 'now', escalationReasons: [...new Set([...c.escalationReasons, 'CUSTOMER_REPLIED' as const])] });
      await events.notifyAdmins({ type: 'AI_CASE_UPDATE', title: `Customer replied · ${c.reference}`, body: input.body.slice(0, 300), data: { aiCaseId: id, route: `/admin/ai-case/${id}` } });
    }
    events.emit('admins', 'ai.updated', { conversationId: id });
    return false;
  });
  if (rerun) await runAssessment(id, { actor });
  return getConversation(auth, id);
}

export async function listConversations(auth: AuthContext, page: number, pageSize: number): Promise<Paginated<AiConversationSummaryDto>> {
  const customerId = requireCustomer(auth);
  const repo = new PostgresAiRepository(db());
  const { items, total } = await repo.listForCustomer(customerId, pageSize, (page - 1) * pageSize);
  const out = await Promise.all(
    items.map(async (c) => summaryDto(c, { proposalStatus: c.proposalStatus, estimateMin: c.proposalMin, estimateMax: c.proposalMax, adminEngaged: await repo.hasAdminEngagement(c.id) })),
  );
  return paginated(out, page, pageSize, total);
}

export async function buildConversationDto(q: Queryable, c: ConversationRow, cfg: AiConfig): Promise<AiConversationDto> {
  const repo = new PostgresAiRepository(q);
  const [messages, attachments, latest, proposal, engaged, feedback] = await Promise.all([
    repo.messages(c.id), repo.attachments(c.id), repo.latestAssessment(c.id), repo.currentProposal(c.id), repo.hasAdminEngagement(c.id), repo.feedback(c.id),
  ]);
  const proposalAssessment = proposal ? (proposal.assessmentId === latest?.id ? latest : await repo.assessment(proposal.assessmentId)) : null;
  return conversationDto({
    c,
    messages: messageDtos(messages, await attachmentDtos(attachments), c.isSimulation),
    latest,
    proposal,
    proposalAssessment,
    adminEngaged: engaged,
    customerFeedback: feedback.find((f) => f.source === 'CUSTOMER')?.helpful ?? null,
    maxClarificationRounds: cfg.settings.maxClarificationRounds,
    enabled: featureEnabled(cfg),
  });
}

export async function getConversation(auth: AuthContext, id: string): Promise<AiConversationDto> {
  const c = await ownConversation(db(), auth, id);
  return buildConversationDto(db(), c, await loadAiConfig(db()));
}

/**
 * Creates the REQUESTED job for an accepted / admin-converted case through the existing job model
 * (source AI_ASSESSMENT, photos attached, internal note) — the normal quote → schedule flow follows.
 */
export async function createJobFromCase(
  tx: Queryable,
  events: EventCollector,
  c: ConversationRow,
  input: { serviceTypeId: string; siteAddress: string; description: string; urgency: 'STANDARD' | 'HIGH' | 'EMERGENCY'; contactPhone: string | null; preferredDate: string | null },
  actorUserId: string,
  note: string,
): Promise<{ jobId: string; reference: string }> {
  const jobs = new PostgresJobRepository(tx);
  const repo = new PostgresAiRepository(tx);
  const jobId = await jobs.insert({
    customerId: c.customerId, serviceTypeId: input.serviceTypeId, siteAddress: input.siteAddress, description: input.description.slice(0, 2000),
    urgency: input.urgency, source: 'AI_ASSESSMENT', contactPhone: input.contactPhone, preferredDate: input.preferredDate, aiConversationId: c.id,
  });
  await jobs.createMilestones(jobId);
  await jobs.completeMilestonesByCode(jobId, ['REQUESTED'], actorUserId);
  await jobs.recordStatusHistory(jobId, null, 'REQUESTED', 'AI_ASSESSMENT', actorUserId, c.reference);
  for (const a of await repo.attachments(c.id)) await jobs.addAttachment(jobId, a.fileId, c.userId);
  await jobs.addNote(jobId, actorUserId, note.slice(0, 2000), 'INTERNAL');
  await repo.updateConversation(c.id, { status: 'CONVERTED_TO_JOB', convertedJobId: jobId, reviewRequired: false });
  await repo.attachJobToAcceptedProposal(c.id, jobId);
  const job = (await jobs.findById(jobId))!;
  events.emit('admins', 'job.updated', { jobId, status: 'REQUESTED', reference: job.reference });
  return { jobId, reference: job.reference };
}

export async function acceptProposal(auth: AuthContext, id: string, input: AcceptAiProposalInput, actor: Actor): Promise<AiConversationDto> {
  const cfg = await loadAiConfig(db());
  assertEnabled(cfg);
  await transactional(async (tx, events) => {
    const repo = new PostgresAiRepository(tx);
    const c = await ownConversation(tx, auth, id, true);
    const proposal = await repo.currentProposal(id);
    if (c.status === 'CONVERTED_TO_JOB' || c.status === 'CUSTOMER_ACCEPTED' || proposal?.status === 'ACCEPTED') return; // retried accept: already done
    if (!proposal || proposal.status !== 'SENT' || !['AI_ANSWERED', 'PROPOSAL_SENT'].includes(c.status)) {
      throw businessRule('There is no open proposal to accept on this assessment.', 'AI_NO_OPEN_PROPOSAL');
    }
    const assessment = await repo.assessment(proposal.assessmentId);
    await repo.updateProposal(proposal.id, { status: 'ACCEPTED' });
    await repo.updateConversation(id, { status: 'CUSTOMER_ACCEPTED', acceptedAt: 'now' });
    const level = cfg.severity.levels[proposal.severity - 1]!;
    const category = cfg.pricing.categories.find((x) => x.code === assessment?.serviceCategory);
    const service = category?.serviceTypeSlug ? await new PostgresContentRepository(tx).getServiceTypeBySlug(category.serviceTypeSlug) : null;
    const priceText = `R${proposal.priceMin.toLocaleString('en-ZA')} – R${proposal.priceMax.toLocaleString('en-ZA')}`;
    let jobRef: string | null = null;
    let jobId: string | null = null;
    if (service?.isActive) {
      const created = await createJobFromCase(tx, events, c, {
        serviceTypeId: service.id,
        siteAddress: input.siteAddress,
        description: `[HYDRA Smart Quote ${c.reference}] ${assessment?.summary ?? c.title}\nCustomer accepted the AI preliminary proposal (${priceText}, preliminary — subject to inspection). Severity ${proposal.severity}/5 (${level.name}).`,
        urgency: level.jobUrgency,
        contactPhone: input.contactPhone ?? c.customerPhone,
        preferredDate: input.preferredDate ?? null,
      }, auth.userId, `Customer accepted AI preliminary proposal ${c.reference}: ${priceText} (${proposal.priceSource === 'ADMIN' ? 'admin-approved price' : 'system-calculated price'}), severity ${proposal.severity}/5, confidence ${assessment?.finalConfidence ?? '—'}%. Final quote still required.`);
      jobRef = created.reference;
      jobId = created.jobId;
    }
    await events.notifyAdmins({
      type: 'NEW_JOB_REQUEST',
      title: `Customer accepted AI preliminary proposal · ${c.reference}`,
      body: jobRef ? `${jobRef} created — prepare the formal quote. ${priceText}` : `No service type mapped — convert the case to a job. ${priceText}`,
      data: jobId ? { jobId, aiCaseId: id } : { aiCaseId: id, route: `/admin/ai-case/${id}` },
    });
    if (jobRef) {
      await events.notify([c.userId], { type: 'NEW_JOB_REQUEST', title: `Service request ${jobRef} created`, body: 'Thanks for accepting the preliminary proposal. Our team will confirm the scope and send your formal quote.', data: { jobId: jobId!, aiCaseId: id } });
    }
    events.emit('admins', 'ai.updated', { conversationId: id });
    await audit(tx, actor, 'AI_PROPOSAL_ACCEPTED', 'ai_conversation', id, { proposalId: proposal.id, priceMin: proposal.priceMin, priceMax: proposal.priceMax, jobId });
  });
  return getConversation(auth, id);
}

export async function declineProposal(auth: AuthContext, id: string, reason: string | undefined, actor: Actor): Promise<AiConversationDto> {
  await transactional(async (tx, events) => {
    const repo = new PostgresAiRepository(tx);
    const c = await ownConversation(tx, auth, id, true);
    const proposal = await repo.currentProposal(id);
    if (proposal?.status === 'DECLINED') return;
    if (!proposal || proposal.status !== 'SENT') throw businessRule('There is no open proposal to decline.', 'AI_NO_OPEN_PROPOSAL');
    await repo.updateProposal(proposal.id, { status: 'DECLINED', declineReason: reason ?? null });
    await repo.updateConversation(id, { status: 'CLOSED', declinedAt: 'now', closedAt: 'now', closeReason: reason ? `Customer declined: ${reason}` : 'Customer declined the proposal', reviewRequired: false });
    await repo.insertMessage({ conversationId: id, role: 'SYSTEM', kind: 'STATUS', body: 'You declined this proposal. You can start a new Smart Quote at any time.' });
    events.emit('admins', 'ai.updated', { conversationId: id });
    await audit(tx, actor, 'AI_PROPOSAL_DECLINED', 'ai_conversation', id, { proposalId: proposal.id, reason: reason ?? null });
    void c;
  });
  return getConversation(auth, id);
}

export async function requestReview(auth: AuthContext, id: string, note: string | undefined, actor: Actor): Promise<AiConversationDto> {
  await transactional(async (tx, events) => {
    const repo = new PostgresAiRepository(tx);
    const c = await ownConversation(tx, auth, id, true);
    if (['CUSTOMER_ACCEPTED', 'CONVERTED_TO_JOB', 'CLOSED'].includes(c.status)) throw businessRule('This assessment is closed.', 'AI_CASE_CLOSED');
    if (c.humanRequested && c.status === 'NEEDS_ADMIN_REVIEW') return;
    if (note) await repo.insertMessage({ conversationId: id, role: 'CUSTOMER', kind: 'TEXT', body: note, authorUserId: auth.userId });
    await repo.insertMessage({ conversationId: id, role: 'SYSTEM', kind: 'STATUS', body: "You asked for a person to review this. Your enquiry has been sent to PSG Electrical — you'll receive a response through HYDRA." });
    await repo.updateConversation(id, {
      status: 'NEEDS_ADMIN_REVIEW', humanRequested: true, reviewRequired: true, reviewRequestedAt: 'now',
      escalationReasons: [...new Set([...c.escalationReasons, 'CUSTOMER_REQUESTED_HUMAN' as const])],
    });
    await events.notifyAdmins({ type: 'AI_CASE_REVIEW', title: `Customer asked for a person · ${c.reference}`, body: (note ?? c.title).slice(0, 300), data: { aiCaseId: id, route: `/admin/ai-case/${id}` } });
    events.emit('admins', 'ai.updated', { conversationId: id });
    await audit(tx, actor, 'AI_HUMAN_REVIEW_REQUESTED', 'ai_conversation', id);
  });
  return getConversation(auth, id);
}

export async function customerFeedback(auth: AuthContext, id: string, input: { helpful: 'YES' | 'PARTLY' | 'NO'; comment?: string }, actor: Actor): Promise<AiConversationDto> {
  await transactional(async (tx) => {
    const repo = new PostgresAiRepository(tx);
    const c = await ownConversation(tx, auth, id, true);
    if (!c.convertedJobStatus || !['COMPLETED', 'INVOICED', 'PARTIALLY_PAID', 'PAID'].includes(c.convertedJobStatus)) {
      throw businessRule('You can rate the assessment once the service has been completed.', 'AI_FEEDBACK_TOO_EARLY');
    }
    const latest = await repo.latestAssessment(id);
    await repo.upsertFeedback({ conversationId: id, assessmentId: latest?.id ?? null, source: 'CUSTOMER', helpful: input.helpful, comment: input.comment ?? null, userId: auth.userId });
    await audit(tx, actor, 'AI_CUSTOMER_FEEDBACK', 'ai_conversation', id, { helpful: input.helpful });
  });
  return getConversation(auth, id);
}
