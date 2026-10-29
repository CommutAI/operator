-- ============================================================
-- CommutAI · Operator-Focused Database Schema
-- Optimized for operator management, workflow, performance tracking, and reporting
-- ============================================================

-- ── 0. Custom Enum Types ──────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE staff_role AS ENUM ('operator', 'supervisor', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bus_status AS ENUM ('active', 'maintenance', 'inactive', 'out_of_service');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE trip_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled', 'delayed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE qr_card_status AS ENUM ('active', 'lost', 'replaced', 'deactivated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE card_type AS ENUM ('regular', 'student', 'senior_citizen', 'pwd');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('issued', 'validated', 'expired', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM ('fare', 'baggage', 'topup', 'card_issuance', 'refund');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE irregularity_type AS ENUM ('double_scan', 'count_mismatch', 'fare_evasion', 'hardware_error', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE shift_status AS ENUM ('scheduled', 'active', 'completed', 'missed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('info', 'warning', 'alert', 'task');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 1. Operator Shifts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operator_shifts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id     UUID          NOT NULL REFERENCES staff_users (id) ON DELETE CASCADE,
  bus_id          UUID          REFERENCES buses (id),
  scheduled_start TIMESTAMPTZ   NOT NULL,
  scheduled_end   TIMESTAMPTZ   NOT NULL,
  actual_start    TIMESTAMPTZ,
  actual_end      TIMESTAMPTZ,
  status          shift_status  NOT NULL DEFAULT 'scheduled',
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_operator_shifts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_operator_shifts_updated_at_trigger ON operator_shifts;
CREATE TRIGGER update_operator_shifts_updated_at_trigger
  BEFORE UPDATE ON operator_shifts
  FOR EACH ROW
  EXECUTE FUNCTION update_operator_shifts_updated_at();

-- ── 2. Operator Performance Metrics ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operator_performance (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id     UUID        NOT NULL REFERENCES staff_users (id) ON DELETE CASCADE,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  trips_completed INTEGER     NOT NULL DEFAULT 0,
  passengers_served INTEGER   NOT NULL DEFAULT 0,
  fares_collected NUMERIC(10,2) NOT NULL DEFAULT 0,
  on_time_rate    NUMERIC(5,2),
  customer_rating NUMERIC(3,2),
  incidents       INTEGER     NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Audit Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id     UUID        REFERENCES staff_users (id),
  action          TEXT        NOT NULL,
  table_name      TEXT        NOT NULL,
  record_id       UUID,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Task Management ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operator_tasks (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT            NOT NULL,
  description     TEXT,
  assigned_to     UUID            NOT NULL REFERENCES staff_users (id) ON DELETE CASCADE,
  assigned_by     UUID            REFERENCES staff_users (id),
  priority        task_priority   NOT NULL DEFAULT 'normal',
  status          task_status     NOT NULL DEFAULT 'pending',
  due_date        TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  trip_id         UUID            REFERENCES trips (id),
  bus_id          UUID            REFERENCES buses (id),
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_operator_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_operator_tasks_updated_at_trigger ON operator_tasks;
CREATE TRIGGER update_operator_tasks_updated_at_trigger
  BEFORE UPDATE ON operator_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_operator_tasks_updated_at();

-- ── 5. Operator Notifications ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operator_notifications (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id     UUID              NOT NULL REFERENCES staff_users (id) ON DELETE CASCADE,
  type            notification_type NOT NULL,
  title           TEXT              NOT NULL,
  message         TEXT              NOT NULL,
  link            TEXT,
  is_read         BOOLEAN           NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  task_id         UUID              REFERENCES operator_tasks (id),
  trip_id         UUID              REFERENCES trips (id),
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ── 6. Performance Reports ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS performance_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type     TEXT        NOT NULL,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  data            JSONB       NOT NULL,
  generated_by    UUID        REFERENCES staff_users (id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. Staff Users (Operators) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_users (
  id              UUID        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name       TEXT        NOT NULL,
  email           TEXT        NOT NULL UNIQUE,
  role            staff_role  NOT NULL DEFAULT 'operator',
  phone           TEXT,
  employee_id     TEXT        UNIQUE,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  assigned_bus_id UUID        REFERENCES buses (id),
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create staff_users row when a new auth user is created
CREATE OR REPLACE FUNCTION handle_new_staff_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO staff_users (id, full_name, email, role, phone, employee_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::staff_role, 'operator'),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE(NEW.raw_user_meta_data->>'employee_id', NULL)
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email     = EXCLUDED.email,
    role      = EXCLUDED.role,
    phone     = EXCLUDED.phone,
    employee_id = EXCLUDED.employee_id,
    updated_at = NOW();
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
  RAISE LOG 'Error creating staff_users record for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_staff_user();

-- Update last_login_at on successful authentication
CREATE OR REPLACE FUNCTION update_last_login()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE staff_users
  SET last_login_at = NOW()
  WHERE id = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_login ON auth.users;
CREATE TRIGGER on_auth_login
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION update_last_login();

-- ── 8. Buses ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buses (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number   TEXT        NOT NULL UNIQUE,
  bus_number     INTEGER     UNIQUE,
  route          TEXT        NOT NULL,
  seat_capacity  INTEGER     NOT NULL DEFAULT 50,
  status         bus_status  NOT NULL DEFAULT 'active',
  assigned_operator_id UUID REFERENCES staff_users (id),
  last_maintenance TIMESTAMPTZ,
  next_maintenance TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_buses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_buses_updated_at_trigger ON buses;
CREATE TRIGGER update_buses_updated_at_trigger
  BEFORE UPDATE ON buses
  FOR EACH ROW
  EXECUTE FUNCTION update_buses_updated_at();

-- Add bus_number column if it doesn't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buses' AND column_name = 'bus_number'
  ) THEN
    ALTER TABLE buses ADD COLUMN bus_number INTEGER UNIQUE;
  END IF;
END $$;

-- ── 9. Trips ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id          UUID        NOT NULL REFERENCES buses (id),
  operator_id     UUID        REFERENCES staff_users (id),
  shift_id        UUID        REFERENCES operator_shifts (id),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  status          trip_status NOT NULL DEFAULT 'in_progress',
  -- GPS tracking columns
  current_lat     FLOAT8,
  current_lng     FLOAT8,
  gps_updated_at  TIMESTAMPTZ,
  -- Performance metrics
  total_passengers INTEGER DEFAULT 0,
  total_fares     NUMERIC(10,2) DEFAULT 0,
  incidents       INTEGER DEFAULT 0,
  notes           TEXT
);

-- ── 10. QR Cards ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_cards (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  card_uid        TEXT           NOT NULL UNIQUE,
  owner_name      TEXT           NOT NULL,
  contact_number  TEXT,
  balance         NUMERIC(10,2)  NOT NULL DEFAULT 0,
  status          qr_card_status NOT NULL DEFAULT 'active',
  card_type       card_type      NOT NULL DEFAULT 'regular',
  purchase_price  NUMERIC(10,2)  NOT NULL DEFAULT 100.00,
  allowed_routes  TEXT[]         DEFAULT '{}',
  passenger_id    UUID,
  issued_by       UUID           REFERENCES staff_users (id),
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Add card_type and purchase_price columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'qr_cards' AND column_name = 'card_type'
  ) THEN
    ALTER TABLE qr_cards ADD COLUMN card_type card_type NOT NULL DEFAULT 'regular';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'qr_cards' AND column_name = 'purchase_price'
  ) THEN
    ALTER TABLE qr_cards ADD COLUMN purchase_price NUMERIC(10,2) NOT NULL DEFAULT 100.00;
  END IF;
END $$;

-- ── 11. Temporary Tickets ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS temporary_tickets (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_uid      TEXT          NOT NULL UNIQUE,
  fare_amount     NUMERIC(10,2) NOT NULL DEFAULT 12,
  status          ticket_status NOT NULL DEFAULT 'issued',
  allowed_routes  TEXT[]        DEFAULT '{}',
  passenger_id    UUID,
  trip_id         UUID          REFERENCES trips (id),
  issued_by       UUID          REFERENCES staff_users (id),
  issued_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  validated_at    TIMESTAMPTZ
);

-- ── 12. Transactions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id          UUID             REFERENCES qr_cards (id),
  temp_ticket_id   UUID             REFERENCES temporary_tickets (id),
  trip_id          UUID             REFERENCES trips (id),
  type             transaction_type NOT NULL,
  amount           NUMERIC(10,2)    NOT NULL,
  channel          TEXT             NOT NULL,
  staff_id         UUID             REFERENCES staff_users (id),
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  -- Baggage-related columns
  baggage_category TEXT,
  baggage_weight   NUMERIC(10,2),
  baggage_fee      NUMERIC(10,2)
);

-- Add baggage columns to existing transactions table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'baggage_category'
  ) THEN
    ALTER TABLE transactions ADD COLUMN baggage_category TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'baggage_weight'
  ) THEN
    ALTER TABLE transactions ADD COLUMN baggage_weight NUMERIC(10,2);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'baggage_fee'
  ) THEN
    ALTER TABLE transactions ADD COLUMN baggage_fee NUMERIC(10,2);
  END IF;
END $$;

-- ── 13. Passenger Counts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS passenger_counts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID        NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  count        INTEGER     NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ai_count     INTEGER,
  source       TEXT        NOT NULL DEFAULT 'manual'
);

