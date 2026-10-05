-- 003: Quotes, materials/inventory, compliance, invoicing, payments, rewards & discounts

CREATE TABLE quotes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  status          varchar(12) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','ACCEPTED','DECLINED','EXPIRED','SUPERSEDED')),
  labour_cost     numeric(14,2) NOT NULL CHECK (labour_cost >= 0),
  materials_cost  numeric(14,2) NOT NULL CHECK (materials_cost >= 0),
  fees            numeric(14,2) NOT NULL DEFAULT 0 CHECK (fees >= 0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  subtotal        numeric(14,2) NOT NULL CHECK (subtotal >= 0),
  vat_rate        numeric(5,4) NOT NULL CHECK (vat_rate >= 0 AND vat_rate < 1),
  vat_amount      numeric(14,2) NOT NULL CHECK (vat_amount >= 0),
  total           numeric(14,2) NOT NULL CHECK (total >= 0),
  valid_until     date NOT NULL,
  terms           varchar(2000),
  notes           varchar(2000),
  created_by      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sent_at         timestamptz,
  responded_at    timestamptz,
  responded_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  decline_reason  varchar(500),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, version)
);
CREATE UNIQUE INDEX quotes_one_accepted_per_job_uq ON quotes (job_id) WHERE status = 'ACCEPTED';
CREATE INDEX quotes_status_idx ON quotes (status, created_at DESC);

CREATE TABLE quote_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind        varchar(10) NOT NULL CHECK (kind IN ('LABOUR','MATERIAL','FEE')),
  description varchar(200) NOT NULL,
  quantity    numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price  numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total  numeric(14,2) NOT NULL CHECK (line_total >= 0),
  sort_order  integer NOT NULL DEFAULT 0
);
CREATE INDEX quote_items_quote_idx ON quote_items (quote_id);

CREATE TABLE materials (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku              varchar(40) NOT NULL UNIQUE,
  name             varchar(120) NOT NULL,
  unit             varchar(20) NOT NULL,
  unit_cost        numeric(12,2) NOT NULL CHECK (unit_cost >= 0),
  stock_level      numeric(12,3) NOT NULL DEFAULT 0,
  reorder_level    numeric(12,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  supplier_name    varchar(120),
  supplier_contact varchar(120),
  is_archived      boolean NOT NULL DEFAULT false,
  low_stock_alerted_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX materials_low_stock_idx ON materials ((stock_level <= reorder_level)) WHERE is_archived = false;
CREATE INDEX materials_name_idx ON materials (lower(name));
CREATE TRIGGER materials_updated_at BEFORE UPDATE ON materials FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE job_materials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  material_id   uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  quantity_used numeric(12,3) NOT NULL CHECK (quantity_used > 0),
  cost_at_time  numeric(12,2) NOT NULL CHECK (cost_at_time >= 0),
  notes         varchar(300),
  logged_by     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_materials_job_idx ON job_materials (job_id);

-- Every stock change is recorded (auditable inventory, spec §10.6).
CREATE TABLE stock_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id     uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  delta           numeric(12,3) NOT NULL CHECK (delta <> 0),
  reason          varchar(12) NOT NULL CHECK (reason IN ('JOB_USAGE','RESTOCK','ADJUSTMENT','OVERRIDE','REVERSAL')),
  stock_after     numeric(12,3) NOT NULL,
  job_material_id uuid REFERENCES job_materials(id) ON DELETE SET NULL,
  actor_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note            varchar(300),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_material_idx ON stock_movements (material_id, created_at DESC);

CREATE TABLE inspection_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  employee_id        uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  inspection_date    date NOT NULL DEFAULT CURRENT_DATE,
  compliance_status  varchar(12) NOT NULL CHECK (compliance_status IN ('PASS','FAIL','CONDITIONAL')),
  certificate_number varchar(60),
  findings           varchar(4000) NOT NULL,
  notes              varchar(2000),
  checklist          jsonb NOT NULL DEFAULT '[]'::jsonb,
  signature_name     varchar(120) NOT NULL,
  document_file_id   uuid REFERENCES files(id) ON DELETE RESTRICT,
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inspection_cert_required CHECK (compliance_status = 'FAIL' OR certificate_number IS NOT NULL)
);
CREATE INDEX inspection_reports_job_idx ON inspection_reports (job_id, submitted_at DESC);
CREATE UNIQUE INDEX inspection_reports_cert_uq ON inspection_reports (certificate_number) WHERE certificate_number IS NOT NULL;

CREATE TABLE inspection_attachments (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  file_id   uuid NOT NULL UNIQUE REFERENCES files(id) ON DELETE RESTRICT
);

CREATE SEQUENCE invoice_number_seq START 5001;

CREATE TABLE invoices (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number               varchar(20) NOT NULL UNIQUE DEFAULT ('INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0')),
  job_id               uuid NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE RESTRICT,
  quote_id             uuid REFERENCES quotes(id) ON DELETE RESTRICT,
  customer_id          uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  status               varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','PARTIALLY_PAID','OVERDUE','PAID','VOID')),
  subtotal             numeric(14,2) NOT NULL CHECK (subtotal >= 0),
  materials_adjustment numeric(14,2) NOT NULL DEFAULT 0,
  discount_total       numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  vat_amount           numeric(14,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  total                numeric(14,2) NOT NULL CHECK (total >= 0),
  amount_paid          numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_due           numeric(14,2) GENERATED ALWAYS AS (total - discount_total - amount_paid) STORED,
  invoice_date         date NOT NULL DEFAULT CURRENT_DATE,
  due_date             date NOT NULL,
  notes                varchar(1000),
  created_by           uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sent_at              timestamptz,
  paid_at              timestamptz,
  last_reminder_at     timestamptz,
  version              integer NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_not_overpaid CHECK (amount_paid + discount_total <= total),
  CONSTRAINT invoices_due_after_issue CHECK (due_date >= invoice_date),
  CONSTRAINT invoices_paid_consistency CHECK (status <> 'PAID' OR amount_paid + discount_total = total)
);
CREATE INDEX invoices_customer_idx ON invoices (customer_id, created_at DESC);
CREATE INDEX invoices_status_idx ON invoices (status, due_date);
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoice_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description varchar(200) NOT NULL,
  quantity    numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price  numeric(14,2) NOT NULL,
  line_total  numeric(14,2) NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0
);
CREATE INDEX invoice_items_invoice_idx ON invoice_items (invoice_id);

