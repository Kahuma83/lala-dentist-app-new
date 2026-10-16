DO $$
DECLARE
  table_name text;
  realtime_tables text[] := ARRAY[
    'attendance_records',
    'backup_jobs',
    'booking_confirmations_h1',
    'bookings',
    'branch_service_tariffs',
    'chart_of_accounts',
    'clinic_branding',
    'compensation_accruals',
    'compensation_rules',
    'dental_branches',
    'dental_doctors',
    'doctor_branch_assignments',
    'doctor_schedules',
    'invoice_items',
    'invoices',
    'journal_entries',
    'master_services',
    'medical_records',
    'monthly_payrolls',
    'overtime_records',
    'patient_profiles',
    'patient_visits',
    'patients',
    'payment_transactions',
    'payroll_items',
    'promotion_media',
    'queue_items',
    'staff',
    'staff_shift_assignments',
    'treatment_activities',
    'treatment_jobs',
    'work_shifts'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH table_name IN ARRAY realtime_tables LOOP
    IF to_regclass('public.' || quote_ident(table_name)) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;
