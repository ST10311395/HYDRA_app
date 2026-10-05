import type { AiKnowledgeEntryDto, AiKnowledgeStatus, KnowledgeEntryInput } from '@hydra/shared';
import type { Queryable } from '../db/pool';
import { extractKeywords } from '../ai/text';
import type { RetrievedKnowledgeForPrompt } from '../ai/providers/types';
import { likePattern } from '../utils/pagination';

const NAME = (alias: string) => `NULLIF(TRIM(COALESCE(${alias}a.first_name, ${alias}e.first_name, '') || ' ' || COALESCE(${alias}a.last_name, ${alias}e.last_name, '')), '')`;

const DTO = `
  SELECT k.id, k.title, k.service_category AS "serviceCategory", k.problem_summary AS "problemSummary", k.symptoms, k.severity,
         k.pricing_context AS "pricingContext", k.recommended_response AS "recommendedResponse",
         k.clarifying_questions AS "clarifyingQuestions", k.keywords, k.status, k.active, k.version,
         k.source_conversation_id AS "sourceConversationId", c.reference AS "sourceReference", k.source_assessment_id AS "sourceAssessmentId",
         ${NAME('c')} AS "createdByName", ${NAME('p')} AS "approvedByName", k.approved_at AS "approvedAt",
         k.times_retrieved AS "timesRetrieved", k.created_at AS "createdAt", k.updated_at AS "updatedAt"
    FROM ai_knowledge_entries k
    LEFT JOIN ai_conversations c ON c.id = k.source_conversation_id
    LEFT JOIN admins ca ON ca.user_id = k.created_by LEFT JOIN employees ce ON ce.user_id = k.created_by
    LEFT JOIN admins pa ON pa.user_id = k.approved_by LEFT JOIN employees pe ON pe.user_id = k.approved_by`;

export interface KnowledgeQuery {
  text: string;
  category: string | null;
  limit: number;
}

/**
 * Retrieval abstraction for approved knowledge (RAG). The PostgreSQL implementation uses full-text
 * search + keyword overlap + category; a vector implementation (pgvector, an embeddings provider) can
 * replace it without touching the orchestrator. Only APPROVED + active entries are ever returned.
 */
export interface KnowledgeRetriever {
  retrieve(q: KnowledgeQuery): Promise<RetrievedKnowledgeForPrompt[]>;
}

/** Light suffix stripping so "stops"/"stopping"/"stopped" and "pump"/"pumps" meet. */
export function lightStem(word: string): string {
  let w = word.toLowerCase();
  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  if (w.length > 3 && w[w.length - 1] === w[w.length - 2] && !'aeiou'.includes(w[w.length - 1]!)) w = w.slice(0, -1);
  return w;
}

export interface ScorableEntry {
  title: string;
  problemSummary: string;
  symptoms: string[];
  keywords: string[];
  serviceCategory: string;
}

/** 0..1 relevance: term coverage (60%), curated keyword overlap (25%), category agreement (15%). */
export function scoreKnowledge(queryText: string, category: string | null, entry: ScorableEntry): number {
  const terms = [...new Set(extractKeywords(queryText).map(lightStem))].slice(0, 12);
  if (!terms.length) return category && category === entry.serviceCategory ? 0.15 : 0;
  const entryStems = new Set(extractKeywords(`${entry.title} ${entry.problemSummary} ${entry.symptoms.join(' ')} ${entry.keywords.join(' ')}`, 400).map(lightStem));
  const keywordStems = new Set(entry.keywords.flatMap((k) => extractKeywords(k)).map(lightStem));
  const covered = terms.filter((t) => entryStems.has(t)).length;
  const overlap = terms.filter((t) => keywordStems.has(t)).length;
  const coverage = covered / Math.min(terms.length, 8);
  const score = 0.6 * Math.min(1, coverage) + 0.25 * Math.min(1, overlap / 3) + (category && category === entry.serviceCategory ? 0.15 : 0);
  return Math.round(score * 1000) / 1000;
}

export const MIN_RETRIEVAL_SCORE = 0.25;

