-- =====================================================================
-- PHASE 9B.1 — DATABASE SCHEMA & INTEGRITY SQL VALIDATION TEST
-- File: /supabase/tests/20260923000000_business_schema_test.sql
-- =====================================================================

BEGIN;

-- Test 1: Verify all required business tables exist in public schema
DO $$
DECLARE
  v_table text;
  v_required_tables text[] := ARRAY[
    'dental_branches',
    'master_services',
    'branch_service_tariffs',
    'staff',
    'dental_doctors',
    'doctor_branch_assignments',
    'doctor_schedules',
    'doctor_assistant_pairings',
    'work_shifts',
    'staff_shift_assignments',
    'patient_profiles',
    'bookings',
    'booking_confirmations_h1',
    'patient_visits',
    'queue_items',
    'treatment_jobs',
    'treatment_activities',
    'treatment_visit_links',
    'treatment_incentives',
    'invoices',
    'invoice_items',
    'payment_transactions',
    'staff_compensation_rules',
    'compensation_accruals',
    'attendances',
    'overtime_records',
    'monthly_payrolls',
    'payroll_items',
    'chart_of_accounts',
    'journal_entries',
    'journal_lines',
    'branch_expenses'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_required_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = v_table
    ) THEN
      RAISE EXCEPTION 'Schema Test Failed: Required table % does not exist', v_table;
    END IF;
  END LOOP;
  RAISE NOTICE 'Schema Test 1 Passed: All 32 required business tables exist.';
END $$;

-- Test 2: Verify branch_id is present on all branch-scoped tables
DO $$
DECLARE
  v_table text;
  v_branch_scoped_tables text[] := ARRAY[
    'branch_service_tariffs',
    'doctor_branch_assignments',
    'doctor_schedules',
    'work_shifts',
    'staff_shift_assignments',
    'bookings',
    'booking_confirmations_h1',
    'patient_visits',
    'queue_items',
    'treatment_jobs',
    'treatment_incentives',
    'invoices',
    'payment_transactions',
    'attendances',
    'overtime_records',
    'monthly_payrolls',
    'journal_entries',
    'journal_lines',
    'branch_expenses'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_branch_scoped_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'branch_id'
    ) THEN
      RAISE EXCEPTION 'Schema Test Failed: Branch-scoped table % lacks branch_id column', v_table;
    END IF;
  END LOOP;
  RAISE NOTICE 'Schema Test 2 Passed: branch_id column exists on all branch-scoped tables.';
END $$;

-- Test 3: Verify Patient Profile does NOT have permanent branch_id (Patient is Global)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'patient_profiles' AND column_name = 'branch_id'
  ) THEN
    RAISE EXCEPTION 'Schema Test Failed: patient_profiles MUST NOT have permanent branch_id (Patient must be global).';
  END IF;
  RAISE NOTICE 'Schema Test 3 Passed: patient_profiles has global identity without permanent branch lock.';
END $$;

-- Test 4: Verify snapshot fields on treatment_jobs, invoice_items, queue_items, payroll_items
DO $$
BEGIN
  -- Treatment job snapshots
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'treatment_jobs' AND column_name = 'service_name_snapshot') THEN
    RAISE EXCEPTION 'Missing service_name_snapshot on treatment_jobs';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'treatment_jobs' AND column_name = 'doctor_name_snapshot') THEN
    RAISE EXCEPTION 'Missing doctor_name_snapshot on treatment_jobs';
  END IF;
  -- Invoice item snapshots
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_items' AND column_name = 'unit_price_snapshot') THEN
    RAISE EXCEPTION 'Missing unit_price_snapshot on invoice_items';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_items' AND column_name = 'description_snapshot') THEN
    RAISE EXCEPTION 'Missing description_snapshot on invoice_items';
  END IF;
  -- Payroll item snapshots
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_items' AND column_name = 'amount_snapshot') THEN
    RAISE EXCEPTION 'Missing amount_snapshot on payroll_items';
  END IF;
  RAISE NOTICE 'Schema Test 4 Passed: Historical snapshot fields are present across clinical, invoice, and payroll tables.';
END $$;

-- Test 5: Verify Model C PIC Assistant and multi-day link
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'treatment_jobs' AND column_name = 'pic_assistant_id') THEN
    RAISE EXCEPTION 'Missing pic_assistant_id on treatment_jobs (Model C)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'treatment_activities' AND column_name = 'actor_id') THEN
    RAISE EXCEPTION 'Missing actor_id on treatment_activities';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'treatment_visit_links') THEN
    RAISE EXCEPTION 'Missing treatment_visit_links table for multi-day treatments';
  END IF;
  RAISE NOTICE 'Schema Test 5 Passed: Model C PIC assistant, activity actor separation, and multi-day link verified.';
END $$;

-- Test 6: Verify no hazardous CASCADE DELETE on master -> transaction relations
DO $$
DECLARE
  v_rel record;
BEGIN
  FOR v_rel IN 
    SELECT
      tc.table_name,
      kcu.column_name,
      rc.delete_rule
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON tc.constraint_name = rc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name IN ('invoices', 'payment_transactions', 'journal_entries', 'treatment_jobs', 'patient_visits')
  LOOP
    IF v_rel.delete_rule = 'CASCADE' THEN
      RAISE EXCEPTION 'Dangerous CASCADE DELETE detected on historical transaction table %.%', v_rel.table_name, v_rel.column_name;
    END IF;
  END LOOP;
  RAISE NOTICE 'Schema Test 6 Passed: Historical transaction tables protect against accidental cascade deletion.';
END $$;

ROLLBACK; -- Safe test transaction rollback