-- Add video monitoring columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'passenger_counts' AND column_name = 'ai_count'
  ) THEN
    ALTER TABLE passenger_counts ADD COLUMN ai_count INTEGER;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'passenger_counts' AND column_name = 'source'
  ) THEN
    ALTER TABLE passenger_counts ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
  END IF;
END $$;

-- ── 14. Boarded Passengers ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boarded_passengers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID        NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  passenger_id    UUID,
  card_id         UUID        REFERENCES qr_cards (id),
  temp_ticket_id  UUID        REFERENCES temporary_tickets (id),
  boarded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_boarding_source CHECK (card_id IS NOT NULL OR temp_ticket_id IS NOT NULL)
);

-- ── 15. GPS Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gps_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID        NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  lat          FLOAT8      NOT NULL,
  lng          FLOAT8      NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 16. Fare Irregularities ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fare_irregularities (
  id           UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID               NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  type         irregularity_type  NOT NULL,
  description  TEXT               NOT NULL,
  detected_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  resolved     BOOLEAN            NOT NULL DEFAULT FALSE,
  resolved_by  UUID               REFERENCES staff_users (id),
  resolved_at  TIMESTAMPTZ
);

-- ── 17. Emergency Alerts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emergency_alerts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          UUID        NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  operator_id      UUID        NOT NULL REFERENCES staff_users (id),
  bus_id           UUID        REFERENCES buses (id),
  lat              FLOAT8,
  lng              FLOAT8,
  status           TEXT        NOT NULL DEFAULT 'active',
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at  TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  acknowledged_by  UUID        REFERENCES staff_users (id),
  triggered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location_lat     DECIMAL(10, 8),
  location_lng     DECIMAL(11, 8),
  location_source  TEXT,
  location_accuracy DECIMAL(10, 2)
);

