/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type {
  AiCaseStatus,
  AiEscalationReason,
  AiMessageKind,
  AiMessageRole,
  AiOutcome,
  AiPriceDto,
  AiPropertyType,
  AiProposalStatus,
  AiQueueTab,
  AiResponseWindowDto,
  AiSafetyTriggerDto,
  JobUrgency,
} from '@hydra/shared';
import type { Queryable } from '../db/pool';
import { likePattern } from '../utils/pagination';

export type PolicyKind = 'SETTINGS' | 'SEVERITY' | 'PRICING';

export interface ConversationRow {
  id: string;
  reference: string;
  customerId: string;
  userId: string;
  title: string;
  status: AiCaseStatus;
  propertyType: AiPropertyType | null;
  siteArea: string | null;
  customerUrgency: JobUrgency | null;
  clarificationRounds: number;
  reviewRequired: boolean;
  humanRequested: boolean;
  escalationReasons: AiEscalationReason[];
  currentSeverity: number | null;
  isSimulation: boolean;
  convertedJobId: string | null;
  convertedJobReference: string | null;
  convertedJobStatus: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  reviewRequestedAt: string | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone: string | null;
}

const CONV_COLS = `
  c.id, c.reference, c.customer_id AS "customerId", c.user_id AS "userId", c.title, c.status, c.property_type AS "propertyType",
  c.site_area AS "siteArea", c.customer_urgency AS "customerUrgency", c.clarification_rounds AS "clarificationRounds",
  c.review_required AS "reviewRequired", c.human_requested AS "humanRequested", c.escalation_reasons AS "escalationReasons",
  c.current_severity AS "currentSeverity", c.is_simulation AS "isSimulation", c.converted_job_id AS "convertedJobId",
  j.reference AS "convertedJobReference", j.status AS "convertedJobStatus", c.accepted_at AS "acceptedAt", c.declined_at AS "declinedAt",
  c.closed_at AS "closedAt", c.close_reason AS "closeReason", c.review_requested_at AS "reviewRequestedAt",
  c.last_activity_at AS "lastActivityAt", c.created_at AS "createdAt", c.updated_at AS "updatedAt",
  cu.first_name AS "customerFirstName", cu.last_name AS "customerLastName", u.email AS "customerEmail", cu.phone AS "customerPhone"`;
const CONV_FROM = `FROM ai_conversations c JOIN customers cu ON cu.id = c.customer_id JOIN users u ON u.id = c.user_id
  LEFT JOIN jobs j ON j.id = c.converted_job_id`;

export interface MessageRow {
  id: string;
  role: AiMessageRole;
  kind: AiMessageKind;
  body: string;
  questions: string[];
  authorUserId: string | null;
  assessmentId: string | null;
  createdAt: string;
}

