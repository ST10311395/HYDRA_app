# HYDRA Smart Quote — AI Quotation & Triage Assistant

HYDRA Smart Quote lets a customer describe an electrical or solar problem (text + photos) and receive a
**preliminary** assessment: likely service, severity 1–5 with the reason, a price **range**, the target
response window, what else PSG needs to know, and a confidence score. Anything uncertain, unsupported or
potentially dangerous goes to a person in the **AI Review** queue.

It is an **assessment, triage and quotation** assistant. It never gives DIY repair instructions, never
lets AI output alone set a price or lower a safety severity, and never learns from unreviewed content.

```
CUSTOMER QUESTION
 → deterministic safety rules + keyword classification            (no AI needed)
 → retrieve APPROVED knowledge (RAG)
 → AI provider: structured JSON (validated, repaired or rejected)
 → server rules: severity floor, confidence adjustments, pricing engine, escalation decision
 → confident & safe ............ preliminary proposal (customer may accept → REQUESTED job)
 → uncertain / high-risk ....... admin review (AI Review queue)
 → admin resolves → optionally approves the resolution as knowledge
 → future similar cases retrieve that knowledge                 (no model weights change)
```

## 1. Architecture

| Layer | Files |
| --- | --- |
| Shared contract | `packages/shared/src/schemas/ai.ts` — enums, provider-output schema (`aiAnalysisSchema`), request schemas, versioned policy schemas, DTOs, customer wording constants |
| Database | `apps/api/migrations/006_ai_assistant.sql` |
| Deterministic rules | `apps/api/src/ai/engine.ts` (safety, classification, severity, pricing, confidence, decision, response window, history), `ai/text.ts` (phrase matching with negation, redaction, DIY filter), `ai/policies.ts` (defaults, core safety rules, `PROMPT_VERSION`) |
| Provider abstraction | `apps/api/src/ai/providers/` — `types.ts` (`AiProvider`), `mock.ts`, `anthropic.ts`, `openai.ts`, `gemini.ts`, `index.ts` (factory + `NoAiProvider`); `ai/prompt.ts`; `ai/parse.ts` |
| Retrieval | `apps/api/src/repositories/aiKnowledgeRepository.ts` (`KnowledgeRetriever` + PostgreSQL implementation) |
| Data access | `apps/api/src/repositories/aiRepository.ts` |
| Orchestration | `apps/api/src/services/ai/orchestrator.ts` (`runAssessment`, `applySafetyRulesOnly`), `services/ai/config.ts`, `services/ai/dto.ts` |
| Business services | `apps/api/src/services/aiAssistantService.ts` (customer), `services/aiAdminService.ts` (admin, knowledge, settings, analytics, tasks, privacy) |
| HTTP | `apps/api/src/controllers/aiController.ts` (every route via `defineRoute`: auth → role → Zod → OpenAPI → idempotency) |
| Mobile | `apps/mobile/src/api/ai.ts`, `src/features/ai/*`, `src/app/customer/ai/*`, `src/app/admin/ai-*` |

Reused existing HYDRA infrastructure (nothing rebuilt): `defineRoute`, `transactional()` outbox
(notifications → Socket.IO → Expo push after COMMIT), append-only `audit_logs`, `files` + magic-byte upload
validation + signed URLs, `jobs`/`job_attachments`/`job_notes`, `service_types`, `materials` (unit costs),
quotes/invoices (estimate-vs-actual), `app_settings.vatRate`, idempotency keys, scheduler, POPIA export/erasure,
design system, `PhotoPicker`, `QueryFallback`, `OwnerGate`, `AdminList`.

## 2. Customer workflow

Dashboard → **HYDRA Smart Quote** card → *Start assessment* (`/customer/ai/new`).

1. Describe the problem, attach photos (camera / gallery, remove, retry upload), property type, suburb (not the
   full address — collected only on acceptance) and perceived urgency.
2. The enquiry is **saved first**, then assessed. The assistant may ask up to *N* rounds (default 3) of at most
   3 useful questions. Approved knowledge supplies its own admin-written questions.