-- Add columns for hardware integration if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'triggered_at'
  ) THEN
    ALTER TABLE emergency_alerts ADD COLUMN triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'acknowledged_by'
  ) THEN
    ALTER TABLE emergency_alerts ADD COLUMN acknowledged_by UUID REFERENCES staff_users (id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'location_lat'
  ) THEN
    ALTER TABLE emergency_alerts ADD COLUMN location_lat DECIMAL(10, 8);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'location_lng'
  ) THEN
    ALTER TABLE emergency_alerts ADD COLUMN location_lng DECIMAL(11, 8);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'location_source'
  ) THEN
    ALTER TABLE emergency_alerts ADD COLUMN location_source TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'location_accuracy'
  ) THEN
    ALTER TABLE emergency_alerts ADD COLUMN location_accuracy DECIMAL(10, 2);
  END IF;
END $$;

-- ── 18. Emergency Contacts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  email       TEXT,
  relationship TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_emergency_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_emergency_contacts_updated_at_trigger ON emergency_contacts;
CREATE TRIGGER update_emergency_contacts_updated_at_trigger
  BEFORE UPDATE ON emergency_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_emergency_contacts_updated_at();

-- ── 19. SMS Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number    TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  sms_type        TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'sent',
  trip_id         UUID        REFERENCES trips (id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 20. GPS Locations ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gps_locations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  latitude         DECIMAL(10, 8) NOT NULL,
  longitude        DECIMAL(11, 8) NOT NULL,
  altitude         DECIMAL(10, 2),
  speed            DECIMAL(10, 2),
  accuracy         DECIMAL(10, 2),
  source           TEXT        NOT NULL,
  trip_id          UUID        REFERENCES trips (id),
  satellite_count  INTEGER,
  fix_quality      INTEGER,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 21. Hardware Status ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hardware_status (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  component   TEXT        NOT NULL,
  status      TEXT        NOT NULL,
  details     JSONB,
  last_check  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 22. Fare Matrix ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fare_matrix (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  route_from              TEXT        NOT NULL,
  route_to                TEXT        NOT NULL,
  km_distance             NUMERIC     NOT NULL,
  regular_fare            NUMERIC     NOT NULL,
  discounted_fare         NUMERIC     NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_route UNIQUE (route_from, route_to)
);

-- ── 22.1. Baggage Fee Matrix ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS baggage_fee_matrix (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category        TEXT        NOT NULL,
  max_weight_kg   NUMERIC     NOT NULL,
  fee             NUMERIC     NOT NULL,
  remarks         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 23. Bus Schedules ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bus_schedules (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id      UUID        NOT NULL REFERENCES buses (id),
  day_number  INTEGER     NOT NULL CHECK (day_number BETWEEN 1 AND 10),
  trip_number INTEGER     NOT NULL CHECK (trip_number BETWEEN 1 AND 10),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_bus_day_trip UNIQUE (bus_id, day_number, trip_number)
);

-- ── 24. Trip Schedules ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_schedules (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_number            INTEGER     NOT NULL CHECK (trip_number BETWEEN 1 AND 10),
  arrival_time_start     TIME        NOT NULL,
  arrival_time_end       TIME        NOT NULL,
  departure_time_start   TIME        NOT NULL,
  departure_time_end     TIME        NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_trip_number UNIQUE (trip_number)
);

-- ── 25. Announcements ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  priority        TEXT        NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'emergency')),
  is_public       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by      UUID        REFERENCES staff_users (id),
  start_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date        TIMESTAMPTZ,
  status          TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 26. Helper Functions ──────────────────────────────────────────────────────
-- Returns the role of the authenticated user
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role::TEXT FROM staff_users WHERE id = auth.uid();
$$;

-- ── 27. Row-Level Security ────────────────────────────────────────────────────
ALTER TABLE staff_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE buses                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_cards              ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporary_tickets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE passenger_counts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE boarded_passengers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE fare_irregularities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_alerts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_locations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_status       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fare_matrix            ENABLE ROW LEVEL SECURITY;
ALTER TABLE baggage_fee_matrix     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_schedules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_schedules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_shifts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_performance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reports   ENABLE ROW LEVEL SECURITY;

-- Staff can view their own profile
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staff_users' AND policyname = 'staff_users_self_select'
  ) THEN
    CREATE POLICY "staff_users_self_select"
      ON staff_users FOR SELECT
      USING (id = auth.uid());
  END IF;