export class PostgresKnowledgeRetriever implements KnowledgeRetriever {
  constructor(private readonly db: Queryable) {}

  async retrieve(q: KnowledgeQuery): Promise<RetrievedKnowledgeForPrompt[]> {
    if (q.limit <= 0) return [];
    const words = extractKeywords(q.text, 20).map((w) => w.replace(/[^a-z0-9]/g, '')).filter((w) => w.length >= 3);
    const tsquery = words.length ? words.join(' | ') : null;
    const { rows } = await this.db.query<RetrievedKnowledgeForPrompt & { keywords: string[] }>(
      `SELECT id, version, title, service_category AS "serviceCategory", problem_summary AS "problemSummary", symptoms, severity,
              pricing_context AS "pricingContext", recommended_response AS "recommendedResponse",
              clarifying_questions AS "clarifyingQuestions", keywords
         FROM ai_knowledge_entries
        WHERE active AND status = 'APPROVED'
          AND (($1::text IS NOT NULL AND search_vector @@ to_tsquery('english', $1))
               OR keywords && $2::text[]
               OR service_category = $3)
        ORDER BY ($1::text IS NOT NULL AND search_vector @@ to_tsquery('english', $1)) DESC, updated_at DESC
        LIMIT 50`,
      [tsquery, words, q.category],
    );
    return rows
      .map((r) => ({ ...r, score: scoreKnowledge(q.text, q.category, r) }))
      .filter((r) => r.score >= MIN_RETRIEVAL_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, q.limit)
      .map(({ keywords: _k, ...r }) => r);
  }
}

