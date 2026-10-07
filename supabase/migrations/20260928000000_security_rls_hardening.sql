-- =====================================================================
-- LALA DENTIST — PRODUCTION LEAST PRIVILEGE GRANTS & RLS HARDENING
-- Migration: 20260928000000_security_rls_hardening.sql
-- 
-- DESCRIPTION:
-- 1. Enforces PostgreSQL least privilege GRANTs on Schema and Tables.
-- 2. Strictly prohibits permissive blanket grants (e.g. FOR ALL TO anon USING (true)).
-- 3. Implements strict Branch Isolation & RBAC on PostgreSQL RLS policies.
-- 4. Enables public read only for active promotion media and clinic branding.
-- 5. Ensures complete isolation between Branch Admins, Doctors, Patients, and Super Admin.
-- =====================================================================

-- 1. SCHEMA PERMISSION
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 2. LEAST PRIVILEGE TABLE GRANTS
-- Revoke all direct permissions from anon first
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Anon is only granted SELECT on public promotional & catalog info
GRANT SELECT ON public.promotion_media TO anon;
GRANT SELECT ON public.dental_branches TO anon;
GRANT SELECT ON public.master_services TO anon;
GRANT SELECT ON public.branch_service_tariffs TO anon;
GRANT SELECT ON public.dental_doctors TO anon;
GRANT SELECT ON public.doctor_branch_assignments TO anon;
GRANT SELECT ON public.doctor_schedules TO anon;

-- Authenticated is granted operational DML (strictly filtered by RLS policies below)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- Ensure future tables do not automatically get blanket permissions for anon
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON ROUTINES TO authenticated;

-- =====================================================================
-- 3. HELPER SECURITY FUNCTIONS (SECURITY DEFINER, STRICT SEARCH PATH)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_accounts 
    WHERE auth_user_id = auth.uid() 
      AND role = 'SUPER_ADMIN' 
      AND active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role VARCHAR;
BEGIN
  SELECT role INTO v_role
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;
  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_branch_id UUID;
BEGIN
  SELECT branch_id INTO v_branch_id
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;
  RETURN v_branch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_patient_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  SELECT patient_id INTO v_patient_id
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;
  RETURN v_patient_id;
END;
$$;

-- =====================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.1 PROMOTION MEDIA
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.promotion_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read promotions" ON public.promotion_media;
DROP POLICY IF EXISTS "Authenticated manage promotions" ON public.promotion_media;
DROP POLICY IF EXISTS "Active promotions read" ON public.promotion_media;
DROP POLICY IF EXISTS "Admin manage promotions" ON public.promotion_media;

-- Public / Android: Read ONLY active promotions
CREATE POLICY "Active promotions read"
  ON public.promotion_media
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    OR public.is_super_admin()
    OR (auth.role() = 'authenticated' AND public.get_user_role() = 'BRANCH_ADMIN' AND branch_id = public.get_user_branch_id())
  );

-- Super Admin: Full management
-- Branch Admin: Manage only their branch promotion
CREATE POLICY "Admin manage promotions"
  ON public.promotion_media
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.get_user_role() = 'BRANCH_ADMIN' AND branch_id = public.get_user_branch_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.get_user_role() = 'BRANCH_ADMIN' AND branch_id = public.get_user_branch_id())
  );

-- ---------------------------------------------------------------------
-- 4.2 PATIENT PROFILES
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.patient_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage patient profiles" ON public.patient_profiles;
DROP POLICY IF EXISTS "Staff read patients" ON public.patient_profiles;
DROP POLICY IF EXISTS "Staff manage patients" ON public.patient_profiles;

CREATE POLICY "Staff read patients"
  ON public.patient_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
    OR (public.get_user_role() = 'PATIENT' AND (id = auth.uid() OR id = public.get_user_patient_id()))
  );

CREATE POLICY "Staff manage patients"
  ON public.patient_profiles
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
    OR (public.get_user_role() = 'PATIENT' AND (id = auth.uid() OR id = public.get_user_patient_id()))
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
    OR (public.get_user_role() = 'PATIENT' AND (id = auth.uid() OR id = public.get_user_patient_id()))
  );