export interface AttachmentRow {
  id: string;
  fileId: string;
  messageId: string | null;
  analysisStatus: 'PENDING' | 'ANALYSED' | 'UNCLEAR' | 'UNAVAILABLE' | 'NOT_SENT';
  createdAt: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AssessmentRow {
  id: string;
  conversationId: string;
  version: number;
  source: 'AI' | 'ADMIN' | 'FALLBACK';
  provider: string;
  model: string;
  promptVersion: string;
  settingsVersion: number;
  severityPolicyVersion: number;
  pricingPolicyVersion: number;
  isSimulation: boolean;
  summary: string;
  serviceCategory: string;
  serviceCategoryLabel: string;
  rawCategory: string | null;
  observations: string[];
  clarifyingQuestions: string[];
  aiSeverity: number | null;
  ruleSeverityFloor: number | null;
  finalSeverity: number;
  severityReason: string;
  safetyTriggers: (AiSafetyTriggerDto & { negated?: boolean })[];
  safetyFlags: string[];
  aiConfidence: number | null;
  finalConfidence: number;
  outcome: AiOutcome;
  requiresAdminReview: boolean;
  escalationReasons: AiEscalationReason[];
  aiInputs: { labourHours: { min: number; max: number } | null; pricingFactors: string[]; rawCategory: string | null; clarifyingQuestions: string[] } | null;
  estMin: number | null;
  estMax: number | null;
  priceBreakdown: AiPriceDto | null;
  priceClamped: boolean;
  historicalReference: { sampleSize: number; median: number; p25: number; p75: number; serviceType: string } | null;
  adminPriceMin: number | null;
  adminPriceMax: number | null;
  responseWindow: AiResponseWindowDto;
  imageAnalysis: { status: string; notice: string | null; notes: string[] };
  retrievedKnowledge: { id: string; version: number; title: string; score: number }[];
  createdBy: string | null;
  createdByName: string | null;
  latencyMs: number | null;
  errorCode: string | null;
  createdAt: string;
}

export type NewAssessment = Omit<AssessmentRow, 'id' | 'version' | 'createdAt' | 'createdByName'>;

const ASSESS_COLS = `
  s.id, s.conversation_id AS "conversationId", s.version, s.source, s.provider, s.model, s.prompt_version AS "promptVersion",
  s.settings_version AS "settingsVersion", s.severity_policy_version AS "severityPolicyVersion", s.pricing_policy_version AS "pricingPolicyVersion",
  s.is_simulation AS "isSimulation", s.summary, s.service_category AS "serviceCategory", s.service_category_label AS "serviceCategoryLabel",
  s.raw_category AS "rawCategory", s.observations, s.clarifying_questions AS "clarifyingQuestions", s.ai_severity AS "aiSeverity",
  s.rule_severity_floor AS "ruleSeverityFloor", s.final_severity AS "finalSeverity", s.severity_reason AS "severityReason",
  s.safety_triggers AS "safetyTriggers", s.safety_flags AS "safetyFlags", s.ai_confidence AS "aiConfidence", s.final_confidence AS "finalConfidence",
  s.outcome, s.requires_admin_review AS "requiresAdminReview", s.escalation_reasons AS "escalationReasons", s.ai_inputs AS "aiInputs",
  s.est_min AS "estMin", s.est_max AS "estMax", s.price_breakdown AS "priceBreakdown", s.price_clamped AS "priceClamped",
  s.historical_reference AS "historicalReference", s.admin_price_min AS "adminPriceMin", s.admin_price_max AS "adminPriceMax",
  s.response_window AS "responseWindow", s.image_analysis AS "imageAnalysis", s.retrieved_knowledge AS "retrievedKnowledge",
  s.created_by AS "createdBy", NULLIF(TRIM(COALESCE(a.first_name,'') || ' ' || COALESCE(a.last_name,'')), '') AS "createdByName",
  s.latency_ms AS "latencyMs", s.error_code AS "errorCode", s.created_at AS "createdAt"`;
const ASSESS_FROM = 'FROM ai_assessments s LEFT JOIN admins a ON a.user_id = s.created_by';

export interface ProposalRow {
  id: string;
  conversationId: string;
  assessmentId: string;
  status: AiProposalStatus;
  priceMin: number;
  priceMax: number;
  priceSource: 'SYSTEM' | 'ADMIN';
  severity: number;
  responseWindow: AiResponseWindowDto;
  message: string | null;
  approvedBy: string | null;
  sentAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  jobId: string | null;
  jobReference: string | null;
}

const PROPOSAL_COLS = `p.id, p.conversation_id AS "conversationId", p.assessment_id AS "assessmentId", p.status, p.price_min AS "priceMin",
  p.price_max AS "priceMax", p.price_source AS "priceSource", p.severity, p.response_window AS "responseWindow", p.message,
  p.approved_by AS "approvedBy", p.sent_at AS "sentAt", p.accepted_at AS "acceptedAt", p.declined_at AS "declinedAt",
  p.decline_reason AS "declineReason", p.job_id AS "jobId", j.reference AS "jobReference"`;

export interface ProviderCallLog {
  provider: string;
  model: string;
  operation: string;
  promptVersion: string;
  status: 'OK' | 'TIMEOUT' | 'RATE_LIMITED' | 'ERROR' | 'MALFORMED' | 'REPAIRED' | 'UNAVAILABLE';
  attempt: number;
  latencyMs: number;
  inputChars: number;
  imageCount: number;
  errorMessage: string | null;
}

export interface CaseListFilter {
  tab: AiQueueTab;
  severity?: number;
  search?: string;
  limit: number;
  offset: number;
}

const TAB_WHERE: Record<AiQueueTab, string> = {
  NEEDS_REVIEW: `(c.status = 'NEEDS_ADMIN_REVIEW' OR (c.status = 'AI_ANSWERED' AND c.review_required) OR (c.status = 'CUSTOMER_ACCEPTED' AND c.converted_job_id IS NULL))`,
  URGENT: `(c.current_severity >= 4 AND c.status NOT IN ('CLOSED','CONVERTED_TO_JOB'))`,
  WAITING_CUSTOMER: `c.status = 'NEEDS_INFORMATION'`,
  RESPONDED: `(c.status IN ('ADMIN_RESPONDED','PROPOSAL_SENT') OR (c.status = 'AI_ANSWERED' AND NOT c.review_required))`,
  ACCEPTED: `c.status IN ('CUSTOMER_ACCEPTED','CONVERTED_TO_JOB')`,
  CLOSED: `c.status = 'CLOSED'`,
  ALL: 'true',
};

/** Data access for HYDRA Smart Quote (Repository pattern; services own transactions and rules). */
export class PostgresAiRepository {
  constructor(private readonly db: Queryable) {}

