-- 005: Leads & communications, notifications, audit, exports, settings, idempotency

CREATE TABLE contacts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               varchar(120),
  phone              varchar(24),
  email              varchar(254),
  source             varchar(20) NOT NULL CHECK (source IN ('INBOUND_CALL','WHATSAPP','CONTACT_FORM','MANUAL')),
  linked_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX contacts_phone_uq ON contacts (phone) WHERE phone IS NOT NULL;

CREATE SEQUENCE contact_query_seq START 2001;

CREATE TABLE contact_queries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             varchar(20) NOT NULL UNIQUE DEFAULT ('ENQ-' || lpad(nextval('contact_query_seq')::text, 6, '0')),
  name                  varchar(120) NOT NULL,
  email                 varchar(254) NOT NULL,
  phone                 varchar(24) NOT NULL,
  sector                varchar(120),
  urgency               varchar(10) NOT NULL DEFAULT 'STANDARD' CHECK (urgency IN ('STANDARD','HIGH','EMERGENCY')),
  message               varchar(3000) NOT NULL,
  source                varchar(20) NOT NULL DEFAULT 'CONTACT_FORM' CHECK (source IN ('CONTACT_FORM','QUOTE_TOOL','SPECIALIST_REQUEST','COMPONENT_QUOTE')),
  details               jsonb,
  status                varchar(12) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','IN_PROGRESS','CONVERTED','CLOSED')),
  assigned_admin_id     uuid REFERENCES admins(id) ON DELETE SET NULL,
  admin_notes           varchar(2000),
  converted_job_id      uuid REFERENCES jobs(id) ON DELETE SET NULL,
  converted_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  submitted_by_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  submitted_ip          varchar(64),
  submitted_at          timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_queries_conversion CHECK (status <> 'CONVERTED' OR converted_job_id IS NOT NULL)
);
CREATE INDEX contact_queries_status_idx ON contact_queries (status, submitted_at DESC);
CREATE TRIGGER contact_queries_updated_at BEFORE UPDATE ON contact_queries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Source traceability: a job converted from an enquiry references it.
ALTER TABLE jobs ADD COLUMN contact_query_id uuid REFERENCES contact_queries(id) ON DELETE SET NULL;

CREATE TABLE missed_call_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id       uuid NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  call_at          timestamptz NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  status           varchar(16) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','AUTO_REPLIED','REVIEW_REQUIRED','REPLIED','DISMISSED','FAILED')),
  classification   varchar(30),
  suggested_reply  varchar(480),
  source           varchar(16) NOT NULL CHECK (source IN ('DEVICE_MONITOR','MANUAL')),
  device_id        varchar(80),
  reported_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, call_at)
);
CREATE INDEX missed_call_logs_status_idx ON missed_call_logs (status, call_at DESC);

CREATE TABLE ai_message_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  missed_call_id      uuid REFERENCES missed_call_logs(id) ON DELETE CASCADE,
  channel             varchar(10) NOT NULL CHECK (channel IN ('SMS','WHATSAPP')),
  recipient           varchar(24) NOT NULL,
  message_content     varchar(480) NOT NULL,
  delivery_status     varchar(16) NOT NULL DEFAULT 'QUEUED' CHECK (delivery_status IN ('QUEUED','SENT','DELIVERED','FAILED','NOT_CONFIGURED')),
  provider            varchar(20),
  provider_message_id varchar(100),
  error_message       varchar(300),
  approved_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  sent_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_message_logs_missed_call_idx ON ai_message_logs (missed_call_id);
CREATE INDEX ai_message_logs_created_idx ON ai_message_logs (created_at DESC);

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       varchar(30) NOT NULL,
  title      varchar(120) NOT NULL,
  body       varchar(500) NOT NULL,
  data       jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- Append-only audit trail (PDF §6.7). Updates/deletes are blocked by trigger.
CREATE TABLE audit_logs (
  id            bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role    varchar(20),
  action        varchar(80) NOT NULL,
  entity_type   varchar(60) NOT NULL,
  entity_id     varchar(64),
  request_id    varchar(64),
  ip            varchar(64),
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  -- The only permitted mutation is nulling actor_user_id when a user row is anonymised/removed (FK SET NULL).
  IF TG_OP = 'UPDATE' AND NEW.id = OLD.id AND NEW.action = OLD.action AND NEW.entity_type = OLD.entity_type
     AND NEW.created_at = OLD.created_at AND NEW.actor_user_id IS NULL AND OLD.actor_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

CREATE TABLE data_export_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  export_type   varchar(20) NOT NULL,
  format        varchar(4) NOT NULL CHECK (format IN ('CSV','PDF')),
  filters       jsonb NOT NULL,
  row_count     integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_export_logs_created_idx ON data_export_logs (created_at DESC);

CREATE TABLE app_settings (
  key        varchar(60) PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value) VALUES
  ('missedCallAutomationEnabled', 'false'),
  ('missedCallAutoReplyTemplate', '"Hi{{name}}, you called PSG Electrical & Cables and we missed you. An engineer will call you back shortly. For emergencies call our 24/7 line. Reply STOP to opt out."'),
  ('missedCallDefaultChannel', '"SMS"'),
  ('rewardsRandPerPoint', '10'),
  ('vatRate', '0.15'),
  ('payrollRequirePaidInvoice', 'true'),
  ('invoiceIncludeMaterialVariance', 'false'),
  ('lowStockAlertsEnabled', 'true');

-- Idempotency keys for sensitive retried writes (spec §20).
CREATE TABLE idempotency_keys (
  key            varchar(100) NOT NULL,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route          varchar(120) NOT NULL,
  request_hash   char(64) NOT NULL,
  status_code    integer,
  response_body  jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX idempotency_keys_created_idx ON idempotency_keys (created_at);
