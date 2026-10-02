-- 002: Public content, service catalogue, jobs and job progress (PDF §4.4 Customer/Website ERD)

CREATE TABLE service_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          varchar(80) NOT NULL UNIQUE,
  name          varchar(120) NOT NULL,
  category      varchar(20) NOT NULL CHECK (category IN ('SOLAR','CABLING','SUBSTATIONS','EMERGENCY','COMPLIANCE','AUTOMATION')),
  description   varchar(1000) NOT NULL,
  base_price    numeric(12,2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  sla_text      varchar(80),
  badge         varchar(40),
  image_key     varchar(60),
  specs         jsonb NOT NULL DEFAULT '[]'::jsonb,
  features      jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_types_active_idx ON service_types (is_active, display_order);
CREATE TRIGGER service_types_updated_at BEFORE UPDATE ON service_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE portfolio_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id uuid REFERENCES service_types(id) ON DELETE SET NULL,
  title           varchar(160) NOT NULL,
  client_name     varchar(160) NOT NULL,
  location        varchar(120) NOT NULL,
  category        varchar(20) NOT NULL CHECK (category IN ('INDUSTRIAL','COMMERCIAL','SOLAR','DATA_FIBRE')),
  description     varchar(2000) NOT NULL,
  image_key       varchar(60),
  completed_date  date NOT NULL,
  featured        boolean NOT NULL DEFAULT false,
  highlights      jsonb NOT NULL DEFAULT '[]'::jsonb,
  spec_badge      varchar(60),
  accreditation   varchar(60),
  is_demo         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_items_category_idx ON portfolio_items (category, completed_date DESC);

CREATE TABLE faqs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question      varchar(300) NOT NULL,
  answer        varchar(2000) NOT NULL,
  category      varchar(40) NOT NULL,
  display_order integer NOT NULL DEFAULT 0
);
CREATE INDEX faqs_category_idx ON faqs (category, display_order);

CREATE TABLE partners (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             varchar(120) NOT NULL,
  category         varchar(30) NOT NULL CHECK (category IN ('EQUIPMENT_OEM','SOLAR_STORAGE','CABLES_CONDUCTORS','COMPLIANCE_AUDITING','ENTERPRISE_CLIENT')),
  established_year integer,
  description      varchar(1000) NOT NULL,
  tags             jsonb NOT NULL DEFAULT '[]'::jsonb,
  certification    varchar(120),
  guarantee        varchar(120),
  logo_key         varchar(60),
  display_order    integer NOT NULL DEFAULT 0,
  is_demo          boolean NOT NULL DEFAULT false
);

CREATE TABLE team_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             varchar(120) NOT NULL,
  title            varchar(120) NOT NULL,
  category         varchar(20) NOT NULL CHECK (category IN ('ENGINEERING','TECHNICIANS','MANAGEMENT','COMPLIANCE')),
  rating           numeric(2,1) CHECK (rating BETWEEN 0 AND 5),
  registration     varchar(60),
  licence          varchar(60),
  skills           jsonb NOT NULL DEFAULT '[]'::jsonb,
  experience_years integer NOT NULL DEFAULT 0,
  projects_count   integer NOT NULL DEFAULT 0,
  lead_project     varchar(160),
  availability     varchar(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (availability IN ('AVAILABLE','ON_SITE','IN_DISPATCH')),
  photo_key        varchar(60),
  display_order    integer NOT NULL DEFAULT 0,
  is_demo          boolean NOT NULL DEFAULT false
);

CREATE TABLE offices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region     varchar(40) NOT NULL,
  name       varchar(120) NOT NULL,
  area       varchar(120) NOT NULL,
  address    varchar(300) NOT NULL,
  phone      varchar(24) NOT NULL,
  email      varchar(254) NOT NULL,
  manager    varchar(120),
  hours      varchar(120) NOT NULL,
  latitude   numeric(9,6),
  longitude  numeric(9,6),
  display_order integer NOT NULL DEFAULT 0
);

CREATE TABLE department_contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          varchar(120) NOT NULL,
  email         varchar(254) NOT NULL,
  phone         varchar(24) NOT NULL,
  sla           varchar(60) NOT NULL,
  icon          varchar(30) NOT NULL,
  display_order integer NOT NULL DEFAULT 0
);

