-- Purpose: grant explicit privileges to the Supabase service_role role so production backend
-- writes and server-side admin operations work with real database access, while keeping
-- client-side RLS policies intact for anonymous/defined user access.

GRANT USAGE ON SCHEMA public TO service_role;

-- Core auth and operational tables in the real schema
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dental_branches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.master_services TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_service_tariffs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dental_doctors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.doctor_branch_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.doctor_schedules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.doctor_assistant_pairings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_shifts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_shift_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bookings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.booking_confirmations_h1 TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_visits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.queue_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.treatment_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.treatment_activities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.treatment_visit_links TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.treatment_incentives TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoice_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_compensation_rules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.compensation_accruals TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendances TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.overtime_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.monthly_payrolls TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payroll_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chart_of_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_entries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_lines TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_expenses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clinical_medical_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.promotion_media TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.backup_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.storage_objects_meta TO service_role;

-- Default privileges for future tables created in public schema.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