END $$;

-- Staff can update their own profile
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staff_users' AND policyname = 'staff_users_operator_update_self'
  ) THEN
    CREATE POLICY "staff_users_operator_update_self"
      ON staff_users FOR UPDATE
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());
  END IF;
END $$;

-- Authenticated operators can read all buses
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'buses' AND policyname = 'buses_read_all'
  ) THEN
    CREATE POLICY "buses_read_all"
      ON buses FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Operators can read/write all trips
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'trips' AND policyname = 'trips_operator_all'
  ) THEN
    CREATE POLICY "trips_operator_all"
      ON trips FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- QR cards: read/write by authenticated operators
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'qr_cards' AND policyname = 'qr_cards_read_authenticated'
  ) THEN
    CREATE POLICY "qr_cards_read_authenticated"
      ON qr_cards FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'qr_cards' AND policyname = 'qr_cards_delete_authenticated'
  ) THEN
    CREATE POLICY "qr_cards_delete_authenticated"
      ON qr_cards FOR DELETE
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'qr_cards' AND policyname = 'qr_cards_insert_authenticated'
  ) THEN
    CREATE POLICY "qr_cards_insert_authenticated"
      ON qr_cards FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'qr_cards' AND policyname = 'qr_cards_update_authenticated'
  ) THEN
    CREATE POLICY "qr_cards_update_authenticated"
      ON qr_cards FOR UPDATE
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Temporary tickets: full access for authenticated operators
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'temporary_tickets' AND policyname = 'temp_tickets_rw_authenticated'
  ) THEN
    CREATE POLICY "temp_tickets_rw_authenticated"
      ON temporary_tickets FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Transactions: insert + select for authenticated operators
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'transactions_insert_authenticated'
  ) THEN
    CREATE POLICY "transactions_insert_authenticated"
      ON transactions FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'transactions_select_authenticated'
  ) THEN
    CREATE POLICY "transactions_select_authenticated"
      ON transactions FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Passenger counts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'passenger_counts' AND policyname = 'passenger_counts_rw_authenticated'
  ) THEN
    CREATE POLICY "passenger_counts_rw_authenticated"
      ON passenger_counts FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Boarded passengers
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'boarded_passengers' AND policyname = 'boarded_passengers_rw_authenticated'
  ) THEN
    CREATE POLICY "boarded_passengers_rw_authenticated"
      ON boarded_passengers FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- GPS logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gps_logs' AND policyname = 'gps_logs_rw_authenticated'
  ) THEN
    CREATE POLICY "gps_logs_rw_authenticated"
      ON gps_logs FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Fare irregularities
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fare_irregularities' AND policyname = 'fare_irregularities_rw_authenticated'
  ) THEN
    CREATE POLICY "fare_irregularities_rw_authenticated"
      ON fare_irregularities FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Emergency alerts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'emergency_alerts' AND policyname = 'emergency_alerts_rw_authenticated'
  ) THEN
    CREATE POLICY "emergency_alerts_rw_authenticated"
      ON emergency_alerts FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Emergency contacts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'emergency_contacts' AND policyname = 'emergency_contacts_rw_authenticated'
  ) THEN
    CREATE POLICY "emergency_contacts_rw_authenticated"
      ON emergency_contacts FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- SMS logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sms_logs' AND policyname = 'sms_logs_rw_authenticated'
  ) THEN
    CREATE POLICY "sms_logs_rw_authenticated"
      ON sms_logs FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- GPS locations
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gps_locations' AND policyname = 'gps_locations_rw_authenticated'
  ) THEN
    CREATE POLICY "gps_locations_rw_authenticated"
      ON gps_locations FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Hardware status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'hardware_status' AND policyname = 'hardware_status_rw_authenticated'
  ) THEN
    CREATE POLICY "hardware_status_rw_authenticated"
      ON hardware_status FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Fare matrix
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fare_matrix' AND policyname = 'fare_matrix_rw_authenticated'
  ) THEN
    CREATE POLICY "fare_matrix_rw_authenticated"
      ON fare_matrix FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Baggage fee matrix
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baggage_fee_matrix' AND policyname = 'baggage_fee_matrix_rw_authenticated'
  ) THEN
    CREATE POLICY "baggage_fee_matrix_rw_authenticated"
      ON baggage_fee_matrix FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Bus schedules
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bus_schedules' AND policyname = 'bus_schedules_rw_authenticated'
  ) THEN
    CREATE POLICY "bus_schedules_rw_authenticated"
      ON bus_schedules FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Trip schedules
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'trip_schedules' AND policyname = 'trip_schedules_rw_authenticated'
  ) THEN
    CREATE POLICY "trip_schedules_rw_authenticated"
      ON trip_schedules FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Announcements policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'announcements' AND policyname = 'announcements_read_authenticated'
  ) THEN
    CREATE POLICY "announcements_read_authenticated"
      ON announcements FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'announcements' AND policyname = 'announcements_insert_operator'
  ) THEN
    CREATE POLICY "announcements_insert_operator"
      ON announcements FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'announcements' AND policyname = 'announcements_update_operator'
  ) THEN
    CREATE POLICY "announcements_update_operator"
      ON announcements FOR UPDATE
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Operator shifts policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'operator_shifts' AND policyname = 'operator_shifts_self_all'
  ) THEN
    CREATE POLICY "operator_shifts_self_all"
      ON operator_shifts FOR ALL
      USING (operator_id = auth.uid() OR auth.role() = 'authenticated')
      WITH CHECK (operator_id = auth.uid() OR auth.role() = 'authenticated');
  END IF;
