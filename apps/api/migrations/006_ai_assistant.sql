-- 006: HYDRA Smart Quote — AI quotation & triage assistant (docs/AI_ASSISTANT.md)
-- Additive only: no existing data is changed. AI suggestions, system-calculated prices and admin-approved
-- prices are stored separately; every assessment records the policy/prompt versions that produced it.

-- Existing tables: new upload purpose and job source (traceability back to the AI case).
ALTER TABLE files DROP CONSTRAINT files_purpose_check;
ALTER TABLE files ADD CONSTRAINT files_purpose_check
  CHECK (purpose IN ('JOB_PHOTO','INSPECTION_EVIDENCE','COMPLIANCE_DOCUMENT','PROFILE_IMAGE','AI_ASSESSMENT_PHOTO'));

ALTER TABLE jobs DROP CONSTRAINT jobs_source_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_source_check
  CHECK (source IN ('APP','CONTACT_QUERY','ADMIN','MISSED_CALL','AI_ASSESSMENT'));

-- Versioned configuration. Rows are immutable; a change inserts a new version and moves the active flag.
CREATE TABLE ai_policies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        varchar(12) NOT NULL CHECK (kind IN ('SETTINGS','SEVERITY','PRICING')),
  version     integer NOT NULL CHECK (version > 0),
  body        jsonb NOT NULL,
  is_active   boolean NOT NULL DEFAULT false,
  change_note varchar(300),
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);
CREATE UNIQUE INDEX ai_policies_one_active_uq ON ai_policies (kind) WHERE is_active;

CREATE SEQUENCE ai_conversation_seq START 1001;

CREATE TABLE ai_conversations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             varchar(20) NOT NULL UNIQUE DEFAULT ('AIQ-' || lpad(nextval('ai_conversation_seq')::text, 6, '0')),
  customer_id           uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                 varchar(160) NOT NULL,
  status                varchar(20) NOT NULL DEFAULT 'NEW' CHECK (status IN (
                          'NEW','AI_PROCESSING','NEEDS_INFORMATION','AI_ANSWERED','NEEDS_ADMIN_REVIEW','ADMIN_RESPONDED',
                          'PROPOSAL_SENT','CUSTOMER_ACCEPTED','CONVERTED_TO_JOB','CLOSED')),
  property_type         varchar(14) CHECK (property_type IN ('RESIDENTIAL','COMMERCIAL','INDUSTRIAL','AGRICULTURAL')),
  site_area             varchar(120),
  customer_urgency      varchar(10) CHECK (customer_urgency IN ('STANDARD','HIGH','EMERGENCY')),
  clarification_rounds  integer NOT NULL DEFAULT 0 CHECK (clarification_rounds >= 0),
  review_required       boolean NOT NULL DEFAULT false,
  human_requested       boolean NOT NULL DEFAULT false,
  escalation_reasons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_severity      smallint CHECK (current_severity BETWEEN 1 AND 5),
  is_simulation         boolean NOT NULL DEFAULT false,
  assigned_admin_id     uuid REFERENCES admins(id) ON DELETE SET NULL,
  converted_job_id      uuid REFERENCES jobs(id) ON DELETE SET NULL,
  accepted_at           timestamptz,
  declined_at           timestamptz,
  closed_at             timestamptz,
  close_reason          varchar(500),
  review_requested_at   timestamptz,
  ageing_notified_at    timestamptz,
  last_activity_at      timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_conversations_converted CHECK (status <> 'CONVERTED_TO_JOB' OR converted_job_id IS NOT NULL)
);
CREATE INDEX ai_conversations_customer_idx ON ai_conversations (customer_id, created_at DESC);
CREATE INDEX ai_conversations_status_idx ON ai_conversations (status, last_activity_at DESC);
CREATE INDEX ai_conversations_review_idx ON ai_conversations (review_required, current_severity DESC) WHERE status NOT IN ('CLOSED','CONVERTED_TO_JOB');
-- One job per AI case (duplicate conversion / acceptance protection).
CREATE UNIQUE INDEX ai_conversations_job_uq ON ai_conversations (converted_job_id) WHERE converted_job_id IS NOT NULL;
CREATE TRIGGER ai_conversations_updated_at BEFORE UPDATE ON ai_conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE jobs ADD COLUMN ai_conversation_id uuid REFERENCES ai_conversations(id) ON DELETE SET NULL;

