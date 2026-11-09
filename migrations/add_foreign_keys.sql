-- Add foreign key relationships for transactions table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'card_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_transactions_card_id'
    AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions
    ADD CONSTRAINT fk_transactions_card_id
    FOREIGN KEY (card_id) REFERENCES public.qr_cards(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'staff_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_transactions_staff_id'
    AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions
    ADD CONSTRAINT fk_transactions_staff_id
    FOREIGN KEY (staff_id) REFERENCES public.staff_users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'trip_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_transactions_trip_id'
    AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions
    ADD CONSTRAINT fk_transactions_trip_id
    FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for trips table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'bus_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_trips_bus_id'
    AND conrelid = 'public.trips'::regclass
  ) THEN
    ALTER TABLE public.trips
    ADD CONSTRAINT fk_trips_bus_id
    FOREIGN KEY (bus_id) REFERENCES public.buses(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'conductor_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_trips_conductor_id'
    AND conrelid = 'public.trips'::regclass
  ) THEN
    ALTER TABLE public.trips
    ADD CONSTRAINT fk_trips_conductor_id
    FOREIGN KEY (conductor_id) REFERENCES public.staff_users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'driver_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_trips_driver_id'
    AND conrelid = 'public.trips'::regclass
  ) THEN
    ALTER TABLE public.trips
    ADD CONSTRAINT fk_trips_driver_id
    FOREIGN KEY (driver_id) REFERENCES public.staff_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for fare_irregularities table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fare_irregularities' AND column_name = 'trip_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_fare_irregularities_trip_id'
    AND conrelid = 'public.fare_irregularities'::regclass
  ) THEN
    ALTER TABLE public.fare_irregularities
    ADD CONSTRAINT fk_fare_irregularities_trip_id
    FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for passenger_counts table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'passenger_counts' AND column_name = 'trip_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_passenger_counts_trip_id'
    AND conrelid = 'public.passenger_counts'::regclass
  ) THEN
    ALTER TABLE public.passenger_counts
    ADD CONSTRAINT fk_passenger_counts_trip_id
    FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for operator_shifts table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_shifts' AND column_name = 'operator_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_operator_shifts_operator_id'
    AND conrelid = 'public.operator_shifts'::regclass
  ) THEN
    ALTER TABLE public.operator_shifts
    ADD CONSTRAINT fk_operator_shifts_operator_id
    FOREIGN KEY (operator_id) REFERENCES public.staff_users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_shifts' AND column_name = 'bus_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_operator_shifts_bus_id'
    AND conrelid = 'public.operator_shifts'::regclass
  ) THEN
    ALTER TABLE public.operator_shifts
    ADD CONSTRAINT fk_operator_shifts_bus_id
    FOREIGN KEY (bus_id) REFERENCES public.buses(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for operator_performance table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_performance' AND column_name = 'operator_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_operator_performance_operator_id'
    AND conrelid = 'public.operator_performance'::regclass
  ) THEN
    ALTER TABLE public.operator_performance
    ADD CONSTRAINT fk_operator_performance_operator_id
    FOREIGN KEY (operator_id) REFERENCES public.staff_users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key relationships for audit_logs table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'operator_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_audit_logs_operator_id'
    AND conrelid = 'public.audit_logs'::regclass
  ) THEN
    ALTER TABLE public.audit_logs
    ADD CONSTRAINT fk_audit_logs_operator_id
    FOREIGN KEY (operator_id) REFERENCES public.staff_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for operator_tasks table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_tasks' AND column_name = 'assigned_to'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_operator_tasks_assigned_to'
    AND conrelid = 'public.operator_tasks'::regclass
  ) THEN
    ALTER TABLE public.operator_tasks
    ADD CONSTRAINT fk_operator_tasks_assigned_to
    FOREIGN KEY (assigned_to) REFERENCES public.staff_users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_tasks' AND column_name = 'assigned_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_operator_tasks_assigned_by'
    AND conrelid = 'public.operator_tasks'::regclass
  ) THEN
    ALTER TABLE public.operator_tasks
    ADD CONSTRAINT fk_operator_tasks_assigned_by
    FOREIGN KEY (assigned_by) REFERENCES public.staff_users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_tasks' AND column_name = 'trip_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_operator_tasks_trip_id'
    AND conrelid = 'public.operator_tasks'::regclass
  ) THEN
    ALTER TABLE public.operator_tasks
    ADD CONSTRAINT fk_operator_tasks_trip_id
    FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_tasks' AND column_name = 'bus_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_operator_tasks_bus_id'
    AND conrelid = 'public.operator_tasks'::regclass
  ) THEN
    ALTER TABLE public.operator_tasks
    ADD CONSTRAINT fk_operator_tasks_bus_id
    FOREIGN KEY (bus_id) REFERENCES public.buses(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for operator_notifications table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_notifications' AND column_name = 'operator_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_operator_notifications_operator_id'
    AND conrelid = 'public.operator_notifications'::regclass
  ) THEN
    ALTER TABLE public.operator_notifications
    ADD CONSTRAINT fk_operator_notifications_operator_id
    FOREIGN KEY (operator_id) REFERENCES public.staff_users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_notifications' AND column_name = 'task_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_operator_notifications_task_id'
    AND conrelid = 'public.operator_notifications'::regclass
  ) THEN
    ALTER TABLE public.operator_notifications
    ADD CONSTRAINT fk_operator_notifications_task_id
    FOREIGN KEY (task_id) REFERENCES public.operator_tasks(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_notifications' AND column_name = 'trip_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_operator_notifications_trip_id'
    AND conrelid = 'public.operator_notifications'::regclass
  ) THEN
    ALTER TABLE public.operator_notifications
    ADD CONSTRAINT fk_operator_notifications_trip_id
    FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for performance_reports table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'performance_reports' AND column_name = 'generated_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_performance_reports_generated_by'
    AND conrelid = 'public.performance_reports'::regclass
  ) THEN
    ALTER TABLE public.performance_reports
    ADD CONSTRAINT fk_performance_reports_generated_by
    FOREIGN KEY (generated_by) REFERENCES public.staff_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for buses table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buses' AND column_name = 'assigned_operator_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_buses_assigned_operator_id'
    AND conrelid = 'public.buses'::regclass
  ) THEN
    ALTER TABLE public.buses
    ADD CONSTRAINT fk_buses_assigned_operator_id
    FOREIGN KEY (assigned_operator_id) REFERENCES public.staff_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for trips table (operator_id and shift_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'operator_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_trips_operator_id'
    AND conrelid = 'public.trips'::regclass
  ) THEN
    ALTER TABLE public.trips
    ADD CONSTRAINT fk_trips_operator_id
    FOREIGN KEY (operator_id) REFERENCES public.staff_users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'shift_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_trips_shift_id'
    AND conrelid = 'public.trips'::regclass
  ) THEN
    ALTER TABLE public.trips
    ADD CONSTRAINT fk_trips_shift_id
    FOREIGN KEY (shift_id) REFERENCES public.operator_shifts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for qr_cards table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'qr_cards' AND column_name = 'issued_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_qr_cards_issued_by'
    AND conrelid = 'public.qr_cards'::regclass
  ) THEN
    ALTER TABLE public.qr_cards
    ADD CONSTRAINT fk_qr_cards_issued_by
    FOREIGN KEY (issued_by) REFERENCES public.staff_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for temporary_tickets table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'temporary_tickets' AND column_name = 'trip_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_temporary_tickets_trip_id'
    AND conrelid = 'public.temporary_tickets'::regclass
  ) THEN
    ALTER TABLE public.temporary_tickets
    ADD CONSTRAINT fk_temporary_tickets_trip_id
    FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'temporary_tickets' AND column_name = 'issued_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_temporary_tickets_issued_by'
    AND conrelid = 'public.temporary_tickets'::regclass
  ) THEN
    ALTER TABLE public.temporary_tickets
    ADD CONSTRAINT fk_temporary_tickets_issued_by
    FOREIGN KEY (issued_by) REFERENCES public.staff_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for boarded_passengers table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'boarded_passengers' AND column_name = 'card_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_boarded_passengers_card_id'
    AND conrelid = 'public.boarded_passengers'::regclass
  ) THEN
    ALTER TABLE public.boarded_passengers
    ADD CONSTRAINT fk_boarded_passengers_card_id
    FOREIGN KEY (card_id) REFERENCES public.qr_cards(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'boarded_passengers' AND column_name = 'temp_ticket_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_boarded_passengers_temp_ticket_id'
    AND conrelid = 'public.boarded_passengers'::regclass
  ) THEN
    ALTER TABLE public.boarded_passengers
    ADD CONSTRAINT fk_boarded_passengers_temp_ticket_id
    FOREIGN KEY (temp_ticket_id) REFERENCES public.temporary_tickets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for gps_logs table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gps_logs' AND column_name = 'trip_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_gps_logs_trip_id'
    AND conrelid = 'public.gps_logs'::regclass
  ) THEN
    ALTER TABLE public.gps_logs
    ADD CONSTRAINT fk_gps_logs_trip_id
    FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key relationships for fare_irregularities table (resolved_by)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fare_irregularities' AND column_name = 'resolved_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_fare_irregularities_resolved_by'
    AND conrelid = 'public.fare_irregularities'::regclass
  ) THEN
    ALTER TABLE public.fare_irregularities
    ADD CONSTRAINT fk_fare_irregularities_resolved_by
    FOREIGN KEY (resolved_by) REFERENCES public.staff_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for emergency_alerts table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'bus_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_emergency_alerts_bus_id'
    AND conrelid = 'public.emergency_alerts'::regclass
  ) THEN
    ALTER TABLE public.emergency_alerts
    ADD CONSTRAINT fk_emergency_alerts_bus_id
    FOREIGN KEY (bus_id) REFERENCES public.buses(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'acknowledged_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_emergency_alerts_acknowledged_by'
    AND conrelid = 'public.emergency_alerts'::regclass
  ) THEN
    ALTER TABLE public.emergency_alerts
    ADD CONSTRAINT fk_emergency_alerts_acknowledged_by
    FOREIGN KEY (acknowledged_by) REFERENCES public.staff_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for sms_logs table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_logs' AND column_name = 'trip_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_sms_logs_trip_id'
    AND conrelid = 'public.sms_logs'::regclass
  ) THEN
    ALTER TABLE public.sms_logs
    ADD CONSTRAINT fk_sms_logs_trip_id
    FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for gps_locations table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gps_locations' AND column_name = 'trip_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_gps_locations_trip_id'
    AND conrelid = 'public.gps_locations'::regclass
  ) THEN
    ALTER TABLE public.gps_locations
    ADD CONSTRAINT fk_gps_locations_trip_id
    FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key relationships for announcements table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'announcements' AND column_name = 'created_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_announcements_created_by'
    AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements
    ADD CONSTRAINT fk_announcements_created_by
    FOREIGN KEY (created_by) REFERENCES public.staff_users(id) ON DELETE SET NULL;
  END IF;
END $$;