END $$;

-- Operator performance policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'operator_performance' AND policyname = 'operator_performance_self_all'
  ) THEN
    CREATE POLICY "operator_performance_self_all"
      ON operator_performance FOR ALL
      USING (operator_id = auth.uid() OR auth.role() = 'authenticated')
      WITH CHECK (operator_id = auth.uid() OR auth.role() = 'authenticated');
  END IF;
END $$;

-- Audit logs policies (read-only for operators, insert for all)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'audit_logs_select_authenticated'
  ) THEN
    CREATE POLICY "audit_logs_select_authenticated"
      ON audit_logs FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'audit_logs_insert_authenticated'
  ) THEN
    CREATE POLICY "audit_logs_insert_authenticated"
      ON audit_logs FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Operator tasks policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'operator_tasks' AND policyname = 'operator_tasks_assigned_all'
  ) THEN
    CREATE POLICY "operator_tasks_assigned_all"
      ON operator_tasks FOR ALL
      USING (assigned_to = auth.uid() OR assigned_by = auth.uid() OR auth.role() = 'authenticated')
      WITH CHECK (assigned_to = auth.uid() OR assigned_by = auth.uid() OR auth.role() = 'authenticated');
  END IF;
END $$;

-- Operator notifications policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'operator_notifications' AND policyname = 'operator_notifications_self_all'
  ) THEN
    CREATE POLICY "operator_notifications_self_all"
      ON operator_notifications FOR ALL
      USING (operator_id = auth.uid())
      WITH CHECK (operator_id = auth.uid());
  END IF;