CREATE TABLE ai_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            varchar(10) NOT NULL CHECK (role IN ('CUSTOMER','ASSISTANT','ADMIN','SYSTEM')),
  kind            varchar(20) NOT NULL DEFAULT 'TEXT' CHECK (kind IN (
                    'TEXT','CLARIFICATION','ASSESSMENT','SAFETY_WARNING','ESCALATION_NOTICE','ADMIN_REPLY','INFO_REQUEST','PROPOSAL','STATUS')),
  body            varchar(4000) NOT NULL,
  questions       jsonb NOT NULL DEFAULT '[]'::jsonb,
  author_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  assessment_id   uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conversation_idx ON ai_messages (conversation_id, created_at);

CREATE TABLE ai_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  message_id      uuid REFERENCES ai_messages(id) ON DELETE SET NULL,
  file_id         uuid NOT NULL UNIQUE REFERENCES files(id) ON DELETE RESTRICT,
  analysis_status varchar(12) NOT NULL DEFAULT 'PENDING' CHECK (analysis_status IN ('PENDING','ANALYSED','UNCLEAR','UNAVAILABLE','NOT_SENT')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_attachments_conversation_idx ON ai_attachments (conversation_id);

CREATE TABLE ai_assessments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id        uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  version                integer NOT NULL CHECK (version > 0),
  source                 varchar(10) NOT NULL CHECK (source IN ('AI','ADMIN','FALLBACK')),
  provider               varchar(30) NOT NULL,
  model                  varchar(80) NOT NULL,
  prompt_version         varchar(30) NOT NULL,
  settings_version       integer NOT NULL,
  severity_policy_version integer NOT NULL,
  pricing_policy_version integer NOT NULL,
  is_simulation          boolean NOT NULL DEFAULT false,
  summary                varchar(600) NOT NULL,
  service_category       varchar(60) NOT NULL,
  service_category_label varchar(80) NOT NULL,
  raw_category           varchar(60),
  observations           jsonb NOT NULL DEFAULT '[]'::jsonb,
  clarifying_questions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_severity            smallint CHECK (ai_severity BETWEEN 1 AND 5),
  rule_severity_floor    smallint CHECK (rule_severity_floor BETWEEN 1 AND 5),
  final_severity         smallint NOT NULL CHECK (final_severity BETWEEN 1 AND 5),
  severity_reason        varchar(600) NOT NULL DEFAULT '',
  safety_triggers        jsonb NOT NULL DEFAULT '[]'::jsonb,
  safety_flags           jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_confidence          smallint CHECK (ai_confidence BETWEEN 0 AND 100),
  final_confidence       smallint NOT NULL CHECK (final_confidence BETWEEN 0 AND 100),
  outcome                varchar(30) NOT NULL CHECK (outcome IN ('NEEDS_INFORMATION','PROPOSAL','PROPOSAL_REVIEW_RECOMMENDED','ADMIN_REVIEW','SAFETY_ESCALATION')),
  requires_admin_review  boolean NOT NULL,
  escalation_reasons     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- AI-suggested pricing inputs (never shown directly) ...
  ai_inputs              jsonb,
  -- ... system-calculated price (HYDRA pricing engine) ...
  est_min                numeric(14,2) CHECK (est_min >= 0),
  est_max                numeric(14,2) CHECK (est_max >= 0),
  price_breakdown        jsonb,
  price_clamped          boolean NOT NULL DEFAULT false,
  historical_reference   jsonb,
  -- ... and the admin-approved price, kept separately.
  admin_price_min        numeric(14,2) CHECK (admin_price_min > 0),
  admin_price_max        numeric(14,2) CHECK (admin_price_max > 0),
  response_window        jsonb NOT NULL,
  image_analysis         jsonb NOT NULL DEFAULT '{}'::jsonb,
  retrieved_knowledge    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by             uuid REFERENCES users(id) ON DELETE SET NULL,
  latency_ms             integer,
  error_code             varchar(40),
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, version),
  CONSTRAINT ai_assessments_price_order CHECK (est_min IS NULL OR est_max IS NULL OR est_min <= est_max),
  CONSTRAINT ai_assessments_admin_price_order CHECK (admin_price_min IS NULL OR admin_price_max IS NULL OR admin_price_min <= admin_price_max)
);
CREATE INDEX ai_assessments_conversation_idx ON ai_assessments (conversation_id, version DESC);
ALTER TABLE ai_messages ADD CONSTRAINT ai_messages_assessment_fk FOREIGN KEY (assessment_id) REFERENCES ai_assessments(id) ON DELETE SET NULL;