-- No card data is ever stored (PDF §6.5.1). Only gateway references.
CREATE TABLE payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id         uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount             numeric(14,2) NOT NULL CHECK (amount > 0),
  currency           char(3) NOT NULL DEFAULT 'ZAR',
  method             varchar(10) NOT NULL DEFAULT 'CARD' CHECK (method IN ('CARD','EFT','CASH','OTHER')),
  provider           varchar(20) NOT NULL,
  provider_reference varchar(120) UNIQUE,
  status             varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCEEDED','FAILED','CANCELLED')),
  checkout_url       varchar(500),
  idempotency_key    varchar(100) UNIQUE,
  initiated_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  failure_reason     varchar(300),
  paid_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_invoice_idx ON payments (invoice_id, created_at DESC);
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Webhook idempotency: each provider event is processed at most once.
CREATE TABLE payment_webhook_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      varchar(20) NOT NULL,
  event_id      varchar(200) NOT NULL,
  event_type    varchar(60) NOT NULL,
  payload_hash  char(64) NOT NULL,
  result        varchar(40) NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE TABLE rewards_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  points_balance  integer NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  lifetime_points integer NOT NULL DEFAULT 0 CHECK (lifetime_points >= 0),
  tier            varchar(10) NOT NULL DEFAULT 'BRONZE' CHECK (tier IN ('BRONZE','SILVER','GOLD','PLATINUM')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER rewards_accounts_updated_at BEFORE UPDATE ON rewards_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE rewards_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE CASCADE,
  type            varchar(8) NOT NULL CHECK (type IN ('EARN','REDEEM','ADJUST')),
  job_id          uuid REFERENCES jobs(id) ON DELETE SET NULL,
  invoice_id      uuid REFERENCES invoices(id) ON DELETE SET NULL,
  points_earned   integer NOT NULL DEFAULT 0 CHECK (points_earned >= 0),
  points_redeemed integer NOT NULL DEFAULT 0 CHECK (points_redeemed >= 0),
  description     varchar(300) NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rewards_transactions_account_idx ON rewards_transactions (account_id, created_at DESC);
-- A paid invoice earns points exactly once.
CREATE UNIQUE INDEX rewards_transactions_earn_once_uq ON rewards_transactions (invoice_id) WHERE type = 'EARN';

CREATE TABLE discounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             varchar(24) NOT NULL UNIQUE,
  description      varchar(300) NOT NULL,
  discount_type    varchar(8) NOT NULL CHECK (discount_type IN ('PERCENT','FIXED')),
  value            numeric(12,2) NOT NULL CHECK (value > 0),
  points_cost      integer NOT NULL DEFAULT 0 CHECK (points_cost >= 0),
  min_spend        numeric(14,2) NOT NULL DEFAULT 0 CHECK (min_spend >= 0),
  valid_from       date NOT NULL,
  valid_until      date NOT NULL,
  active           boolean NOT NULL DEFAULT true,
  max_redemptions  integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discounts_valid_range CHECK (valid_from <= valid_until),
  CONSTRAINT discounts_percent_range CHECK (discount_type <> 'PERCENT' OR value <= 100)
);

CREATE TABLE customer_discounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_id    uuid NOT NULL REFERENCES discounts(id) ON DELETE RESTRICT,
  customer_id    uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  invoice_id     uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount_applied numeric(14,2) NOT NULL CHECK (amount_applied > 0),
  points_spent   integer NOT NULL DEFAULT 0 CHECK (points_spent >= 0),
  applied_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, discount_id)
);
CREATE INDEX customer_discounts_customer_idx ON customer_discounts (customer_id);