END $$;

-- Performance reports policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'performance_reports' AND policyname = 'performance_reports_rw_authenticated'
  ) THEN
    CREATE POLICY "performance_reports_rw_authenticated"
      ON performance_reports FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── 28. Indexes for Performance ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trips_bus_status
  ON trips(bus_id, status) WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_qr_cards_uid
  ON qr_cards(card_uid);

CREATE INDEX IF NOT EXISTS idx_temp_tickets_uid
  ON temporary_tickets(ticket_uid);

CREATE INDEX IF NOT EXISTS idx_transactions_trip
  ON transactions(trip_id);

CREATE INDEX IF NOT EXISTS idx_boarded_passengers_trip
  ON boarded_passengers(trip_id);

CREATE INDEX IF NOT EXISTS idx_passenger_counts_trip
  ON passenger_counts(trip_id);

CREATE INDEX IF NOT EXISTS idx_passenger_counts_recorded_at
  ON passenger_counts(recorded_at);

CREATE INDEX IF NOT EXISTS idx_fare_irregularities_trip
  ON fare_irregularities(trip_id);

CREATE INDEX IF NOT EXISTS idx_gps_logs_trip
  ON gps_logs(trip_id);

CREATE INDEX IF NOT EXISTS idx_emergency_alerts_trip
  ON emergency_alerts(trip_id);

CREATE INDEX IF NOT EXISTS idx_emergency_alerts_status
  ON emergency_alerts(status);

CREATE INDEX IF NOT EXISTS idx_emergency_alerts_triggered_at
  ON emergency_alerts(triggered_at);

-- Hardware integration indexes
CREATE INDEX IF NOT EXISTS idx_sms_logs_phone_number
  ON sms_logs(phone_number);

CREATE INDEX IF NOT EXISTS idx_sms_logs_sms_type
  ON sms_logs(sms_type);

CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at
  ON sms_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_sms_logs_trip_id
  ON sms_logs(trip_id);

CREATE INDEX IF NOT EXISTS idx_gps_locations_trip_id
  ON gps_locations(trip_id);

CREATE INDEX IF NOT EXISTS idx_gps_locations_recorded_at
  ON gps_locations(recorded_at);

CREATE INDEX IF NOT EXISTS idx_gps_locations_source
  ON gps_locations(source);

CREATE INDEX IF NOT EXISTS idx_hardware_status_component
  ON hardware_status(component);

CREATE INDEX IF NOT EXISTS idx_hardware_status_last_check
  ON hardware_status(last_check);

-- Operator management indexes
CREATE INDEX IF NOT EXISTS idx_operator_shifts_operator
  ON operator_shifts(operator_id);

CREATE INDEX IF NOT EXISTS idx_operator_shifts_status
  ON operator_shifts(status);

CREATE INDEX IF NOT EXISTS idx_operator_shifts_scheduled_start
  ON operator_shifts(scheduled_start);

CREATE INDEX IF NOT EXISTS idx_operator_performance_operator
  ON operator_performance(operator_id);