-- ---------------------------------------------------------------------
-- 4.3 BOOKINGS
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage bookings" ON public.bookings;
DROP POLICY IF EXISTS "Booking branch isolation select" ON public.bookings;
DROP POLICY IF EXISTS "Booking branch isolation manage" ON public.bookings;

CREATE POLICY "Booking branch isolation select"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR branch_id = public.get_user_branch_id()
    OR (public.get_user_role() = 'PATIENT' AND patient_id = public.get_user_patient_id())
  );

CREATE POLICY "Booking branch isolation manage"
  ON public.bookings
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR branch_id = public.get_user_branch_id()
    OR (public.get_user_role() = 'PATIENT' AND patient_id = public.get_user_patient_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR branch_id = public.get_user_branch_id()
    OR (public.get_user_role() = 'PATIENT' AND patient_id = public.get_user_patient_id())
  );

-- ---------------------------------------------------------------------
-- 4.4 PATIENT VISITS
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.patient_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage visits" ON public.patient_visits;
DROP POLICY IF EXISTS "Visit branch isolation" ON public.patient_visits;

CREATE POLICY "Visit branch isolation"
  ON public.patient_visits
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR branch_id = public.get_user_branch_id()
    OR (public.get_user_role() = 'PATIENT' AND patient_id = public.get_user_patient_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR branch_id = public.get_user_branch_id()
    OR (public.get_user_role() = 'PATIENT' AND patient_id = public.get_user_patient_id())
  );

-- ---------------------------------------------------------------------
-- 4.5 QUEUE ITEMS
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.queue_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage queue items" ON public.queue_items;
DROP POLICY IF EXISTS "Queue branch isolation" ON public.queue_items;

CREATE POLICY "Queue branch isolation"
  ON public.queue_items
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR branch_id = public.get_user_branch_id()
    OR (public.get_user_role() = 'PATIENT' AND patient_id = public.get_user_patient_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR branch_id = public.get_user_branch_id()
    OR (public.get_user_role() = 'PATIENT' AND patient_id = public.get_user_patient_id())
  );

-- ---------------------------------------------------------------------
-- 4.6 TREATMENT JOBS & ACTIVITIES
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.treatment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.treatment_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage treatment jobs" ON public.treatment_jobs;
DROP POLICY IF EXISTS "Authenticated manage treatment activities" ON public.treatment_activities;
DROP POLICY IF EXISTS "Treatment branch isolation" ON public.treatment_jobs;
DROP POLICY IF EXISTS "Treatment activity branch isolation" ON public.treatment_activities;

CREATE POLICY "Treatment branch isolation"
  ON public.treatment_jobs
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR branch_id = public.get_user_branch_id()
  )
  WITH CHECK (
    public.is_super_admin()
    OR branch_id = public.get_user_branch_id()
  );

CREATE POLICY "Treatment activity branch isolation"
  ON public.treatment_activities
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR branch_id = public.get_user_branch_id()
  )
  WITH CHECK (
    public.is_super_admin()
    OR branch_id = public.get_user_branch_id()
  );

-- ---------------------------------------------------------------------
-- 4.7 CLINICAL MEDICAL RECORDS
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.clinical_medical_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage medical records" ON public.clinical_medical_records;
DROP POLICY IF EXISTS "Medical record read isolation" ON public.clinical_medical_records;
DROP POLICY IF EXISTS "Medical record doctor manage" ON public.clinical_medical_records;

-- Read: Super Admin, Doctors/Assistants/Branch Admins of that branch, Patient themselves
CREATE POLICY "Medical record read isolation"
  ON public.clinical_medical_records
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.get_user_role() IN ('DOCTOR', 'DOCTOR_ASSISTANT', 'BRANCH_ADMIN') AND branch_id = public.get_user_branch_id())
    OR (public.get_user_role() = 'PATIENT' AND patient_id = public.get_user_patient_id())
  );

