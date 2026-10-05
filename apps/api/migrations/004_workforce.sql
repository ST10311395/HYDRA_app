-- 004: Workforce — schedules, timesheets, leave and payroll (PDF §4.4 Employee & Admin ERDs)

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE employee_schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  job_id      uuid REFERENCES jobs(id) ON DELETE CASCADE,
  leave_request_id uuid,
  event_type  varchar(10) NOT NULL CHECK (event_type IN ('JOB','LEAVE','TRAINING','MEETING','OTHER')),
  title       varchar(120) NOT NULL,
  start_at    timestamptz NOT NULL,
  end_at      timestamptz NOT NULL,
  notes       varchar(500),
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_schedules_order CHECK (end_at > start_at),
  CONSTRAINT employee_schedules_job_link CHECK (event_type <> 'JOB' OR job_id IS NOT NULL)
);
CREATE INDEX employee_schedules_employee_idx ON employee_schedules USING gist (employee_id, tstzrange(start_at, end_at));
CREATE UNIQUE INDEX employee_schedules_job_uq ON employee_schedules (job_id) WHERE event_type = 'JOB';

CREATE TABLE timesheets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  job_id      uuid REFERENCES jobs(id) ON DELETE SET NULL,
  work_date   date NOT NULL,
  clock_in    timestamptz NOT NULL,
  clock_out   timestamptz,
  total_hours numeric(6,2) CHECK (total_hours IS NULL OR (total_hours >= 0 AND total_hours <= 24)),
  status      varchar(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','SUBMITTED','CONFIRMED','REJECTED','PAID')),
  notes       varchar(600),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  payroll_id  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timesheets_clock_order CHECK (clock_out IS NULL OR clock_out >= clock_in),
  CONSTRAINT timesheets_open_consistency CHECK ((status = 'OPEN') = (clock_out IS NULL))
);
-- Impossible state guard: one open shift per employee (spec §9.8).
CREATE UNIQUE INDEX timesheets_one_open_shift_uq ON timesheets (employee_id) WHERE clock_out IS NULL;
CREATE INDEX timesheets_employee_date_idx ON timesheets (employee_id, work_date DESC);
CREATE INDEX timesheets_status_idx ON timesheets (status, work_date);
CREATE TRIGGER timesheets_updated_at BEFORE UPDATE ON timesheets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE leave_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  leave_type    varchar(10) NOT NULL DEFAULT 'ANNUAL' CHECK (leave_type IN ('ANNUAL','SICK','FAMILY','UNPAID','OTHER')),
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  reason        varchar(500) NOT NULL,
  status        varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  approved_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at    timestamptz,
  decision_note varchar(300),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_range CHECK (start_date <= end_date)
);
CREATE INDEX leave_requests_employee_idx ON leave_requests (employee_id, start_date DESC);
CREATE INDEX leave_requests_status_idx ON leave_requests (status);

ALTER TABLE employee_schedules
  ADD CONSTRAINT employee_schedules_leave_fk FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE CASCADE;

CREATE TABLE payrolls (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  total_hours         numeric(8,2) NOT NULL CHECK (total_hours >= 0),
  hourly_rate         numeric(10,2) NOT NULL CHECK (hourly_rate >= 0),
  gross_pay           numeric(14,2) NOT NULL,
  paye                numeric(14,2) NOT NULL DEFAULT 0,
  uif                 numeric(14,2) NOT NULL DEFAULT 0,
  deductions          numeric(14,2) NOT NULL,
  net_pay             numeric(14,2) NOT NULL,
  status              varchar(10) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','FINALISED')),
  processed_by        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by         uuid REFERENCES users(id) ON DELETE RESTRICT,
  processed_date      date NOT NULL DEFAULT CURRENT_DATE,
  approved_at         timestamptz,
  finalised_at        timestamptz,
  corrects_payroll_id uuid REFERENCES payrolls(id) ON DELETE RESTRICT,
  correction_reason   varchar(500),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payrolls_period CHECK (period_start <= period_end),
  CONSTRAINT payrolls_net CHECK (net_pay = gross_pay - deductions)
);
CREATE INDEX payrolls_employee_idx ON payrolls (employee_id, period_start DESC);
CREATE UNIQUE INDEX payrolls_one_regular_per_period_uq ON payrolls (employee_id, period_start, period_end) WHERE corrects_payroll_id IS NULL;

ALTER TABLE timesheets ADD CONSTRAINT timesheets_payroll_fk FOREIGN KEY (payroll_id) REFERENCES payrolls(id) ON DELETE SET NULL;

CREATE TABLE payroll_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id   uuid NOT NULL REFERENCES payrolls(id) ON DELETE CASCADE,
  timesheet_id uuid NOT NULL UNIQUE REFERENCES timesheets(id) ON DELETE RESTRICT,
  hours        numeric(6,2) NOT NULL,
  amount       numeric(14,2) NOT NULL
);

-- Finalised payroll is immutable; corrections are new linked rows (spec §10.9).
CREATE OR REPLACE FUNCTION payrolls_protect_finalised() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Approved or finalised payroll records cannot be deleted' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'FINALISED' THEN
    RAISE EXCEPTION 'Finalised payroll records are immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER payrolls_protect BEFORE UPDATE OR DELETE ON payrolls FOR EACH ROW EXECUTE FUNCTION payrolls_protect_finalised();