CREATE INDEX IF NOT EXISTS idx_operator_performance_period
  ON operator_performance(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_audit_logs_operator
  ON audit_logs(operator_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table
  ON audit_logs(table_name);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_operator_tasks_assigned_to
  ON operator_tasks(assigned_to);

CREATE INDEX IF NOT EXISTS idx_operator_tasks_status
  ON operator_tasks(status);

CREATE INDEX IF NOT EXISTS idx_operator_tasks_priority
  ON operator_tasks(priority);

CREATE INDEX IF NOT EXISTS idx_operator_tasks_due_date
  ON operator_tasks(due_date);

CREATE INDEX IF NOT EXISTS idx_operator_notifications_operator
  ON operator_notifications(operator_id);

CREATE INDEX IF NOT EXISTS idx_operator_notifications_is_read
  ON operator_notifications(is_read);

CREATE INDEX IF NOT EXISTS idx_operator_notifications_created_at
  ON operator_notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_performance_reports_type
  ON performance_reports(report_type);

CREATE INDEX IF NOT EXISTS idx_performance_reports_period
  ON performance_reports(period_start, period_end);

-- Operator-focused views
CREATE OR REPLACE VIEW operator_dashboard_summary AS
SELECT
  s.id,
  s.full_name,
  s.email,
  s.role,
  s.is_active,
  s.last_login_at,
  COUNT(DISTINCT t.id) as total_trips,
  COUNT(DISTINCT CASE WHEN t.status = 'in_progress' THEN t.id END) as active_trips,
  COUNT(DISTINCT CASE WHEN ts.status = 'active' THEN ts.id END) as active_shifts,
  COUNT(DISTINCT CASE WHEN ot.status = 'pending' THEN ot.id END) as pending_tasks,
  COUNT(DISTINCT CASE WHEN onn.is_read = FALSE THEN onn.id END) as unread_notifications
FROM staff_users s
LEFT JOIN trips t ON s.id = t.operator_id
LEFT JOIN operator_shifts ts ON s.id = ts.operator_id
LEFT JOIN operator_tasks ot ON s.id = ot.assigned_to
LEFT JOIN operator_notifications onn ON s.id = onn.operator_id
WHERE s.is_active = TRUE
GROUP BY s.id, s.full_name, s.email, s.role, s.is_active, s.last_login_at;

CREATE OR REPLACE VIEW operator_shift_report AS
SELECT
  os.id,
  os.operator_id,
  su.full_name as operator_name,
  os.bus_id,
  b.plate_number,
  os.scheduled_start,
  os.scheduled_end,
  os.actual_start,
  os.actual_end,
  os.status,
  COUNT(DISTINCT t.id) as trips_completed,
  SUM(t.total_passengers) as total_passengers,
  SUM(t.total_fares) as total_fares,
  SUM(t.incidents) as total_incidents
FROM operator_shifts os
JOIN staff_users su ON os.operator_id = su.id
LEFT JOIN buses b ON os.bus_id = b.id
LEFT JOIN trips t ON os.id = t.shift_id
GROUP BY os.id, os.operator_id, su.full_name, os.bus_id, b.plate_number,
         os.scheduled_start, os.scheduled_end, os.actual_start, os.actual_end, os.status;

CREATE OR REPLACE VIEW trip_statistics AS
SELECT 
  trip_id,
  COUNT(*) as total_recordings,
  AVG(count) as average_passengers,
  MAX(count) as max_passengers,
  MIN(count) as min_passengers,
  MIN(recorded_at) as first_recording,
  MAX(recorded_at) as last_recording
FROM passenger_counts
GROUP BY trip_id;

CREATE OR REPLACE VIEW sms_statistics AS
SELECT 
  DATE(created_at) as date,
  sms_type,
  COUNT(*) as total_sent,
  COUNT(*) FILTER (WHERE status = 'sent') as successful,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM sms_logs
GROUP BY DATE(created_at), sms_type
ORDER BY date DESC, sms_type;

CREATE OR REPLACE VIEW emergency_statistics AS
SELECT 
  COALESCE(DATE(triggered_at), DATE(created_at)) as date,
  COUNT(*) as total_emergencies,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
  COUNT(*) FILTER (WHERE status != 'resolved') as unresolved
FROM emergency_alerts
GROUP BY COALESCE(DATE(triggered_at), DATE(created_at))
ORDER BY date DESC;