-- Uploaded file metadata. Objects live in Azure Blob (prod) or local disk (dev) under a random key.
CREATE TABLE files (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key    varchar(200) NOT NULL UNIQUE,
  original_name  varchar(200) NOT NULL,
  mime_type      varchar(100) NOT NULL,
  size_bytes     integer NOT NULL CHECK (size_bytes > 0),
  purpose        varchar(30) NOT NULL CHECK (purpose IN ('JOB_PHOTO','INSPECTION_EVIDENCE','COMPLIANCE_DOCUMENT','PROFILE_IMAGE')),
  owner_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  attached       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX files_owner_idx ON files (owner_user_id);
CREATE INDEX files_unattached_idx ON files (created_at) WHERE attached = false;

CREATE SEQUENCE job_reference_seq START 1001;

CREATE TABLE jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference        varchar(20) NOT NULL UNIQUE DEFAULT ('HYD-' || lpad(nextval('job_reference_seq')::text, 6, '0')),
  customer_id      uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  service_type_id  uuid NOT NULL REFERENCES service_types(id) ON DELETE RESTRICT,
  electrician_id   uuid REFERENCES employees(id) ON DELETE RESTRICT,
  status           varchar(20) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
                     'REQUESTED','QUOTED','QUOTE_ACCEPTED','QUOTE_DECLINED','SCHEDULED','IN_PROGRESS',
                     'INSPECTION_PENDING','COMPLETED','INVOICED','PARTIALLY_PAID','PAID','CANCELLED')),
  urgency          varchar(10) NOT NULL DEFAULT 'STANDARD' CHECK (urgency IN ('STANDARD','HIGH','EMERGENCY')),
  source           varchar(20) NOT NULL DEFAULT 'APP' CHECK (source IN ('APP','CONTACT_QUERY','ADMIN','MISSED_CALL')),
  site_address     varchar(300) NOT NULL,
  site_latitude    numeric(9,6),
  site_longitude   numeric(9,6),
  description      varchar(2000) NOT NULL,
  contact_phone    varchar(24),
  preferred_date   date,
  preferred_time_window varchar(10) NOT NULL DEFAULT 'ANY' CHECK (preferred_time_window IN ('MORNING','AFTERNOON','ANY')),
  scheduled_start  timestamptz,
  scheduled_end    timestamptz,
  completed_at     timestamptz,
  cancelled_reason varchar(500),
  materials_cost   numeric(14,2) NOT NULL DEFAULT 0 CHECK (materials_cost >= 0),
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- PDF Fig. 4: electrician_id may be null only before assignment.
  CONSTRAINT jobs_assigned_has_electrician CHECK (
    status IN ('REQUESTED','QUOTED','QUOTE_ACCEPTED','QUOTE_DECLINED','CANCELLED') OR electrician_id IS NOT NULL),
  CONSTRAINT jobs_schedule_order CHECK (scheduled_end IS NULL OR scheduled_start IS NULL OR scheduled_end > scheduled_start)
);
CREATE INDEX jobs_customer_idx ON jobs (customer_id, created_at DESC);
CREATE INDEX jobs_electrician_idx ON jobs (electrician_id, scheduled_start);
CREATE INDEX jobs_status_idx ON jobs (status, created_at DESC);
CREATE INDEX jobs_service_type_idx ON jobs (service_type_id);
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only assignment log (PDF Story 2, Admin ERD JOB_ASSIGNMENT_LOG).
CREATE TABLE job_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  assigned_by  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to  uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  previous_employee_id uuid REFERENCES employees(id) ON DELETE RESTRICT,
  scheduled_start timestamptz NOT NULL,
  scheduled_end   timestamptz NOT NULL,
  notes        varchar(500),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_assignments_job_idx ON job_assignments (job_id, created_at);

CREATE TABLE job_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  from_status varchar(20),
  to_status   varchar(20) NOT NULL,
  event       varchar(30) NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  note        varchar(500),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_status_history_job_idx ON job_status_history (job_id, created_at);

CREATE TABLE job_milestones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  code           varchar(30),
  name           varchar(80) NOT NULL,
  description    varchar(300),
  status         varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','SKIPPED')),
  sequence_order integer NOT NULL,
  planned_date   date,
  completed_at   timestamptz,
  completed_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (job_id, code)
);
CREATE INDEX job_milestones_job_idx ON job_milestones (job_id, sequence_order);

-- Opaque, single-use-per-arrival QR tokens (only SHA-256 hash stored).
CREATE TABLE job_qr_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  token_hash  char(64) NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_qr_tokens_job_idx ON job_qr_tokens (job_id, created_at DESC);

CREATE TABLE job_checkins (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  qr_token_id  uuid REFERENCES job_qr_tokens(id) ON DELETE SET NULL,
  method       varchar(20) NOT NULL CHECK (method IN ('QR','ADMIN_OVERRIDE')),
  latitude     numeric(9,6),
  longitude    numeric(9,6),
  accuracy_m   numeric(10,2),
  status       varchar(10) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','REJECTED')),
  confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reason       varchar(500),
  scanned_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_checkins_qr_has_gps CHECK (method <> 'QR' OR (latitude IS NOT NULL AND longitude IS NOT NULL))
);
-- One confirmed arrival per job prevents duplicate / fraudulent check-ins.
CREATE UNIQUE INDEX job_checkins_one_confirmed_uq ON job_checkins (job_id) WHERE status = 'CONFIRMED';

CREATE TABLE job_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body           varchar(2000) NOT NULL,
  visibility     varchar(10) NOT NULL DEFAULT 'INTERNAL' CHECK (visibility IN ('INTERNAL','CUSTOMER')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_notes_job_idx ON job_notes (job_id, created_at);

CREATE TABLE job_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  file_id     uuid NOT NULL UNIQUE REFERENCES files(id) ON DELETE RESTRICT,
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_attachments_job_idx ON job_attachments (job_id);
