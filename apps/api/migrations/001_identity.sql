-- 001: Identity, access and security tables (PDF §4.4 Access Control ERD, §6.1)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  varchar(254) NOT NULL,
  password_hash          varchar(100),
  role                   varchar(20) NOT NULL CHECK (role IN ('CUSTOMER','EMPLOYEE','ADMIN_OFFICE','ADMIN_OWNER')),
  status                 varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  staff_number           varchar(20) UNIQUE,
  failed_login_count     integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until           timestamptz,
  last_login_at          timestamptz,
  onboarding_completed_at timestamptz,
  token_version          integer NOT NULL DEFAULT 0,
  anonymised_at          timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));
CREATE INDEX users_role_idx ON users (role);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE SEQUENCE staff_number_seq START 1;

-- External identity providers (Google). A provider subject maps to exactly one HYDRA user.
CREATE TABLE auth_identities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         varchar(20) NOT NULL CHECK (provider IN ('google')),
  provider_subject varchar(255) NOT NULL,
  email            varchar(254),
  email_verified   boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at     timestamptz,
  UNIQUE (provider, provider_subject),
  UNIQUE (user_id, provider)
);

-- Rotating refresh tokens. Only SHA-256 hashes are stored; a family groups rotations for reuse detection.
CREATE TABLE refresh_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id     uuid NOT NULL,
  token_hash    char(64) NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  revoked_reason varchar(40),
  replaced_by   uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  user_agent    varchar(255),
  ip            varchar(64),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

CREATE TABLE password_reset_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);

-- Throttling of login attempts per identifier/IP (brute-force protection, PDF §6.1.4).
CREATE TABLE login_attempts (
  id          bigserial PRIMARY KEY,
  identifier  varchar(254) NOT NULL,
  ip          varchar(64),
  succeeded   boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_identifier_idx ON login_attempts (lower(identifier), created_at DESC);

CREATE TABLE customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  first_name    varchar(80) NOT NULL,
  last_name     varchar(80) NOT NULL,
  phone         varchar(24),
  address       varchar(300),
  marketing_opt_in boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE employees (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  first_name       varchar(80) NOT NULL,
  last_name        varchar(80) NOT NULL,
  phone            varchar(24),
  certification_no varchar(60),
  specialisation   varchar(120),
  hourly_rate      numeric(10,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  tax_rate         numeric(5,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 0.45),
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE admins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  first_name  varchar(80) NOT NULL,
  last_name   varchar(80) NOT NULL,
  phone       varchar(24),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER admins_updated_at BEFORE UPDATE ON admins FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- POPIA consent capture (PDF §6.4.10). Append-only history of consent decisions.
CREATE TABLE consents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  consent_type varchar(40) NOT NULL CHECK (consent_type IN ('PRIVACY_POLICY','MARKETING','MISSED_CALL_MONITORING','LOCATION','CONTACT_ENQUIRY')),
  granted      boolean NOT NULL,
  policy_version varchar(20) NOT NULL DEFAULT '2026-09',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consents_user_idx ON consents (user_id, consent_type);

-- POPIA data-subject requests (access / correction / deletion).
CREATE TABLE data_subject_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type varchar(20) NOT NULL CHECK (request_type IN ('ACCESS','CORRECTION','DELETION')),
  details      varchar(1000),
  status       varchar(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','REJECTED')),
  handled_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  handled_at   timestamptz,
  resolution   varchar(1000),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      varchar(256) NOT NULL UNIQUE,
  platform   varchar(10) NOT NULL CHECK (platform IN ('ios','android','web')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_tokens_user_idx ON push_tokens (user_id);