export class PostgresKnowledgeRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: KnowledgeEntryInput & { sourceAssessmentId: string | null; createdBy: string; approve: boolean }): Promise<string> {
    const keywords = [...new Set([...input.keywords.map((k) => k.toLowerCase())])];
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO ai_knowledge_entries (title, service_category, problem_summary, symptoms, severity, pricing_context, recommended_response,
          clarifying_questions, keywords, source_conversation_id, source_assessment_id, created_by, status, active, approved_by, approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::uuid, CASE WHEN $13::boolean THEN 'APPROVED' ELSE 'PENDING' END, $13::boolean,
               CASE WHEN $13::boolean THEN $12::uuid END, CASE WHEN $13::boolean THEN now() END)
       RETURNING id`,
      [input.title, input.serviceCategory.toUpperCase(), input.problemSummary, JSON.stringify(input.symptoms), input.severity, input.pricingContext ?? null,
        input.recommendedResponse, JSON.stringify(input.clarifyingQuestions), keywords, input.sourceConversationId ?? null, input.sourceAssessmentId,
        input.createdBy, input.approve],
    );
    const id = rows[0]!.id;
    await this.snapshot(id, input.createdBy, 'Created');
    return id;
  }

  async get(id: string, forUpdate = false): Promise<AiKnowledgeEntryDto | null> {
    const { rows } = await this.db.query<AiKnowledgeEntryDto>(`${DTO} WHERE k.id = $1 ${forUpdate ? 'FOR UPDATE OF k' : ''}`, [id]);
    return rows[0] ?? null;
  }

  async revisions(id: string) {
    const { rows } = await this.db.query<{ version: number; editedByName: string | null; changeNote: string | null; createdAt: string }>(
      `SELECT r.version, NULLIF(TRIM(COALESCE(a.first_name,'') || ' ' || COALESCE(a.last_name,'')), '') AS "editedByName",
              r.change_note AS "changeNote", r.created_at AS "createdAt"
         FROM ai_knowledge_revisions r LEFT JOIN admins a ON a.user_id = r.edited_by
        WHERE r.entry_id = $1 ORDER BY r.version DESC`,
      [id],
    );
    return rows;
  }

  async list(f: { status?: AiKnowledgeStatus; category?: string; active?: boolean; search?: string; limit: number; offset: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: (n: number) => string, v: unknown) => {
      params.push(v);
      where.push(sql(params.length));
    };
    if (f.status) add((n) => `k.status = $${n}`, f.status);
    else where.push(`k.status <> 'ARCHIVED'`);
    if (f.category) add((n) => `k.service_category = $${n}`, f.category.toUpperCase());
    if (f.active !== undefined) add((n) => `k.active = $${n}`, f.active);
    if (f.search) add((n) => `(k.title ILIKE $${n} OR k.problem_summary ILIKE $${n} OR array_to_string(k.keywords, ' ') ILIKE $${n})`, likePattern(f.search));
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ai_knowledge_entries k ${w}`, params);
    const { rows } = await this.db.query<AiKnowledgeEntryDto>(
      `${DTO} ${w} ORDER BY (k.status = 'PENDING') DESC, k.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    );
    return { items: rows, total: total.rows[0]?.n ?? 0 };
  }

  async update(id: string, patch: Partial<KnowledgeEntryInput>, opts: { userId: string; changeNote: string; keepApproval: boolean }) {
    await this.db.query(
      `UPDATE ai_knowledge_entries SET
          title = COALESCE($2, title), service_category = COALESCE($3, service_category), problem_summary = COALESCE($4, problem_summary),
          symptoms = COALESCE($5::jsonb, symptoms), severity = COALESCE($6, severity), pricing_context = COALESCE($7, pricing_context),
          recommended_response = COALESCE($8, recommended_response), clarifying_questions = COALESCE($9::jsonb, clarifying_questions),
          keywords = COALESCE($10::text[], keywords), version = version + 1,
          status = CASE WHEN $11::boolean OR status = 'ARCHIVED' THEN status ELSE 'PENDING' END,
          active = CASE WHEN $11::boolean THEN active ELSE false END,
          approved_by = CASE WHEN $11::boolean THEN approved_by END, approved_at = CASE WHEN $11::boolean THEN approved_at END
        WHERE id = $1`,
      [id, patch.title ?? null, patch.serviceCategory?.toUpperCase() ?? null, patch.problemSummary ?? null,
        patch.symptoms ? JSON.stringify(patch.symptoms) : null, patch.severity ?? null, patch.pricingContext ?? null,
        patch.recommendedResponse ?? null, patch.clarifyingQuestions ? JSON.stringify(patch.clarifyingQuestions) : null,
        patch.keywords ? patch.keywords.map((k) => k.toLowerCase()) : null, opts.keepApproval],
    );
    await this.snapshot(id, opts.userId, opts.changeNote);
  }

  async approve(id: string, userId: string) {
    await this.db.query(`UPDATE ai_knowledge_entries SET status = 'APPROVED', active = true, approved_by = $2, approved_at = now(), archived_at = NULL WHERE id = $1`, [id, userId]);
  }

  async setActive(id: string, active: boolean) {
    await this.db.query('UPDATE ai_knowledge_entries SET active = $2 WHERE id = $1', [id, active]);
  }

  async archive(id: string) {
    await this.db.query(`UPDATE ai_knowledge_entries SET status = 'ARCHIVED', active = false, archived_at = now() WHERE id = $1`, [id]);
  }

  async delete(id: string) {
    await this.db.query('DELETE FROM ai_knowledge_entries WHERE id = $1', [id]);
  }

  async markRetrieved(ids: string[]) {
    if (ids.length) await this.db.query('UPDATE ai_knowledge_entries SET times_retrieved = times_retrieved + 1 WHERE id = ANY($1::uuid[])', [ids]);
  }

  async forConversation(conversationId: string) {
    const { rows } = await this.db.query<{ id: string; title: string; status: AiKnowledgeStatus }>(
      'SELECT id, title, status FROM ai_knowledge_entries WHERE source_conversation_id = $1 ORDER BY created_at',
      [conversationId],
    );
    return rows;
  }

  private async snapshot(id: string, userId: string, changeNote: string) {
    await this.db.query(
      `INSERT INTO ai_knowledge_revisions (entry_id, version, snapshot, change_note, edited_by)
       SELECT id, version, to_jsonb(k) - 'search_vector' - 'embedding', $2, $3 FROM ai_knowledge_entries k WHERE id = $1`,
      [id, changeNote, userId],
    );
  }
}