CREATE TABLE ai_proposals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  assessment_id   uuid NOT NULL REFERENCES ai_assessments(id) ON DELETE RESTRICT,
  status          varchar(12) NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT','ACCEPTED','DECLINED','SUPERSEDED','WITHDRAWN')),
  price_min       numeric(14,2) NOT NULL CHECK (price_min > 0),
  price_max       numeric(14,2) NOT NULL CHECK (price_max > 0),
  price_source    varchar(6) NOT NULL CHECK (price_source IN ('SYSTEM','ADMIN')),
  severity        smallint NOT NULL CHECK (severity BETWEEN 1 AND 5),
  response_window jsonb NOT NULL,
  message         varchar(1000),
  approved_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  accepted_at     timestamptz,
  declined_at     timestamptz,
  decline_reason  varchar(500),
  job_id          uuid REFERENCES jobs(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_proposals_price_order CHECK (price_min <= price_max)
);
CREATE INDEX ai_proposals_conversation_idx ON ai_proposals (conversation_id, created_at DESC);
-- Only one live (SENT) and at most one ACCEPTED proposal per case.
CREATE UNIQUE INDEX ai_proposals_one_sent_uq ON ai_proposals (conversation_id) WHERE status = 'SENT';
CREATE UNIQUE INDEX ai_proposals_one_accepted_uq ON ai_proposals (conversation_id) WHERE status = 'ACCEPTED';

-- Human-in-the-loop log (admin edits, replies, approvals) — complements the global audit trail.
CREATE TABLE ai_admin_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  assessment_id   uuid REFERENCES ai_assessments(id) ON DELETE SET NULL,
  admin_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  action          varchar(30) NOT NULL CHECK (action IN (
                    'REPLY','REQUEST_INFO','EDIT_ASSESSMENT','APPROVE_AI','SEND_PROPOSAL','CONVERT','CLOSE','FEEDBACK','KNOWLEDGE_CREATED')),
  note            varchar(2000),
  changes         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_admin_reviews_conversation_idx ON ai_admin_reviews (conversation_id, created_at);