  // ---- Policies -----------------------------------------------------------------------------------
  async activePolicy<T>(kind: PolicyKind): Promise<{ version: number; body: T } | null> {
    const { rows } = await this.db.query<{ version: number; body: T }>('SELECT version, body FROM ai_policies WHERE kind = $1 AND is_active', [kind]);
    return rows[0] ?? null;
  }

  /** Inserts a new immutable version and makes it the active one (serialised per kind). */
  async insertPolicy(kind: PolicyKind, body: unknown, changeNote: string | null, userId: string | null): Promise<number> {
    await this.db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ai_policy:${kind}`]);
    const { rows } = await this.db.query<{ v: number }>('SELECT COALESCE(max(version), 0) + 1 AS v FROM ai_policies WHERE kind = $1', [kind]);
    const version = rows[0]!.v;
    await this.db.query('UPDATE ai_policies SET is_active = false WHERE kind = $1 AND is_active', [kind]);
    await this.db.query(
      'INSERT INTO ai_policies (kind, version, body, is_active, change_note, created_by) VALUES ($1,$2,$3,true,$4,$5)',
      [kind, version, JSON.stringify(body), changeNote, userId],
    );
    return version;
  }

  async policyVersions(kind: PolicyKind) {
    const { rows } = await this.db.query<{ version: number; isActive: boolean; changeNote: string | null; createdByName: string | null; createdAt: string }>(
      `SELECT p.version, p.is_active AS "isActive", p.change_note AS "changeNote",
              NULLIF(TRIM(COALESCE(a.first_name,'') || ' ' || COALESCE(a.last_name,'')), '') AS "createdByName", p.created_at AS "createdAt"
         FROM ai_policies p LEFT JOIN admins a ON a.user_id = p.created_by WHERE p.kind = $1 ORDER BY p.version DESC LIMIT 50`,
      [kind],
    );
    return rows;
  }

  // ---- Conversations ------------------------------------------------------------------------------
  /** Same customer + same opening message within 2 minutes = a double submit; serialised by advisory lock. */
  async findRecentDuplicate(customerId: string, message: string): Promise<string | null> {
    await this.db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ai_start:${customerId}`]);
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT c.id FROM ai_conversations c JOIN ai_messages m ON m.conversation_id = c.id AND m.role = 'CUSTOMER'
        WHERE c.customer_id = $1 AND m.body = $2 AND c.created_at > now() - interval '2 minutes' ORDER BY c.created_at DESC LIMIT 1`,
      [customerId, message],
    );
    return rows[0]?.id ?? null;
  }

  async insertConversation(c: { customerId: string; userId: string; title: string; propertyType: string | null; siteArea: string | null; urgency: string | null; isSimulation: boolean }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO ai_conversations (customer_id, user_id, title, property_type, site_area, customer_urgency, is_simulation)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [c.customerId, c.userId, c.title, c.propertyType, c.siteArea, c.urgency, c.isSimulation],
    );
    return rows[0]!.id;
  }

  async conversation(id: string, forUpdate = false): Promise<ConversationRow | null> {
    const { rows } = await this.db.query<ConversationRow>(`SELECT ${CONV_COLS} ${CONV_FROM} WHERE c.id = $1 ${forUpdate ? 'FOR UPDATE OF c' : ''}`, [id]);
    return rows[0] ?? null;
  }

  async updateConversation(
    id: string,
    p: Partial<{
      status: AiCaseStatus;
      clarificationRounds: number;
      reviewRequired: boolean;
      humanRequested: boolean;
      escalationReasons: AiEscalationReason[];
      currentSeverity: number;
      isSimulation: boolean;
      assignedAdminId: string;
      convertedJobId: string;
      acceptedAt: 'now';
      declinedAt: 'now';
      closedAt: 'now';
      closeReason: string;
      reviewRequestedAt: 'now' | null;
    }>,
  ): Promise<void> {
    const sets: string[] = ['last_activity_at = now()'];
    const params: unknown[] = [id];
    const set = (col: string, v: unknown, cast = '') => {
      params.push(v);
      sets.push(`${col} = $${params.length}${cast}`);
    };
    if (p.status !== undefined) set('status', p.status);
    if (p.clarificationRounds !== undefined) set('clarification_rounds', p.clarificationRounds);
    if (p.reviewRequired !== undefined) set('review_required', p.reviewRequired);
    if (p.humanRequested !== undefined) set('human_requested', p.humanRequested);
    if (p.escalationReasons !== undefined) set('escalation_reasons', JSON.stringify(p.escalationReasons), '::jsonb');
    if (p.currentSeverity !== undefined) set('current_severity', p.currentSeverity);
    if (p.isSimulation !== undefined) set('is_simulation', p.isSimulation);
    if (p.assignedAdminId !== undefined) set('assigned_admin_id', p.assignedAdminId);
    if (p.convertedJobId !== undefined) set('converted_job_id', p.convertedJobId);
    if (p.acceptedAt) sets.push('accepted_at = now()');
    if (p.declinedAt) sets.push('declined_at = now()');
    if (p.closedAt) sets.push('closed_at = now()');
    if (p.closeReason !== undefined) set('close_reason', p.closeReason);
    if (p.reviewRequestedAt === 'now') sets.push('review_requested_at = COALESCE(review_requested_at, now()), ageing_notified_at = NULL');
    if (p.reviewRequestedAt === null) sets.push('review_requested_at = NULL');
    await this.db.query(`UPDATE ai_conversations SET ${sets.join(', ')} WHERE id = $1`, params);
  }

  async listForCustomer(customerId: string, limit: number, offset: number) {
    const total = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM ai_conversations WHERE customer_id = $1', [customerId]);
    const { rows } = await this.db.query<ConversationRow & { proposalStatus: AiProposalStatus | null; proposalMin: number | null; proposalMax: number | null }>(
      `SELECT ${CONV_COLS}, lp.status AS "proposalStatus", lp.price_min AS "proposalMin", lp.price_max AS "proposalMax"
         ${CONV_FROM}
         LEFT JOIN LATERAL (SELECT status, price_min, price_max FROM ai_proposals p WHERE p.conversation_id = c.id AND p.status <> 'SUPERSEDED'
                             ORDER BY p.created_at DESC LIMIT 1) lp ON true
        WHERE c.customer_id = $1 ORDER BY c.last_activity_at DESC LIMIT $2 OFFSET $3`,
      [customerId, limit, offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async listCases(f: CaseListFilter) {
    const where = [TAB_WHERE[f.tab]];
    const params: unknown[] = [];
    if (f.severity) {
      params.push(f.severity);
      where.push(`c.current_severity = $${params.length}`);
    }
    if (f.search) {
      params.push(likePattern(f.search));
      where.push(`(c.reference ILIKE $${params.length} OR c.title ILIKE $${params.length} OR cu.first_name ILIKE $${params.length} OR cu.last_name ILIKE $${params.length})`);
    }
    const w = `WHERE ${where.join(' AND ')}`;
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ai_conversations c JOIN customers cu ON cu.id = c.customer_id ${w}`, params);
    const { rows } = await this.db.query<ConversationRow & { firstMessage: string | null; confidence: number | null; categoryLabel: string | null; estMin: number | null; estMax: number | null; adminMin: number | null; adminMax: number | null; thumbnailKeys: { storageKey: string; originalName: string }[] }>(
      `SELECT ${CONV_COLS},
              (SELECT body FROM ai_messages m WHERE m.conversation_id = c.id AND m.role = 'CUSTOMER' ORDER BY created_at LIMIT 1) AS "firstMessage",
              la.final_confidence AS confidence, la.service_category_label AS "categoryLabel", la.est_min AS "estMin", la.est_max AS "estMax",
              la.admin_price_min AS "adminMin", la.admin_price_max AS "adminMax",
              COALESCE((SELECT json_agg(t) FROM (SELECT f.storage_key AS "storageKey", f.original_name AS "originalName" FROM ai_attachments aa
                         JOIN files f ON f.id = aa.file_id WHERE aa.conversation_id = c.id ORDER BY aa.created_at LIMIT 3) t), '[]'::json) AS "thumbnailKeys"
         ${CONV_FROM}
         LEFT JOIN LATERAL (SELECT * FROM ai_assessments s WHERE s.conversation_id = c.id ORDER BY s.version DESC LIMIT 1) la ON true
         ${w}
        ORDER BY (c.current_severity = 5) DESC, c.human_requested DESC, c.current_severity DESC NULLS LAST, c.last_activity_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async queueCounts() {
    const { rows } = await this.db.query<{ needsReview: number; urgent: number; critical: number; waitingCustomer: number; accepted: number }>(
      `SELECT count(*) FILTER (WHERE ${TAB_WHERE.NEEDS_REVIEW})::int AS "needsReview",
              count(*) FILTER (WHERE ${TAB_WHERE.URGENT})::int AS urgent,
              count(*) FILTER (WHERE c.current_severity = 5 AND c.status NOT IN ('CLOSED','CONVERTED_TO_JOB'))::int AS critical,
              count(*) FILTER (WHERE ${TAB_WHERE.WAITING_CUSTOMER})::int AS "waitingCustomer",
              count(*) FILTER (WHERE c.status = 'CUSTOMER_ACCEPTED' AND c.converted_job_id IS NULL)::int AS accepted
         FROM ai_conversations c`,
    );
    return rows[0]!;
  }

  /** Review cases waiting longer than `hours` that have not been re-notified (ageing reminder). */
  async ageingCases(hours: number) {
    const { rows } = await this.db.query<{ id: string; reference: string; currentSeverity: number | null }>(
      `UPDATE ai_conversations c SET ageing_notified_at = now()
        WHERE ${TAB_WHERE.NEEDS_REVIEW} AND c.ageing_notified_at IS NULL
          AND COALESCE(c.review_requested_at, c.last_activity_at) < now() - make_interval(hours => $1)
        RETURNING c.id, c.reference, c.current_severity AS "currentSeverity"`,
      [hours],
    );
    return rows;
  }

  // ---- Messages & attachments -----------------------------------------------------------------------
  async insertMessage(m: { conversationId: string; role: AiMessageRole; kind: AiMessageKind; body: string; questions?: string[]; authorUserId?: string | null; assessmentId?: string | null }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO ai_messages (conversation_id, role, kind, body, questions, author_user_id, assessment_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [m.conversationId, m.role, m.kind, m.body.slice(0, 4000), JSON.stringify(m.questions ?? []), m.authorUserId ?? null, m.assessmentId ?? null],
    );
    return rows[0]!.id;
  }

  async messages(conversationId: string): Promise<MessageRow[]> {
    const { rows } = await this.db.query<MessageRow>(
      `SELECT id, role, kind, body, questions, author_user_id AS "authorUserId", assessment_id AS "assessmentId", created_at AS "createdAt"
         FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at, id`,
      [conversationId],
    );
    return rows;
  }

  async addAttachments(conversationId: string, messageId: string, fileIds: string[]) {
    for (const fileId of fileIds) {
      await this.db.query('INSERT INTO ai_attachments (conversation_id, message_id, file_id) VALUES ($1,$2,$3)', [conversationId, messageId, fileId]);
    }
  }

  async attachments(conversationId: string): Promise<AttachmentRow[]> {
    const { rows } = await this.db.query<AttachmentRow>(
      `SELECT aa.id, aa.file_id AS "fileId", aa.message_id AS "messageId", aa.analysis_status AS "analysisStatus", aa.created_at AS "createdAt",
              f.storage_key AS "storageKey", f.original_name AS "originalName", f.mime_type AS "mimeType", f.size_bytes AS "sizeBytes"
         FROM ai_attachments aa JOIN files f ON f.id = aa.file_id WHERE aa.conversation_id = $1 ORDER BY aa.created_at, aa.id`,
      [conversationId],
    );
    return rows;
  }

  async attachmentCount(conversationId: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM ai_attachments WHERE conversation_id = $1', [conversationId]);
    return rows[0]?.n ?? 0;
  }

  async setAttachmentStatus(ids: string[], status: AttachmentRow['analysisStatus']) {
    if (ids.length) await this.db.query('UPDATE ai_attachments SET analysis_status = $2 WHERE id = ANY($1::uuid[])', [ids, status]);
  }

  // ---- Assessments ------------------------------------------------------------------------------------
  async insertAssessment(a: NewAssessment): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO ai_assessments (conversation_id, version, source, provider, model, prompt_version, settings_version, severity_policy_version,
          pricing_policy_version, is_simulation, summary, service_category, service_category_label, raw_category, observations, clarifying_questions,
          ai_severity, rule_severity_floor, final_severity, severity_reason, safety_triggers, safety_flags, ai_confidence, final_confidence, outcome,
          requires_admin_review, escalation_reasons, ai_inputs, est_min, est_max, price_breakdown, price_clamped, historical_reference,
          admin_price_min, admin_price_max, response_window, image_analysis, retrieved_knowledge, created_by, latency_ms, error_code)
       VALUES ($1, (SELECT COALESCE(max(version), 0) + 1 FROM ai_assessments WHERE conversation_id = $1), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
               $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40)
       RETURNING id`,
      [
        a.conversationId, a.source, a.provider, a.model, a.promptVersion, a.settingsVersion, a.severityPolicyVersion, a.pricingPolicyVersion,
        a.isSimulation, a.summary.slice(0, 600), a.serviceCategory, a.serviceCategoryLabel, a.rawCategory, JSON.stringify(a.observations),
        JSON.stringify(a.clarifyingQuestions), a.aiSeverity, a.ruleSeverityFloor, a.finalSeverity, a.severityReason.slice(0, 600),
        JSON.stringify(a.safetyTriggers), JSON.stringify(a.safetyFlags), a.aiConfidence, a.finalConfidence, a.outcome, a.requiresAdminReview,
        JSON.stringify(a.escalationReasons), a.aiInputs ? JSON.stringify(a.aiInputs) : null, a.estMin, a.estMax,
        a.priceBreakdown ? JSON.stringify(a.priceBreakdown) : null, a.priceClamped, a.historicalReference ? JSON.stringify(a.historicalReference) : null,
        a.adminPriceMin, a.adminPriceMax, JSON.stringify(a.responseWindow), JSON.stringify(a.imageAnalysis), JSON.stringify(a.retrievedKnowledge),
        a.createdBy, a.latencyMs, a.errorCode,
      ],
    );
    return rows[0]!.id;
  }

  async assessments(conversationId: string): Promise<AssessmentRow[]> {
    const { rows } = await this.db.query<AssessmentRow>(`SELECT ${ASSESS_COLS} ${ASSESS_FROM} WHERE s.conversation_id = $1 ORDER BY s.version DESC`, [conversationId]);
    return rows;
  }

  async latestAssessment(conversationId: string): Promise<AssessmentRow | null> {
    const { rows } = await this.db.query<AssessmentRow>(`SELECT ${ASSESS_COLS} ${ASSESS_FROM} WHERE s.conversation_id = $1 ORDER BY s.version DESC LIMIT 1`, [conversationId]);
    return rows[0] ?? null;
  }

  async assessment(id: string): Promise<AssessmentRow | null> {
    const { rows } = await this.db.query<AssessmentRow>(`SELECT ${ASSESS_COLS} ${ASSESS_FROM} WHERE s.id = $1`, [id]);
    return rows[0] ?? null;
  }

  // ---- Proposals ------------------------------------------------------------------------------------
  async supersedeSentProposals(conversationId: string): Promise<number> {
    const r = await this.db.query(`UPDATE ai_proposals SET status = 'SUPERSEDED' WHERE conversation_id = $1 AND status = 'SENT'`, [conversationId]);
    return r.rowCount ?? 0;
  }

  async insertProposal(p: { conversationId: string; assessmentId: string; priceMin: number; priceMax: number; priceSource: 'SYSTEM' | 'ADMIN'; severity: number; responseWindow: AiResponseWindowDto; message: string | null; approvedBy: string | null }) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO ai_proposals (conversation_id, assessment_id, price_min, price_max, price_source, severity, response_window, message, approved_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [p.conversationId, p.assessmentId, p.priceMin, p.priceMax, p.priceSource, p.severity, JSON.stringify(p.responseWindow), p.message, p.approvedBy],
    );
    return rows[0]!.id;
  }

  /** The latest proposal that has not been superseded (SENT / ACCEPTED / DECLINED / WITHDRAWN). */
  async currentProposal(conversationId: string): Promise<ProposalRow | null> {
    const { rows } = await this.db.query<ProposalRow>(
      `SELECT ${PROPOSAL_COLS} FROM ai_proposals p LEFT JOIN jobs j ON j.id = p.job_id
        WHERE p.conversation_id = $1 AND p.status <> 'SUPERSEDED' ORDER BY p.created_at DESC LIMIT 1`,
      [conversationId],
    );
    return rows[0] ?? null;
  }

  async updateProposal(id: string, p: { status: AiProposalStatus; declineReason?: string | null; jobId?: string | null }) {
    await this.db.query(
      `UPDATE ai_proposals SET status = $2::text,
              accepted_at = CASE WHEN $2::text = 'ACCEPTED' THEN now() ELSE accepted_at END,
              declined_at = CASE WHEN $2::text = 'DECLINED' THEN now() ELSE declined_at END,
              decline_reason = COALESCE($3::text, decline_reason), job_id = COALESCE($4::uuid, job_id)
        WHERE id = $1`,
      [id, p.status, p.declineReason ?? null, p.jobId ?? null],
    );
  }

  async attachJobToAcceptedProposal(conversationId: string, jobId: string) {
    await this.db.query(`UPDATE ai_proposals SET job_id = $2 WHERE conversation_id = $1 AND status = 'ACCEPTED' AND job_id IS NULL`, [conversationId, jobId]);
  }

  // ---- Human-in-the-loop ----------------------------------------------------------------------------
  async insertReview(r: { conversationId: string; assessmentId: string | null; adminUserId: string; action: string; note?: string | null; changes?: Record<string, unknown> | null }) {
    await this.db.query(
      `INSERT INTO ai_admin_reviews (conversation_id, assessment_id, admin_user_id, action, note, changes) VALUES ($1,$2,$3,$4,$5,$6)`,
      [r.conversationId, r.assessmentId, r.adminUserId, r.action, r.note ?? null, r.changes ? JSON.stringify(r.changes) : null],
    );
  }

  async reviews(conversationId: string) {
    const { rows } = await this.db.query<{ id: string; action: string; note: string | null; changes: Record<string, unknown> | null; adminName: string; createdAt: string }>(
      `SELECT r.id, r.action, r.note, r.changes, COALESCE(NULLIF(TRIM(COALESCE(a.first_name,'') || ' ' || COALESCE(a.last_name,'')), ''), 'PSG Electrical team') AS "adminName",
              r.created_at AS "createdAt"
         FROM ai_admin_reviews r LEFT JOIN admins a ON a.user_id = r.admin_user_id WHERE r.conversation_id = $1 ORDER BY r.created_at`,
      [conversationId],
    );
    return rows;
  }

  /** True once a person has engaged with the case — from then on the AI never overrides the team. */
  async hasAdminEngagement(conversationId: string): Promise<boolean> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ai_admin_reviews WHERE conversation_id = $1 AND action IN ('REPLY','REQUEST_INFO','EDIT_ASSESSMENT','APPROVE_AI','SEND_PROPOSAL')`,
      [conversationId],
    );
    return (rows[0]?.n ?? 0) > 0;
  }

  async upsertFeedback(f: { conversationId: string; assessmentId: string | null; source: 'ADMIN' | 'CUSTOMER'; assessmentVerdict?: string; severityVerdict?: string; priceVerdict?: string; helpful?: string; comment?: string | null; userId: string }) {
    await this.db.query(
      `INSERT INTO ai_feedback (conversation_id, assessment_id, source, assessment_verdict, severity_verdict, price_verdict, helpful, comment, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (conversation_id, source) DO UPDATE SET assessment_id = EXCLUDED.assessment_id, assessment_verdict = EXCLUDED.assessment_verdict,
         severity_verdict = EXCLUDED.severity_verdict, price_verdict = EXCLUDED.price_verdict, helpful = EXCLUDED.helpful,
         comment = EXCLUDED.comment, user_id = EXCLUDED.user_id`,
      [f.conversationId, f.assessmentId, f.source, f.assessmentVerdict ?? null, f.severityVerdict ?? null, f.priceVerdict ?? null, f.helpful ?? null, f.comment ?? null, f.userId],
    );
  }

  async feedback(conversationId: string) {
    const { rows } = await this.db.query<{ source: 'ADMIN' | 'CUSTOMER'; assessmentVerdict: string | null; severityVerdict: string | null; priceVerdict: string | null; helpful: string | null; comment: string | null }>(
      `SELECT source, assessment_verdict AS "assessmentVerdict", severity_verdict AS "severityVerdict", price_verdict AS "priceVerdict", helpful, comment
         FROM ai_feedback WHERE conversation_id = $1`,
      [conversationId],
    );
    return rows;
  }

  // ---- AI audit trail ---------------------------------------------------------------------------------
  async insertProviderCalls(conversationId: string, assessmentId: string | null, calls: ProviderCallLog[]) {
    for (const c of calls) {
      await this.db.query(
        `INSERT INTO ai_provider_calls (conversation_id, assessment_id, provider, model, operation, prompt_version, status, attempt, latency_ms, input_chars, image_count, error_message)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [conversationId, assessmentId, c.provider, c.model, c.operation, c.promptVersion, c.status, c.attempt, c.latencyMs, c.inputChars, c.imageCount, c.errorMessage?.slice(0, 300) ?? null],
      );
    }
  }

  async providerCalls(conversationId: string) {
    const { rows } = await this.db.query<{ id: string; provider: string; model: string; operation: string; status: string; latencyMs: number; attempt: number; createdAt: string }>(
      `SELECT id, provider, model, operation, status, latency_ms AS "latencyMs", attempt, created_at AS "createdAt"
         FROM ai_provider_calls WHERE conversation_id = $1 ORDER BY created_at`,
      [conversationId],
    );
    return rows;
  }

  // ---- Pricing inputs ----------------------------------------------------------------------------------
  async unitCosts(skus: string[]): Promise<Map<string, { name: string; unitCost: number }>> {
    if (!skus.length) return new Map();
    const { rows } = await this.db.query<{ sku: string; name: string; unitCost: number }>(
      'SELECT sku, name, unit_cost AS "unitCost" FROM materials WHERE sku = ANY($1::text[]) AND is_archived = false',
      [skus],
    );
    return new Map(rows.map((r) => [r.sku, { name: r.name, unitCost: r.unitCost }]));
  }

  /**
   * Trustworthy historical totals for a category: accepted quotes of completed (inspection-passed)
   * jobs that came from Smart Quote cases of the same canonical category, last 365 days.
   */
  async historicalTotals(category: string): Promise<number[]> {
    const { rows } = await this.db.query<{ total: number }>(
      `SELECT q.total FROM jobs j
         JOIN quotes q ON q.job_id = j.id AND q.status = 'ACCEPTED'
         JOIN ai_conversations c ON c.id = j.ai_conversation_id
         JOIN LATERAL (SELECT service_category FROM ai_assessments s WHERE s.conversation_id = c.id ORDER BY s.version DESC LIMIT 1) la ON true
        WHERE la.service_category = $1 AND j.status IN ('COMPLETED','INVOICED','PARTIALLY_PAID','PAID')
          AND j.completed_at > now() - interval '365 days'`,
      [category],
    );
    return rows.map((r) => r.total);
  }
}
