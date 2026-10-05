/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import {
  AI_ESCALATION_MESSAGE,
  AI_IMAGE_UNAVAILABLE_NOTICE,
  AI_PROVIDER_FAILURE_MESSAGE,
  AI_SAFETY_MESSAGE,
  type AiAnalysis,
  type AiEscalationReason,
  type AiOutcome,
  type PricingCategory,
} from '@hydra/shared';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { db, type Queryable } from '../../db/pool';
import {
  adjustConfidence,
  calculateEstimate,
  classifyCategory,
  decide,
  detectSafetyTriggers,
  deviatesFromHistory,
  historicalReference,
  imageSafetyFloor,
  isWithinBusinessHours,
  priceSpreadPoor,
  resolveCategory,
  resolveSeverity,
  responseWindow,
} from '../../ai/engine';
import { parseProviderOutput } from '../../ai/parse';
import { PROMPT_VERSION } from '../../ai/policies';
import { buildSystemPrompt, buildUserPrompt } from '../../ai/prompt';
import { AiProviderError, type AiCaseInput, type AiProvider, type TranscriptLine } from '../../ai/providers/types';
import { redactPii, stripUnsafeSentences } from '../../ai/text';
import { integrations } from '../../integrations';
import { PostgresKnowledgeRepository, PostgresKnowledgeRetriever } from '../../repositories/aiKnowledgeRepository';
import { PostgresAiRepository, type AssessmentRow, type AttachmentRow, type ConversationRow, type NewAssessment, type ProviderCallLog } from '../../repositories/aiRepository';
import { PostgresSettingsRepository } from '../../repositories/settingsRepository';
import { audit, type Actor } from '../auditService';
import { transactional, type EventCollector } from '../events';
import { loadAiConfig, providerFor, type AiConfig } from './config';

const MAX_IMAGES_TO_PROVIDER = 4;
const MAX_IMAGE_BYTES_TO_PROVIDER = 5 * 1024 * 1024;

interface ProviderOutcome {
  analysis: AiAnalysis | null;
  failed: boolean;
  malformed: boolean;
  calls: ProviderCallLog[];
  latencyMs: number | null;
  errorCode: string | null;
}