-- Write: Super Admin & Doctors of that branch ONLY
CREATE POLICY "Medical record doctor manage"
  ON public.clinical_medical_records
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.get_user_role() = 'DOCTOR' AND branch_id = public.get_user_branch_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.get_user_role() = 'DOCTOR' AND branch_id = public.get_user_branch_id())
  );

-- ---------------------------------------------------------------------
-- 4.8 INVOICES & INVOICE ITEMS
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated manage invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Invoice branch isolation select" ON public.invoices;
DROP POLICY IF EXISTS "Invoice branch isolation manage" ON public.invoices;
DROP POLICY IF EXISTS "Invoice items isolation" ON public.invoice_items;

CREATE POLICY "Invoice branch isolation select"
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR branch_id = public.get_user_branch_id()
    OR (public.get_user_role() = 'PATIENT' AND patient_id = public.get_user_patient_id())
  );

CREATE POLICY "Invoice branch isolation manage"
  ON public.invoices
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.get_user_role() = 'BRANCH_ADMIN' AND branch_id = public.get_user_branch_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.get_user_role() = 'BRANCH_ADMIN' AND branch_id = public.get_user_branch_id())
  );

CREATE POLICY "Invoice items isolation"
  ON public.invoice_items
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.invoices i 
      WHERE i.id = invoice_items.invoice_id 
        AND (i.branch_id = public.get_user_branch_id() OR (public.get_user_role() = 'PATIENT' AND i.patient_id = public.get_user_patient_id()))
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.invoices i 
      WHERE i.id = invoice_items.invoice_id 
        AND i.branch_id = public.get_user_branch_id()
        AND public.get_user_role() = 'BRANCH_ADMIN'
    )
  );

-- ---------------------------------------------------------------------
-- 4.9 PAYMENT TRANSACTIONS
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage payments" ON public.payment_transactions;
DROP POLICY IF EXISTS "Payment branch isolation" ON public.payment_transactions;

CREATE POLICY "Payment branch isolation"
  ON public.payment_transactions
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR branch_id = public.get_user_branch_id()
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.get_user_role() = 'BRANCH_ADMIN' AND branch_id = public.get_user_branch_id())
  );

-- ---------------------------------------------------------------------
-- 4.10 DENTAL BRANCHES & USER ACCOUNTS
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.dental_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read branches" ON public.dental_branches;
DROP POLICY IF EXISTS "Authenticated manage branches" ON public.dental_branches;
DROP POLICY IF EXISTS "Public read user accounts" ON public.user_accounts;
DROP POLICY IF EXISTS "Authenticated manage user accounts" ON public.user_accounts;

CREATE POLICY "Branches read access"
  ON public.dental_branches
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR public.is_super_admin() OR id = public.get_user_branch_id());

CREATE POLICY "Super admin manage branches"
  ON public.dental_branches
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "User accounts self read"
  ON public.user_accounts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id OR public.is_super_admin());

-- ---------------------------------------------------------------------
-- 4.11 DENTAL DOCTORS & SCHEDULES (PUBLIC READ CATALOG)
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.dental_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.doctor_branch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.doctor_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors public read" ON public.dental_doctors;
DROP POLICY IF EXISTS "Doctors super admin manage" ON public.dental_doctors;
DROP POLICY IF EXISTS "Doctor assignments public read" ON public.doctor_branch_assignments;
DROP POLICY IF EXISTS "Doctor assignments super admin manage" ON public.doctor_branch_assignments;
DROP POLICY IF EXISTS "Doctor schedules public read" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Doctor schedules manage" ON public.doctor_schedules;

CREATE POLICY "Doctors public read"
  ON public.dental_doctors
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Doctors super admin manage"
  ON public.dental_doctors
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Doctor assignments public read"
  ON public.doctor_branch_assignments
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Doctor assignments super admin manage"
  ON public.doctor_branch_assignments
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Doctor schedules public read"
  ON public.doctor_schedules
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Doctor schedules manage"
  ON public.doctor_schedules
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.get_user_role() = 'BRANCH_ADMIN' AND branch_id = public.get_user_branch_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.get_user_role() = 'BRANCH_ADMIN' AND branch_id = public.get_user_branch_id())
  );