CREATE TABLE ai_feedback (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  assessment_id      uuid REFERENCES ai_assessments(id) ON DELETE SET NULL,
  source             varchar(8) NOT NULL CHECK (source IN ('ADMIN','CUSTOMER')),
  assessment_verdict varchar(20) CHECK (assessment_verdict IN ('CORRECT','PARTIALLY_CORRECT','INCORRECT')),
  severity_verdict   varchar(10) CHECK (severity_verdict IN ('CORRECT','TOO_LOW','TOO_HIGH')),
  price_verdict      varchar(10) CHECK (price_verdict IN ('ACCURATE','TOO_LOW','TOO_HIGH')),
  helpful            varchar(6) CHECK (helpful IN ('YES','PARTLY','NO')),
  comment            varchar(1000),
  user_id            uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, source),
  CONSTRAINT ai_feedback_shape CHECK (
    (source = 'ADMIN' AND assessment_verdict IS NOT NULL AND severity_verdict IS NOT NULL AND price_verdict IS NOT NULL)
    OR (source = 'CUSTOMER' AND helpful IS NOT NULL))
);
CREATE TRIGGER ai_feedback_updated_at BEFORE UPDATE ON ai_feedback FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Approved knowledge (the only thing the assistant "learns" from). Full-text + keyword retrieval today;
-- `embedding` is reserved for a future vector retriever (e.g. pgvector) behind the same interface.
CREATE TABLE ai_knowledge_entries (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                  varchar(160) NOT NULL,
  service_category       varchar(60) NOT NULL,
  problem_summary        varchar(1500) NOT NULL,
  symptoms               jsonb NOT NULL DEFAULT '[]'::jsonb,
  severity               smallint NOT NULL CHECK (severity BETWEEN 1 AND 5),
  pricing_context        varchar(1000),
  recommended_response   varchar(3000) NOT NULL,
  clarifying_questions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  keywords               text[] NOT NULL DEFAULT '{}',
  search_vector          tsvector,
  embedding              jsonb,
  status                 varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','ARCHIVED')),
  active                 boolean NOT NULL DEFAULT false,
  version                integer NOT NULL DEFAULT 1 CHECK (version > 0),
  source_conversation_id uuid REFERENCES ai_conversations(id) ON DELETE SET NULL,
  source_assessment_id   uuid REFERENCES ai_assessments(id) ON DELETE SET NULL,
  created_by             uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by            uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at            timestamptz,
  archived_at            timestamptz,
  times_retrieved        integer NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- Only approved content can ever be active (retrievable).
  CONSTRAINT ai_knowledge_active_requires_approval CHECK (NOT active OR (status = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX ai_knowledge_search_idx ON ai_knowledge_entries USING gin (search_vector);
CREATE INDEX ai_knowledge_keywords_idx ON ai_knowledge_entries USING gin (keywords);
CREATE INDEX ai_knowledge_category_idx ON ai_knowledge_entries (service_category) WHERE active;

CREATE OR REPLACE FUNCTION ai_knowledge_search_refresh() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', array_to_string(NEW.keywords, ' ')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.problem_summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce((SELECT string_agg(x, ' ') FROM jsonb_array_elements_text(NEW.symptoms) x), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.recommended_response, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ai_knowledge_search BEFORE INSERT OR UPDATE ON ai_knowledge_entries FOR EACH ROW EXECUTE FUNCTION ai_knowledge_search_refresh();
CREATE TRIGGER ai_knowledge_updated_at BEFORE UPDATE ON ai_knowledge_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ai_knowledge_revisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    uuid NOT NULL REFERENCES ai_knowledge_entries(id) ON DELETE CASCADE,
  version     integer NOT NULL,
  snapshot    jsonb NOT NULL,
  change_note varchar(300),
  edited_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, version)
);

-- AI audit trail: provider, model, outcome and latency per call. No prompt text, image data or keys.
CREATE TABLE ai_provider_calls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES ai_conversations(id) ON DELETE CASCADE,
  assessment_id   uuid REFERENCES ai_assessments(id) ON DELETE SET NULL,
  provider        varchar(30) NOT NULL,
  model           varchar(80) NOT NULL,
  operation       varchar(30) NOT NULL,
  prompt_version  varchar(30) NOT NULL,
  status          varchar(14) NOT NULL CHECK (status IN ('OK','TIMEOUT','RATE_LIMITED','ERROR','MALFORMED','REPAIRED','UNAVAILABLE')),
  attempt         smallint NOT NULL DEFAULT 1,
  latency_ms      integer NOT NULL DEFAULT 0,
  input_chars     integer NOT NULL DEFAULT 0,
  image_count     smallint NOT NULL DEFAULT 0,
  error_message   varchar(300),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_provider_calls_conversation_idx ON ai_provider_calls (conversation_id, created_at);
CREATE INDEX ai_provider_calls_created_idx ON ai_provider_calls (created_at DESC);

-- Estimate vs actual (AI preliminary estimate → admin quote → final invoice) for jobs that came from AI.
CREATE TABLE ai_estimate_outcomes (
  conversation_id   uuid PRIMARY KEY REFERENCES ai_conversations(id) ON DELETE CASCADE,
  job_id            uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  estimate_min      numeric(14,2) NOT NULL,
  estimate_max      numeric(14,2) NOT NULL,
  quote_total       numeric(14,2),
  invoice_total     numeric(14,2),
  absolute_difference numeric(14,2),
  percent_variance  numeric(8,2),
  computed_at       timestamptz NOT NULL DEFAULT now()
);