3. Outcomes:
   - **Preliminary proposal** (confidence ≥ 80, safe, supported): *HYDRA Smart Assessment* card — reported issue,
     service category, severity *n*/5 with reason, target response (policy wording, "subject to technician
     availability"), estimated service range, possible material cost, total range, what it includes, potential
     additional costs, confidence, the estimate notice and disclaimer. Actions: **Accept proposal · Request admin
     review · Add more information · Decline**.
   - **Review recommended** (60–79): the proposal is shown and acceptable, and the team double-checks it.
   - **Team review** (< 60, unsupported, severity ≥ 4, provider failure, …): *"I need a member of our team to
     review this request…"* — no estimate is shown.
   - **Severity 5**: the safety warning (below), no quotation, critical admin alert.
4. **Accept** (site address + "I understand this is preliminary" confirmation) → proposal ACCEPTED → a
   `REQUESTED` job (source `AI_ASSESSMENT`, photos attached, internal note *"Customer accepted AI preliminary
   proposal …"*) → normal quote → schedule → job flow. Nothing is invoiced or marked paid.
5. **My AI assessments** (`/customer/ai`) lists date, title, status, severity, estimate, team-review status,
   accepted/declined and job reference; cases reopen at any time (server-side history).
6. After the converted job is completed: *"Was the AI assessment helpful?"* Yes / Partly / No.

Team replies appear in the conversation labelled **"PSG Electrical team response"** (never as AI output), with an
in-app notification, Expo push where registered, a Socket.IO refresh and 15-second polling while under review.

## 3. Admin workflow (Office Admin and Owner)

**More → Smart Quote (AI) → AI Review** (`/admin/ai-review`) and the dashboard card (severity-5 cases in red).

Tabs: Needs review · Urgent · Waiting customer · Responded · Accepted · Closed. Cards show customer, problem,
thumbnails, service, severity, confidence, estimate, age and the escalation reasons.

Case screen (`/admin/ai-case/[id]`): customer problem and photos, conversation, why it escalated, the assessment
with AI severity → rule floor → final severity, AI vs final confidence, safety rules (including negated
mentions), retrieved knowledge, price calculation (system range, admin range, AI-suggested inputs, historical
reference), AI audit trail (provider, model, prompt and policy versions, every provider call).

Actions — all audited and recorded in `ai_admin_reviews`:

| Action | Effect |
| --- | --- |
| Reply / request information | Message as "PSG Electrical team response"; status `ADMIN_RESPONDED` / `NEEDS_INFORMATION`; customer notified |
| Edit assessment | New assessment version (`source = ADMIN`) — summary, category, severity, admin price range; reason required; lowering below the safety floor is recorded (`belowRuleFloor`) |
| Approve AI response / send proposal | New proposal (supersedes the previous one) with the admin or system price; status `PROPOSAL_SENT`; "ready / adjusted / approved" notification |
| Convert to job | `REQUESTED` job through the job model (idempotent, one job per case) |
| Close | Withdraws an open proposal; customer notified |
| Feedback | Assessment correct/partly/incorrect · severity correct/too low/too high · price accurate/too low/too high (analytics only) |
| Approve as knowledge | Creates a knowledge entry from the resolved case (see §4) |

Once a person has engaged with a case the AI is not re-run on it; customer replies go back to the team — but the
deterministic safety rules still run on every customer message and can raise it to severity 4/5 immediately.

## 4. Learning workflow — approved knowledge only

There is no live self-training and no change to model weights.

1. AI cannot answer → escalates (e.g. `UNSUPPORTED_CATEGORY`, `LOW_CONFIDENCE`).
2. Admin resolves it (reply / edit / proposal). Knowledge cannot be created from an unresolved case.
3. Admin writes the reusable content (title, category, problem summary, symptoms, severity, pricing context,
   approved guidance, follow-up questions, keywords) — never raw customer text or unreviewed AI output.
4. Owner — or office admins when *"Office admins may approve knowledge"* is on — approves it. Otherwise it waits
   as `PENDING`. A DB constraint makes `active` impossible unless `APPROVED` with an approver.
5. Future similar cases retrieve it (top *k*, default 3) and it is passed to the provider as *approved PSG
   knowledge*; the assessment stores `{id, version, title, score}` of every entry used.

**Knowledge management** (`/admin/ai-knowledge`, `/admin/ai-entry/[id]`): search, filter by status, edit (new
version + `ai_knowledge_revisions` snapshot; an edit by someone who may not approve sends it back to `PENDING`),
approve, activate/deactivate, view source case, approver and date. Owner: archive and delete.

### Retrieval (RAG)

`KnowledgeRetriever.retrieve({ text, category, limit })`. The PostgreSQL implementation selects candidates by
full-text search (`search_vector`, weighted title/keywords > summary/symptoms > guidance, maintained by trigger),
keyword-array overlap (GIN) or category, then scores 0–1: 60 % term coverage (light stemming), 25 % curated
keyword overlap, 15 % category agreement; minimum 0.25. Only `APPROVED` + `active` entries are eligible.
Upgrade path: `ai_knowledge_entries.embedding` is reserved; a `PgVectorRetriever` (pgvector + an embeddings
provider) can implement the same interface without touching the orchestrator. pgvector was not introduced now
because the current Azure/embedded PostgreSQL set-up and the expected knowledge volume do not need it.

## 5. Provider abstraction

```ts
interface AiProvider {
  name; model; configured; simulation; supportsImages;
  analyseCase(input: AiCaseInput, signal: AbortSignal): Promise<string>; // raw text only
}
```

Adapters only translate one structured request. Validation, repair, timeouts, retries, safety, pricing and
escalation live in HYDRA code, so swapping providers never changes business behaviour.

| `AI_PROVIDER` | Adapter | Notes |
| --- | --- | --- |
| `mock` | `MockAiProvider` | Deterministic **development simulation**. Labelled "Development AI simulation" everywhere; never claims image analysis ("AI image analysis is unavailable in this development environment."). Refused in production. Test directives: `[mock:timeout]`, `[mock:error]`, `[mock:ratelimit]`, `[mock:malformed]`, `[mock:confident]`, `[mock:unclear-image]`, `[mock:conflict]`, `[mock:review]`. |
| `anthropic` | `AnthropicProvider` (official `@anthropic-ai/sdk`) | Structured output (`output_config.format` JSON schema), base64 images (JPEG/PNG/GIF/WebP), default model `claude-opus-5-5`, server-side refusal fallbacks (`fallbacks: "default"`); SDK retries disabled because HYDRA owns retry policy. |
| `openai` | `OpenAiCompatibleProvider` (`fetch`) | Chat Completions with `json_schema` response format; `AI_BASE_URL` for Azure OpenAI / compatible gateways; `AI_MODEL` required. |
| `gemini` | `GeminiProvider` (official `@google/genai`, Gemini Developer API) | `generateContent` with `responseMimeType: application/json` + `responseJsonSchema`; inline images (JPEG/PNG/WebP/HEIF); `AI_MODEL` required (no default); Gemini's default safety settings kept; a blocked prompt or safety/recitation stop escalates to a person (not retried), `MAX_TOKENS` is retried; SDK retries disabled because HYDRA owns retry policy; the key is sent only in the `x-goog-api-key` header. |
| `none` | `NoAiProvider` | Human-only: every case goes to review (also the owner's *Human review only* mode). Production default when unset. |

Orchestrator: hard timeout per call (`AI_TIMEOUT_MS`), retries for timeouts / rate limits / 5xx
(`AI_MAX_RETRIES`, back-off), every attempt logged to `ai_provider_calls` (status, latency, sizes — no prompt
text, no images, no keys). Parsing (`ai/parse.ts`): JSON → extract the first balanced object from fenced or
chatty output → normalise snake_case keys / scalar-for-array / 0–1 confidence → Zod. Anything still invalid is
rejected (`MALFORMED_AI_RESPONSE`) and goes to a person.

Prompt (`ai/prompt.ts`, versioned by `PROMPT_VERSION`): the system prompt lists the canonical categories with
typical labour, the severity scale from the active policy, the output schema, and absolute rules (no DIY, no
prices, no arrival promises, flag hazards, ≤ 3 useful questions, honest confidence, prefer approved knowledge).

## 6. Safety system

Deterministic and independent of the AI (`detectSafetyTriggers`). Core rules are code-defined and immutable;
the owner can add rules but cannot remove or weaken these:

| Severity floor 5 | Severity floor 4 |
| --- | --- |
| fire / flames · smoke · electric shock / electrocution · exposed live conductors / bare wires · arcing / flashover / explosion · water or flooding near electrics · battery thermal event (smoke, fire, hissing, venting) | sparking · burning smell · severe overheating / melting / scorch marks · swollen, bulging, overheating or leaking battery |

Matching is whole-phrase and clause-aware: a negated mention ("no burning smell") does not raise severity but
is recorded for the admin; negation never crosses a sentence or "but". Multimodal image findings (burn marks,
exposed conductor, arcing, swollen battery …) can also raise the floor. A rule can only **raise** severity.

The AI output filter removes any sentence that reads as a repair / wiring / testing / bypass instruction
(`stripUnsafeSentences`) and escalates the case (`UNSAFE_AI_OUTPUT`). Personal data the model echoes is redacted.

**Severity 5** → status `NEEDS_ADMIN_REVIEW`, no quotation, critical push/in-app alert, and the customer sees:

> This may represent an immediate electrical safety risk. Do not touch damaged electrical equipment. Move away
> from the affected area where appropriate and contact emergency services or PSG Electrical's emergency service
> if immediate assistance is required.

## 7. Severity model and response timing

Versioned, owner-editable severity policy (`ai_policies` kind `SEVERITY`). Defaults:

| Level | Name | Target response | Window | Escalation |
| --- | --- | --- | --- | --- |
| 1 | Low | Standard booking | 3–5 business days | — |
| 2 | Moderate | Priority booking | 1–3 business days | — |
| 3 | High | Priority response | within approximately 24 hours | — |
| 4 | Urgent | Urgent | same-day target where available | mandatory admin review |
| 5 | Critical | Emergency escalation | immediate contact workflow | mandatory admin review + safety warning |

Final severity = max(AI suggestion or category default, safety-rule floor, image floor). Customer wording always
says "target … subject to technician availability" and never promises an arrival. For severity ≥ 3 outside
business hours (Mon–Fri 07:00–17:00, Africa/Johannesburg, configurable) an out-of-hours notice is added. Policy
validation forbids severity 4 without escalation or severity 5 without escalation + admin approval.

## 8. Pricing engine

The AI only proposes **inputs** (labour hours, pricing factors); HYDRA computes the displayed range from the
versioned pricing policy (`ai_policies` kind `PRICING`):

```
labour    = hours (clamped to the category range) × labour rate (× after-hours multiplier)
urgency   = labour × uplift% for the final severity            (defaults 0/0/10/25/25 %)
materials = (category allowance + Σ typical stock SKUs × current materials.unit_cost) × (1 + markup)
call-out  = category call-out (+ after-hours surcharge)
total     = (call-out + labour + urgency + materials) × (1 + VAT from app settings)
          → clamped to [max(category floor, global min), min(category ceiling, global max)] → rounded to R50
```

Categories (canonical, mapped onto the **existing** service types — no duplicate services): Electrical fault
finding, Geyser electrical fault, DB board work, CoC / inspection, Plugs/sockets/switches, Lighting, Electrical
installation, Cabling & reticulation, Inverter, Battery storage, Solar maintenance, Solar upgrade, Solar panels,
Backup power, High-voltage/industrial (human review only), Other (human review only).

Guardrails: AI hours materially outside the category range are clamped and flagged
(`PRICE_INPUTS_OUT_OF_RANGE`); ranges wider than 4× are not presented (`PRICE_CONFIDENCE_POOR`); a historical
reference (accepted quotes of completed AI-originated jobs in the same category, last 365 days, IQR outlier
removal, ≥ 5 samples) is shown to admins and flags deviation beyond the tolerance — it never sets prices.

Stored separately on every assessment: **AI-suggested inputs** (`ai_inputs`), **system-calculated price**
(`est_min/est_max/price_breakdown`) and **admin-approved price** (`admin_price_min/max`). Every estimate shows
*"Preliminary estimate only. Final pricing may change following on-site inspection."* and the disclaimer.

## 9. Confidence and escalation

Server confidence = AI confidence − 15 (unclear images) − 20 (conflicting info) − 10 (AI category disagrees with
keyword classification) − 10 (clamped price inputs) + 5 (matching approved knowledge), bounded 0–100.

| Final confidence | Outcome (when nothing else forces review) |
| --- | --- |
| ≥ proposal threshold (80) | Preliminary proposal |
| ≥ review threshold (60) | Proposal shown, admin review recommended |
| < 60 | No proposal — admin review |

Always admin review: severity ≥ 4 (owner may lower to ≥ 3), safety trigger, provider unavailable, malformed AI
output, unsafe AI output, customer asked for a person, the AI asked for review, policy requires approval (per
level, or "approval for every proposal"). Clarifying questions are allowed first for softer reasons (unsupported
category, unclear images, conflicting information, low confidence) until the round limit
(`MAX_CLARIFICATIONS_REACHED`). Every reason is stored on the assessment and the case and shown to admins.

## 10. Configuration

### Environment

| Variable | Purpose |
| --- | --- |
| `AI_ASSISTANT_ENABLED` | Server kill switch (default `true`) |
| `AI_PROVIDER` | `mock` \| `anthropic` \| `openai` \| `gemini` \| `none` (unset → `mock` in dev/test, `none` in production) |
| `AI_MODEL` | Model name (Anthropic default `claude-opus-5-5`; required for `openai` and `gemini` — HYDRA production uses `gemini-3.6-flash`) |
| `AI_API_KEY` | Provider key — environment / Key Vault only, never in source or the app |
| `AI_BASE_URL` | Optional custom endpoint (Azure OpenAI, Anthropic/Gemini gateway) |
| `AI_TIMEOUT_MS` | Per-call hard timeout (default 25 000) |
| `AI_MAX_RETRIES` | Retries for transient failures (default 1) |

Production start-up refuses `AI_PROVIDER=mock` and a real provider without `AI_API_KEY`.

### Owner settings (Settings → AI Assistant, `/admin/ai-settings`; API `PUT /ai/settings`, `/ai/policies/*`)

Feature on/off, provider mode (configured AI / human review only), model override, max clarification rounds,
proposal and review confidence thresholds, escalation severity, approval for every proposal, knowledge
retrieval count, office knowledge approval, pricing tolerance, max photos per case, review ageing reminder,
severity names / targets / windows / customer wording / escalation and approval flags, additional safety rules,
labour rate, after-hours multiplier, material markup, global min/max, per-category call-out and ceiling.
The API key is shown only as **Configured / Not configured**. Every save is a new immutable version
(`GET /ai/policies/{kind}/versions`); assessments keep the settings, severity, pricing and prompt versions that
produced them. A stored policy that fails validation falls back to the safe defaults (logged).

## 11. Data model (migration 006)

`ai_policies` (versioned config) · `ai_conversations` (case: status, severity, review flags, reasons, job link) ·
`ai_messages` · `ai_attachments` (→ `files`, purpose `AI_ASSESSMENT_PHOTO`) · `ai_assessments` (structured,
versioned, with provider/model/prompt/policy versions, AI vs rule vs final severity, AI vs final confidence,
triggers, reasons, AI inputs, system price, admin price, response window, retrieved knowledge) · `ai_proposals`
(one SENT, one ACCEPTED per case) · `ai_admin_reviews` · `ai_feedback` · `ai_knowledge_entries` +
`ai_knowledge_revisions` · `ai_provider_calls` · `ai_estimate_outcomes`. Existing tables: `files.purpose` and
`jobs.source` gained one value each; `jobs.ai_conversation_id` links a job to its case.

Statuses: `NEW → AI_PROCESSING → NEEDS_INFORMATION | AI_ANSWERED | NEEDS_ADMIN_REVIEW → ADMIN_RESPONDED |
PROPOSAL_SENT → CUSTOMER_ACCEPTED → CONVERTED_TO_JOB`, or `CLOSED`.

## 12. API (all under `/api/v1`, documented in Swagger at `/api/docs`)

| Method & path | Roles |
| --- | --- |
| `GET /ai/status` | any signed-in user |
| `POST /ai/conversations` · `GET /ai/conversations` · `GET /ai/conversations/{id}` | Customer (own) |
| `POST /ai/conversations/{id}/messages` · `/accept` · `/decline` · `/request-review` · `/feedback` | Customer (own) |
| `GET /ai/admin/summary` · `GET /ai/admin/cases` · `GET /ai/admin/cases/{id}` | Office admin, Owner |
| `POST /ai/admin/cases/{id}/reply` · `/assessment` · `/proposal` · `/convert` · `/close` · `/feedback` · `/knowledge` | Office admin, Owner |
| `GET/POST /ai/knowledge` · `GET/PATCH /ai/knowledge/{id}` · `POST /ai/knowledge/{id}/approve` · `/active` | Office admin, Owner (approval per setting) |
| `POST /ai/knowledge/{id}/archive` · `DELETE /ai/knowledge/{id}` | Owner |
| `GET /ai/settings` · `GET /ai/policies/{kind}/versions` · `GET /ai/analytics` | Office admin, Owner |
| `PUT /ai/settings` · `PUT /ai/policies/severity` · `PUT /ai/policies/pricing` | Owner |
| `GET /jobs/{id}/ai-assessment` | whoever can access the job (assigned electrician — no pricing; owning customer; admins) |
| `POST /files` with `purpose=AI_ASSESSMENT_PHOTO` | Customer |

Writes that could be repeated (start, message, accept, decline, request review, reply, proposal, convert, close,
knowledge) are idempotent with the `Idempotency-Key` header; starts are also de-duplicated (same customer +
message within 2 minutes); accept / convert are guarded by row locks and unique indexes (one job per case).

## 13. Notifications

Customer: team reply, information requested, proposal ready / adjusted / approved, job created, case closed.
Admins: low-confidence / review-recommended case, severity 4 (**URGENT**) and severity 5 (**🚨 CRITICAL**,
`AI_CASE_CRITICAL`), AI provider failure, customer asked for a person, customer replied, customer accepted the
proposal, and the *ageing* reminder for unresolved review cases (scheduler every 30 min, threshold configurable,
once per case). All go through the existing outbox: in-app notification, Socket.IO (`ai.updated`) and Expo push
where registered. Without push credentials notifications remain in-app.

## 14. Security & privacy

- Ownership: another customer's case returns **404**; employees cannot list or open AI cases — only the AI
  summary of a job assigned to them, without pricing. Owner-only configuration is enforced by the API and the
  mobile `OwnerGate`.
- Strict request schemas (unknown fields → 422), so status, severity or price cannot be injected.
- Photos: magic-byte type check (JPEG/PNG/WebP/HEIC), 8 MB each, up to 6 per message and a configurable per-case
  limit, random storage keys, private storage with 15-minute signed URLs, only the owner / admins / the
  assigned electrician (after conversion) can fetch them; staff cannot upload AI photos; another user's upload
  cannot be attached. Uploaded files are never executed; unattached uploads are purged after 24 h.
- Provider input minimisation: customer names, emails, phone numbers, ID numbers and street addresses are
  redacted; the site address is never sent; images only go to a provider that supports them (max 4, ≤ 5 MB).
- Audit: `AI_ASSESSMENT_CREATED` (provider, model, prompt version, outcome, AI vs final severity and confidence,
  reasons, knowledge ids@versions, policy versions), every admin action, knowledge lifecycle, settings changes.
  Keys are never logged; the audit scrubber masks secret-like keys.
- POPIA: `GET /profile/data-export` includes the customer's Smart Quote conversations; an approved deletion
  request redacts conversation text and summaries and deletes unlinked photos (storage objects removed after
  commit), keeping non-personal structured data for statistics.
- Rate limit: 12 assessment calls per minute per client on top of the global API limit.

## 15. Analytics (`/admin/ai-analytics`, `GET /ai/analytics`)

Computed from stored data only: enquiries, AI-resolved, escalated, proposals, accepted, converted, AI resolution
/ escalation / acceptance rates, average confidence, cases by severity and service, top escalation reasons,
common problems, unknown / low-confidence questions (knowledge candidates), knowledge added, AI answers
corrected by admin, provider failures, admin and customer feedback tallies, and **estimate vs final quote vs
invoice** (absolute difference and % variance, snapshot in `ai_estimate_outcomes`, refreshed daily). These figures
are informational — nothing changes pricing automatically.

## 16. Testing

| Suite | Coverage |
| --- | --- |
| `apps/api/tests/ai-unit.test.ts` (48) | policies validation, safety triggers incl. negation and owner rules, image floors, severity resolution, classification, pricing (components, clamps, floors/ceilings, after-hours), history/IQR, confidence and every escalation path, response wording and business hours, output validation and repair, DIY filter, redaction, retrieval scoring, mock determinism and image honesty, production config refusal |
| `apps/api/tests/ai.test.ts` (44) | full customer workflow (photo, clarification, assessment, proposal, idempotent accept → job), history, decline, severity 4/5, AI-lowered severity overridden, DIY removal, request a person, round limit, provider timeout / rate limit / malformed fallback, duplicate submits, admin queue / reply / edit / proposal / convert / close / feedback, team-owned safety escalation, **learning** (unknown → escalated → resolved → approved → retrieved; pending/inactive never retrieved; versions; owner-only archive/delete), security (cross-customer, employee, office vs owner config, photo privacy, invalid upload, unsafe fields, photo limit), audit, POPIA export, feature flag, analytics, seed idempotency |
| `apps/mobile/src/__tests__/smart-quote.test.tsx` (20) | home/history, disabled state, new assessment (validation, gallery photo add/remove, idempotent submit), conversation (questions, assessment card, severity, estimate, notices), accept/decline/request review/follow-up, severity 5 warning, team-reply label, admin queue, admin case (escalation reasons, negated triggers, knowledge, reply, approve, edit requires reason), knowledge list, owner settings gate + save, notification routing, electrician job section without price |

Run: `npm test` (all), or `npx vitest run tests/ai` in `apps/api`, `npx jest src/__tests__/smart-quote.test.tsx`
in `apps/mobile`. No AI credentials are needed — tests use the deterministic provider or scripted fakes.

## 17. Manual demo

Prerequisites: `npm run db:start` · `npm run db:migrate` · `npm run db:seed:ai` (existing database, additive) **or**
`npm run db:reset` (fresh demo data, wipes the local dev DB) · `npm run api` · `npm run mobile`.

**Customer** — sign in as `customer@hydra.demo`:

1. Dashboard → *HYDRA Smart Quote* → *Start assessment*.
2. Type `My DB trips whenever I turn my geyser on.` and attach a photo (Gallery or Camera).
3. *Send for assessment* → the assistant (labelled *Development AI simulation*) asks follow-up questions (the
   seeded approved knowledge supplies them).
4. Reply `Only the geyser circuit trips. No burning smell or damage.`
5. The *HYDRA Smart Assessment* card appears: Electrical fault finding · severity 3/5 High · target response
   ~24 h subject to availability · preliminary range · includes · confidence · notices.
6. *Accept proposal* → site address → tick the confirmation → *Confirm and accept* → "Service request HYD-…".
   Open it: the job is `REQUESTED` with your photo; the office sees "Customer accepted AI preliminary proposal".

**Admin** — sign in as `office@hydra.demo` (or `owner@`):

1. More → *AI Review* (or the dashboard card). The seeded smoke case is shown as **CRITICAL**.
2. Open a case: images, conversation, why it escalated, assessment audit and price calculation.
3. Edit severity/price (reason required) → *Send proposal*, or *Approve & send* an AI response.
4. *Reply to customer* — the customer sees it as "PSG Electrical team response" with a notification.
5. *Approve resolution as AI knowledge*.

**Learning** —

1. Customer: `Our pool pump keeps stopping and the timer clicks` → escalated ("needs a member of our team").
2. Admin: open it → reply (resolves it) → *Approve resolution as AI knowledge*: title *Pool pump stops
   intermittently*, category Electrical fault finding, guidance, keywords `pool, pump, timer`, optionally a
   follow-up question.
3. Customer: `The pool pump stops working after a few minutes` → the assistant now recognises it, asks the
   approved question, then gives a proposal. In the admin case view *Retrieved knowledge* lists the entry, and
   *AI Knowledge* shows "used 1×". The model itself is unchanged — only the approved knowledge base grew.

Mock directives for failure demos: add `[mock:timeout]`, `[mock:malformed]` or `[mock:error]` to a message to see
the "saved and sent to our team" fallback.

## 18. Known limitations

- Development uses the **simulation**: it classifies by keywords and approved knowledge and never analyses
  images. Real image understanding requires `AI_PROVIDER=anthropic` (or `openai` / `gemini`) with a key.
- The real provider adapters are implemented and unit-tested at the parsing/validation layer. The Gemini adapter
  has passed live text and image smoke tests against `gemini-3.6-flash`; the Anthropic and OpenAI-compatible
  adapters have not been exercised against a live endpoint in this environment (no credentials).
- Default rates, call-out fees and category ranges are development figures — PSG Electrical must confirm them
  in *AI Assistant settings* before customers rely on estimates.
- Retrieval is lexical (full-text + keywords); semantic/vector retrieval is a documented upgrade path.
- HEIC photos are stored and shown but not sent to providers that do not accept HEIC.
- The response window is a policy target; HYDRA does not yet compute live technician availability for it.
- Per-category editing in the app covers call-out and ceiling; other category fields are edited through the API
  (`PUT /ai/policies/pricing`) or a future fuller editor.