/** Calls the provider with a hard timeout and bounded retries (timeouts, rate limits, transient errors). */
async function callProvider(provider: AiProvider, input: AiCaseInput): Promise<ProviderOutcome> {
  const cfg = config();
  const calls: ProviderCallLog[] = [];
  const base = { provider: provider.name, model: provider.model, operation: 'analyseCase', promptVersion: input.promptVersion, inputChars: input.systemPrompt.length + input.userPrompt.length, imageCount: input.images.length };
  const attempts = 1 + cfg.AI_MAX_RETRIES;
  let lastError: AiProviderError | null = null;
  let totalLatency = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.AI_TIMEOUT_MS);
    const started = Date.now();
    try {
      const raw = await provider.analyseCase(input, controller.signal);
      const latencyMs = Date.now() - started;
      totalLatency += latencyMs;
      const parsed = parseProviderOutput(raw);
      if (!parsed.ok) {
        calls.push({ ...base, status: 'MALFORMED', attempt, latencyMs, errorMessage: parsed.error });
        return { analysis: null, failed: false, malformed: true, calls, latencyMs: totalLatency, errorCode: 'MALFORMED_AI_RESPONSE' };
      }
      calls.push({ ...base, status: parsed.repaired ? 'REPAIRED' : 'OK', attempt, latencyMs, errorMessage: null });
      return { analysis: parsed.data, failed: false, malformed: false, calls, latencyMs: totalLatency, errorCode: null };
    } catch (err) {
      const latencyMs = Date.now() - started;
      totalLatency += latencyMs;
      lastError = controller.signal.aborted
        ? new AiProviderError('TIMEOUT', 'AI provider timed out')
        : err instanceof AiProviderError
          ? err
          : new AiProviderError('ERROR', 'AI provider call failed', false);
      calls.push({ ...base, status: lastError.kind === 'ERROR' ? 'ERROR' : lastError.kind, attempt, latencyMs, errorMessage: lastError.message });
      if (!lastError.retryable || attempt === attempts) break;
      await new Promise((r) => setTimeout(r, 300 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  return { analysis: null, failed: true, malformed: false, calls, latencyMs: totalLatency, errorCode: lastError ? `PROVIDER_${lastError.kind}` : 'PROVIDER_ERROR' };
}

async function loadImages(provider: AiProvider, attachments: AttachmentRow[]): Promise<{ images: AiCaseInput['images']; sentIds: string[] }> {
  if (!provider.supportsImages) return { images: [], sentIds: [] };
  const images: AiCaseInput['images'] = [];
  const sentIds: string[] = [];
  for (const a of attachments.slice(-MAX_IMAGES_TO_PROVIDER)) {
    if (a.sizeBytes > MAX_IMAGE_BYTES_TO_PROVIDER || a.mimeType === 'image/heic') continue;
    try {
      const buf = await integrations().storage.get(a.storageKey);
      images.push({ mimeType: a.mimeType, base64: buf.toString('base64') });
      sentIds.push(a.id);
    } catch (err) {
      logger.warn({ err: (err as Error).message, attachmentId: a.id }, 'Smart Quote image could not be read');
    }
  }
  return { images, sentIds };
}

/** Removes DIY/unsafe sentences and any personal data the model echoed; reports whether anything was unsafe. */
function sanitise(a: AiAnalysis, names: string[]): { analysis: AiAnalysis; unsafe: boolean } {
  let unsafe = false;
  const clean = (t: string) => {
    const r = stripUnsafeSentences(redactPii(t, names));
    if (r.removed) unsafe = true;
    return r.text;
  };
  const list = (xs: string[]) => xs.map(clean).filter((x) => x.length > 2);
  const analysis: AiAnalysis = {
    ...a,
    summary: clean(a.summary),
    severityReason: clean(a.severityReason),
    observations: list(a.observations),
    clarifyingQuestions: list(a.clarifyingQuestions).slice(0, 3),
    suggestedPricingFactors: list(a.suggestedPricingFactors),
    adminReviewReason: a.adminReviewReason ? clean(a.adminReviewReason) : null,
    imageFindings: { ...a.imageFindings, notes: list(a.imageFindings.notes) },
  };
  return { analysis, unsafe };
}

function transcriptOf(messages: { role: string; body: string; questions: string[] }[], names: string[]): TranscriptLine[] {
  return messages
    .filter((m) => m.role !== 'SYSTEM')
    .map((m) => ({
      role: m.role === 'CUSTOMER' ? 'CUSTOMER' : m.role === 'ADMIN' ? 'TEAM' : 'ASSISTANT',
      text: redactPii([m.body, ...(m.questions ?? []).map((q) => `- ${q}`)].join('\n'), names),
    }));
}

function assistantMessage(outcome: AiOutcome, severity: number, cfg: AiConfig, opts: { providerFailed: boolean; rounds: number; outOfHours: string | null }): { kind: 'CLARIFICATION' | 'ASSESSMENT' | 'ESCALATION_NOTICE' | 'SAFETY_WARNING'; body: string } {
  const level = cfg.severity.levels[severity - 1]!;
  const oh = opts.outOfHours ? ` ${opts.outOfHours}` : '';
  switch (outcome) {
    case 'NEEDS_INFORMATION':
      return {
        kind: 'CLARIFICATION',
        body: opts.rounds === 0
          ? 'Thanks. I can help assess this for a quotation. Before I prepare an estimate, can you tell me:'
          : 'Thanks for the extra detail. A few more questions so the estimate is as accurate as possible:',
      };
    case 'PROPOSAL':
      return { kind: 'ASSESSMENT', body: 'Thanks — I have enough information for a preliminary assessment. Please review the proposal below.' };
    case 'PROPOSAL_REVIEW_RECOMMENDED':
      return { kind: 'ASSESSMENT', body: 'Thanks — here is a preliminary assessment. Because some details are uncertain, a member of our team will also double-check it.' };
    case 'SAFETY_ESCALATION':
      return { kind: 'SAFETY_WARNING', body: `${AI_SAFETY_MESSAGE} Our team has been alerted and will contact you.${oh}` };
    default: {
      const base = opts.providerFailed ? AI_PROVIDER_FAILURE_MESSAGE : AI_ESCALATION_MESSAGE;
      const urgent = severity >= 4
        ? ` ${level.customerWording} If the situation gets worse — smoke, sparking or a burning smell — keep away from the equipment and call our 24/7 emergency line.`
        : '';
      return { kind: 'ESCALATION_NOTICE', body: `${base}${urgent}${oh}` };
    }
  }
}

async function notifyAdminsForOutcome(events: EventCollector, c: ConversationRow, outcome: AiOutcome, severity: number, reasons: AiEscalationReason[], summary: string) {
  const data = { aiCaseId: c.id, route: `/admin/ai-case/${c.id}` };
  if (outcome === 'SAFETY_ESCALATION') {
    await events.notifyAdmins({ type: 'AI_CASE_CRITICAL', title: `🚨 CRITICAL Smart Quote · ${c.reference}`, body: `Severity 5 — ${summary}`.slice(0, 480), data });
    return;
  }
  if (outcome === 'PROPOSAL_REVIEW_RECOMMENDED') {
    await events.notifyAdmins({ type: 'AI_CASE_REVIEW', title: `Smart Quote review recommended · ${c.reference}`, body: summary.slice(0, 480), data });
    return;
  }
  if (outcome !== 'ADMIN_REVIEW') return;
  const title = severity >= 4
    ? `⚠️ URGENT Smart Quote (severity ${severity}) · ${c.reference}`
    : reasons.includes('PROVIDER_UNAVAILABLE') || reasons.includes('MALFORMED_AI_RESPONSE')
      ? `Smart Quote: AI unavailable — review ${c.reference}`
      : reasons.includes('CUSTOMER_REQUESTED_HUMAN')
        ? `Customer asked for a person · ${c.reference}`
        : `Smart Quote needs review · ${c.reference}`;
  await events.notifyAdmins({ type: severity >= 4 ? 'AI_CASE_CRITICAL' : 'AI_CASE_REVIEW', title, body: summary.slice(0, 480), data });
}

export interface RunOptions {
  actor: Actor;
  humanRequested?: boolean;
  now?: Date;
}

/**
 * Runs one Smart Quote assessment for a conversation (customer message just stored). Never throws for
 * provider problems: the enquiry is kept and routed to a person instead.
 */
export async function runAssessment(conversationId: string, opts: RunOptions): Promise<AiOutcome | null> {
  const q: Queryable = db();
  const repo = new PostgresAiRepository(q);
  const cfg = await loadAiConfig(q);
  const conv = await repo.conversation(conversationId);
  if (!conv) return null;
  await repo.updateConversation(conversationId, { status: 'AI_PROCESSING' });

  try {
    const [messages, attachments] = await Promise.all([repo.messages(conversationId), repo.attachments(conversationId)]);
    const names = [conv.customerFirstName, conv.customerLastName];
    const customerText = messages.filter((m) => m.role === 'CUSTOMER').map((m) => m.body).join('\n');
    const now = opts.now ?? new Date();

    // 1. Deterministic safety rules and classification — independent of any AI.
    const safety = detectSafetyTriggers(customerText, cfg.severity.additionalSafetyRules);
    const classified = classifyCategory(customerText, cfg.pricing.categories);

    // 2. Approved knowledge (RAG).
    const knowledge = await new PostgresKnowledgeRetriever(q).retrieve({ text: customerText, category: classified.score > 0 ? classified.category.code : null, limit: cfg.settings.knowledgeRetrievalCount });

    // 3. Provider call (redacted input, images only to providers that support them).
    const provider = providerFor(cfg);
    const roundsRemaining = Math.max(0, cfg.settings.maxClarificationRounds - conv.clarificationRounds);
    const { images, sentIds } = await loadImages(provider, attachments);
    const transcript = transcriptOf(messages, names);
    const input: AiCaseInput = {
      promptVersion: PROMPT_VERSION,
      systemPrompt: buildSystemPrompt(cfg.pricing.categories, cfg.severity),
      userPrompt: buildUserPrompt({ transcript, propertyType: conv.propertyType, customerUrgency: conv.customerUrgency, roundsUsed: conv.clarificationRounds, roundsRemaining, imageCount: attachments.length, imagesSent: images.length > 0, knowledge }),
      transcript,
      images,
      context: { propertyType: conv.propertyType, customerUrgency: conv.customerUrgency, clarificationRoundsUsed: conv.clarificationRounds, clarificationRoundsRemaining: roundsRemaining, imageCount: attachments.length },
      categories: cfg.pricing.categories,
      knowledge,
    };
    const result = await callProvider(provider, input);

    // 4. Sanitise and combine with rules.
    const sanitised = result.analysis ? sanitise(result.analysis, names) : null;
    const ai = sanitised?.analysis ?? null;
    const aiCategory = ai ? resolveCategory(ai.serviceCategory, cfg.pricing.categories) : null;
    const category: PricingCategory = aiCategory ?? classified.category;
    const imageFloor = ai ? imageSafetyFloor([...ai.safetyFlags, ...ai.imageFindings.notes]) : null;
    const floor = Math.max(safety.floor ?? 0, imageFloor ?? 0) || null;
    const finalSeverity = resolveSeverity(ai?.severity ?? null, category.defaultSeverity, floor);
    const afterHours = finalSeverity >= 4 && !isWithinBusinessHours(cfg.severity.businessHours, now);

    const vatRate = (await new PostgresSettingsRepository(q).getAll()).vatRate;
    const unitCosts = await repo.unitCosts(category.typicalMaterials.map((m) => m.sku));
    const price = calculateEstimate(cfg.pricing, { category, suggestedHours: ai?.estimatedLabourHours ?? null, severity: finalSeverity, afterHours, vatRate, unitCosts });
    const hist = historicalReference(await repo.historicalTotals(category.code));
    const histDeviation = deviatesFromHistory(hist, price.min, price.max, cfg.settings.pricingTolerancePct);

    const imageUnclear = ai?.imageFindings.status === 'UNCLEAR';
    const confidence = ai
      ? adjustConfidence({
          aiConfidence: ai.confidence,
          imageUnclear,
          conflicting: ai.conflictingInformation,
          categoryDisagrees: classified.score > 0 && !!aiCategory && aiCategory.code !== classified.category.code,
          priceClamped: price.clamped && price.inputsOutOfRange,
          knowledgeMatched: knowledge.some((k) => k.serviceCategory === category.code),
        })
      : 0;
    const activeTriggers = safety.triggers.filter((t) => !t.negated);
    const needsInfo = !!ai && ai.needsMoreInformation && ai.clarifyingQuestions.length > 0;
    const decision = decide({
      settings: cfg.settings,
      severityPolicy: cfg.severity,
      finalSeverity,
      confidence,
      safetyTriggered: activeTriggers.length > 0 || (imageFloor ?? 0) >= 4,
      needsMoreInformation: needsInfo,
      clarificationRoundsUsed: conv.clarificationRounds,
      supportedCategory: category.supported,
      imageUnclear,
      conflicting: !!ai?.conflictingInformation,
      priceInputsOutOfRange: price.inputsOutOfRange,
      priceSpreadPoor: priceSpreadPoor(price.min, price.max),
      historicalDeviation: histDeviation,
      aiRequestedReview: !!ai?.requiresAdminReview,
      unsafeOutput: !!sanitised?.unsafe,
      humanRequested: !!opts.humanRequested || conv.humanRequested,
      providerFailed: result.failed,
      malformed: result.malformed,
    });
    const rw = responseWindow(cfg.severity, finalSeverity, now);
    const imageAnalysis = attachments.length === 0
      ? { status: 'NOT_PROVIDED', notice: null, notes: [] as string[] }
      : provider.supportsImages && sentIds.length
        ? { status: ai?.imageFindings.status ?? 'UNAVAILABLE', notice: null, notes: ai?.imageFindings.notes ?? [] }
        : { status: 'UNAVAILABLE', notice: AI_IMAGE_UNAVAILABLE_NOTICE, notes: [] as string[] };

    const fallbackSummary = `Customer report: ${(messages.find((m) => m.role === 'CUSTOMER')?.body ?? '').replace(/\s+/g, ' ').slice(0, 240)}`;
    const assessment: NewAssessment = {
      conversationId,
      source: ai ? 'AI' : 'FALLBACK',
      provider: provider.name,
      model: provider.model,
      promptVersion: PROMPT_VERSION,
      settingsVersion: cfg.settingsVersion,
      severityPolicyVersion: cfg.severityVersion,
      pricingPolicyVersion: cfg.pricingVersion,
      isSimulation: provider.simulation,
      summary: ai?.summary || fallbackSummary,
      serviceCategory: category.code,
      serviceCategoryLabel: category.label,
      rawCategory: ai?.serviceCategory ?? null,
      observations: ai?.observations ?? [],
      clarifyingQuestions: needsInfo && decision.outcome === 'NEEDS_INFORMATION' ? ai!.clarifyingQuestions : [],
      aiSeverity: ai?.severity ?? null,
      ruleSeverityFloor: floor,
      finalSeverity,
      severityReason: [
        ai?.severityReason,
        activeTriggers.length ? `Safety rules: ${activeTriggers.map((t) => t.label).join(', ')} (minimum severity ${floor}).` : null,
        !ai ? `Severity from the deterministic rules and the ${category.label.toLowerCase()} default.` : null,
      ].filter(Boolean).join(' ').slice(0, 600),
      safetyTriggers: safety.triggers,
      safetyFlags: ai?.safetyFlags ?? [],
      aiConfidence: ai?.confidence ?? null,
      finalConfidence: confidence,
      outcome: decision.outcome,
      requiresAdminReview: decision.requiresAdminReview,
      escalationReasons: decision.reasons,
      aiInputs: ai ? { labourHours: ai.estimatedLabourHours, pricingFactors: ai.suggestedPricingFactors, rawCategory: ai.serviceCategory, clarifyingQuestions: ai.clarifyingQuestions } : null,
      estMin: price.min,
      estMax: price.max,
      priceBreakdown: { min: price.min, max: price.max, serviceMin: price.serviceMin, serviceMax: price.serviceMax, labourMin: price.labourMin, labourMax: price.labourMax, materialsMin: price.materialsMin, materialsMax: price.materialsMax, callout: price.callout, urgencyMin: price.urgencyMin, urgencyMax: price.urgencyMax, afterHours: price.afterHours, includesVat: price.includesVat, basis: price.basis, clamped: price.clamped },
      priceClamped: price.clamped,
      historicalReference: hist ? { ...hist, serviceType: category.label } : null,
      adminPriceMin: null,
      adminPriceMax: null,
      responseWindow: rw,
      imageAnalysis,
      retrievedKnowledge: knowledge.map((k) => ({ id: k.id, version: k.version, title: k.title, score: k.score })),
      createdBy: null,
      latencyMs: result.latencyMs,
      errorCode: result.errorCode,
    };

    // 5. Persist atomically with notifications (outbox) and audit.
    return await transactional(async (tx, events) => {
      const r = new PostgresAiRepository(tx);
      const locked = await r.conversation(conversationId, true);
      const assessmentId = await r.insertAssessment(assessment);
      await r.insertProviderCalls(conversationId, assessmentId, result.calls);
      await new PostgresKnowledgeRepository(tx).markRetrieved(knowledge.map((k) => k.id));
      if (sentIds.length) await r.setAttachmentStatus(sentIds, imageUnclear ? 'UNCLEAR' : 'ANALYSED');
      const unsent = attachments.filter((a) => !sentIds.includes(a.id) && a.analysisStatus === 'PENDING').map((a) => a.id);
      await r.setAttachmentStatus(unsent, provider.supportsImages ? 'NOT_SENT' : 'UNAVAILABLE');
      await audit(tx, opts.actor, 'AI_ASSESSMENT_CREATED', 'ai_conversation', conversationId, {
        assessmentId, provider: provider.name, model: provider.model, promptVersion: PROMPT_VERSION, outcome: decision.outcome,
        aiSeverity: assessment.aiSeverity, finalSeverity, aiConfidence: assessment.aiConfidence, finalConfidence: confidence,
        reasons: decision.reasons, knowledge: assessment.retrievedKnowledge.map((k) => `${k.id}@${k.version}`),
        severityPolicyVersion: cfg.severityVersion, pricingPolicyVersion: cfg.pricingVersion,
      });
      // An admin took over (or the customer closed the case) while the AI was working: keep the
      // assessment for the audit trail but do not change what the customer sees.
      if (!locked || locked.status !== 'AI_PROCESSING') return null;

      const msg = assistantMessage(decision.outcome, finalSeverity, cfg, { providerFailed: result.failed || result.malformed, rounds: conv.clarificationRounds, outOfHours: rw.outOfHoursNotice });
      await r.insertMessage({ conversationId, role: 'ASSISTANT', kind: msg.kind, body: msg.body, questions: assessment.clarifyingQuestions, assessmentId });

      const proposalOutcome = decision.outcome === 'PROPOSAL' || decision.outcome === 'PROPOSAL_REVIEW_RECOMMENDED';
      await r.supersedeSentProposals(conversationId);
      if (proposalOutcome) {
        await r.insertProposal({ conversationId, assessmentId, priceMin: price.min, priceMax: price.max, priceSource: 'SYSTEM', severity: finalSeverity, responseWindow: rw, message: null, approvedBy: null });
      }
      const status = decision.outcome === 'NEEDS_INFORMATION' ? 'NEEDS_INFORMATION' : proposalOutcome ? 'AI_ANSWERED' : 'NEEDS_ADMIN_REVIEW';
      await r.updateConversation(conversationId, {
        status,
        clarificationRounds: decision.outcome === 'NEEDS_INFORMATION' ? conv.clarificationRounds + 1 : undefined,
        reviewRequired: decision.requiresAdminReview,
        escalationReasons: decision.reasons,
        currentSeverity: finalSeverity,
        isSimulation: conv.isSimulation || provider.simulation,
        reviewRequestedAt: decision.requiresAdminReview ? 'now' : undefined,
      });
      await notifyAdminsForOutcome(events, locked, decision.outcome, finalSeverity, decision.reasons, assessment.summary);
      events.emit('admins', 'ai.updated', { conversationId });
      events.emit(`user:${conv.userId}`, 'ai.updated', { conversationId });
      return decision.outcome;
    });
  } catch (err) {
    // Unexpected failure (e.g. database): never leave the case stuck "assessing" — hand it to a person.
    logger.error({ err, conversationId }, 'Smart Quote assessment failed');
    await escalateAfterFailure(conversationId, opts.actor).catch((e: unknown) => logger.error({ err: e }, 'Smart Quote fallback escalation failed'));
    return 'ADMIN_REVIEW';
  }
}

async function escalateAfterFailure(conversationId: string, actor: Actor): Promise<void> {
  await transactional(async (tx, events) => {
    const r = new PostgresAiRepository(tx);
    const c = await r.conversation(conversationId, true);
    if (!c || c.status !== 'AI_PROCESSING') return;
    await r.insertMessage({ conversationId, role: 'ASSISTANT', kind: 'ESCALATION_NOTICE', body: AI_PROVIDER_FAILURE_MESSAGE });
    await r.updateConversation(conversationId, { status: 'NEEDS_ADMIN_REVIEW', reviewRequired: true, escalationReasons: ['PROVIDER_UNAVAILABLE'], reviewRequestedAt: 'now' });
    await events.notifyAdmins({ type: 'AI_CASE_REVIEW', title: `Smart Quote: AI unavailable — review ${c.reference}`, body: c.title, data: { aiCaseId: c.id, route: `/admin/ai-case/${c.id}` } });
    await audit(tx, actor, 'AI_ASSESSMENT_FAILED', 'ai_conversation', conversationId);
  });
}

/**
 * Deterministic safety check for a new customer message on a case the team already owns: the AI is not
 * re-run, but a danger signal still raises severity, warns the customer and alerts admins immediately.
 */
export async function applySafetyRulesOnly(tx: Queryable, events: EventCollector, c: ConversationRow, latest: AssessmentRow | null, text: string, actor: Actor): Promise<boolean> {
  const cfg = await loadAiConfig(tx);
  const safety = detectSafetyTriggers(text, cfg.severity.additionalSafetyRules);
  if (!safety.floor || safety.floor <= (c.currentSeverity ?? 0) || safety.floor < 4) return false;
  const r = new PostgresAiRepository(tx);
  const severity = safety.floor;
  const rw = responseWindow(cfg.severity, severity);
  const outcome: AiOutcome = severity === 5 ? 'SAFETY_ESCALATION' : 'ADMIN_REVIEW';
  const reasons: AiEscalationReason[] = severity === 5 ? ['CRITICAL_SAFETY', 'SAFETY_TRIGGER'] : ['HIGH_SEVERITY', 'SAFETY_TRIGGER'];
  const assessmentId = await r.insertAssessment({
    ...(latest ?? {
      conversationId: c.id, provider: 'rules', model: 'deterministic', promptVersion: PROMPT_VERSION, isSimulation: false, summary: c.title,
      serviceCategory: 'OTHER', serviceCategoryLabel: 'Other / unclassified', rawCategory: null, observations: [], clarifyingQuestions: [], aiSeverity: null,
      severityReason: '', safetyFlags: [], aiConfidence: null, finalConfidence: 0, aiInputs: null, estMin: null, estMax: null, priceBreakdown: null,
      priceClamped: false, historicalReference: null, adminPriceMin: null, adminPriceMax: null, imageAnalysis: { status: 'NOT_PROVIDED', notice: null, notes: [] },
      retrievedKnowledge: [], latencyMs: null, errorCode: null, settingsVersion: cfg.settingsVersion, severityPolicyVersion: cfg.severityVersion, pricingPolicyVersion: cfg.pricingVersion,
      safetyTriggers: [], ruleSeverityFloor: null, finalSeverity: severity, outcome, requiresAdminReview: true, escalationReasons: reasons, responseWindow: rw, createdBy: null,
    }),
    conversationId: c.id,
    source: 'FALLBACK',
    ruleSeverityFloor: severity,
    finalSeverity: severity,
    severityReason: `Safety rules on a later customer message: ${safety.triggers.filter((t) => !t.negated).map((t) => t.label).join(', ')}.`,
    safetyTriggers: safety.triggers,
    outcome,
    requiresAdminReview: true,
    escalationReasons: reasons,
    responseWindow: rw,
    createdBy: null,
  });
  await r.supersedeSentProposals(c.id);
  if (severity === 5) await r.insertMessage({ conversationId: c.id, role: 'ASSISTANT', kind: 'SAFETY_WARNING', body: `${AI_SAFETY_MESSAGE} Our team has been alerted and will contact you.`, assessmentId });
  else await r.insertMessage({ conversationId: c.id, role: 'ASSISTANT', kind: 'ESCALATION_NOTICE', body: `${cfg.severity.levels[3]!.customerWording} Keep away from the affected equipment.`, assessmentId });
  await r.updateConversation(c.id, { status: 'NEEDS_ADMIN_REVIEW', currentSeverity: severity, reviewRequired: true, escalationReasons: reasons, reviewRequestedAt: 'now' });
  await notifyAdminsForOutcome(events, c, severity === 5 ? 'SAFETY_ESCALATION' : 'ADMIN_REVIEW', severity, reasons, c.title);
  await audit(tx, actor, 'AI_SAFETY_ESCALATION', 'ai_conversation', c.id, { severity, triggers: safety.triggers.map((t) => t.code) });
  return true;
}
