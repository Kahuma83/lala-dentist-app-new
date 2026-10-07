-- =====================================================================
-- PHASE 9A — SUPABASE FOUNDATION & REAL AUTHENTICATION
-- MIGRATION FOUNDATION & PROFILE SCHEMA PLAN
-- File: /supabase/migrations/20260922000000_auth_foundation.sql
-- =====================================================================

-- 1. Create custom enum or check constraints for user roles if needed
-- We map roles to the existing UserRole: SUPER_ADMIN, BRANCH_ADMIN, DOCTOR, DOCTOR_ASSISTANT, PATIENT

-- 2. Create the user_accounts profile mapping table
CREATE TABLE IF NOT EXISTS public.user_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(100),
  name VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL,
  staff_id VARCHAR(50),
  patient_id VARCHAR(50),
  branch_id VARCHAR(50),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Constraints
  CONSTRAINT fk_auth_users FOREIGN KEY (auth_user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT chk_user_role CHECK (role IN ('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT', 'PATIENT'))
);

-- Index for speedy context lookup
CREATE INDEX IF NOT EXISTS idx_user_accounts_auth_user ON public.user_accounts(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_email ON public.user_accounts(email);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;

-- 4. Secure RLS Policies (Principle: Restrict to owner unless Super Admin)

-- Helper function to check if the current user is a SUPER_ADMIN
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_accounts 
    WHERE auth_user_id = auth.uid() 
      AND role = 'SUPER_ADMIN' 
      AND active = true
  );
END;
$$ LANGUAGE plpgsql;

-- SELECT policy: Users can read their own profile, or SUPER_ADMINs can read all profiles.
CREATE POLICY "Allow users to read their own profile"
  ON public.user_accounts
  FOR SELECT
  USING (
    auth.uid() = auth_user_id 
    OR public.is_super_admin()
  );

-- UPDATE policy: Users can update limited fields on their own profile, SUPER_ADMIN has full update rights.
CREATE POLICY "Allow users to update their own profile"
  ON public.user_accounts
  FOR UPDATE
  USING (
    auth.uid() = auth_user_id 
    OR public.is_super_admin()
  )
  WITH CHECK (
    auth.uid() = auth_user_id 
    OR public.is_super_admin()
  );

-- INSERT policy: Only SUPER_ADMIN can create new user accounts in production.
CREATE POLICY "Only super admin can insert user accounts"
  ON public.user_accounts
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
  );

-- DELETE policy: Only SUPER_ADMIN can delete user accounts.
CREATE POLICY "Only super admin can delete user accounts"
  ON public.user_accounts
  FOR DELETE
  USING (
    public.is_super_admin()
  );
-- =====================================================================
-- PHASE 9A.1 — SUPABASE AUTH & RLS SECURITY PATCH
-- MIGRATION: RLS HARDENING & PRIVILEGE ESCALATION PREVENTION
-- File: /supabase/migrations/20260922000001_auth_rls_hardening.sql
-- =====================================================================

-- 1. HARDEN SUPER_ADMIN CHECK FUNCTION
-- Ensure explicit search_path and strict non-tamperable checks
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

-- 2. CREATE DEFENSE-IN-DEPTH TRIGGER FUNCTION
-- Strictly disallows modification of authorization and identity fields by any non-SUPER_ADMIN
CREATE OR REPLACE FUNCTION public.protect_user_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If executing user is an active verified SUPER_ADMIN, allow administrative modifications
  IF public.is_super_admin() THEN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
  END IF;

  -- For all non-superadmin actors (PATIENT, DOCTOR, DOCTOR_ASSISTANT, BRANCH_ADMIN, or unauthenticated):
  -- Strictly reject any modification of authorization, status, and identity columns:

  -- 1. Role escalation protection
  IF (NEW.role IS DISTINCT FROM OLD.role) THEN
    RAISE EXCEPTION 'Privilege escalation rejected: role modification is restricted to SUPER_ADMIN.';
  END IF;

  -- 2. Identity immutability
  IF (NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id) THEN
    RAISE EXCEPTION 'Identity tampering rejected: auth_user_id is immutable.';
  END IF;

  IF (NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Identity tampering rejected: id is immutable.';
  END IF;

  -- 3. Staff assignment protection
  IF (NEW.staff_id IS DISTINCT FROM OLD.staff_id) THEN
    RAISE EXCEPTION 'Authorization tampering rejected: staff_id modification is restricted to SUPER_ADMIN.';
  END IF;

  -- 4. Patient identity protection
  IF (NEW.patient_id IS DISTINCT FROM OLD.patient_id) THEN
    RAISE EXCEPTION 'Authorization tampering rejected: patient_id modification is restricted to SUPER_ADMIN.';
  END IF;

  -- 5. Branch boundary protection
  IF (NEW.branch_id IS DISTINCT FROM OLD.branch_id) THEN
    RAISE EXCEPTION 'Authorization tampering rejected: branch_id modification is restricted to SUPER_ADMIN.';
  END IF;

  -- 6. Account status / active flag protection
  IF (NEW.active IS DISTINCT FROM OLD.active) THEN
    RAISE EXCEPTION 'Status tampering rejected: account active status modification is restricted to SUPER_ADMIN.';
  END IF;

  -- For allowed non-authorization updates (e.g. name), keep updated_at fresh
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

-- 3. BIND THE FIELD PROTECTION TRIGGER TO public.user_accounts
DROP TRIGGER IF EXISTS trg_protect_user_fields ON public.user_accounts;
CREATE TRIGGER trg_protect_user_fields
  BEFORE UPDATE ON public.user_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_fields();

-- 4. REMOVE VULNERABLE RLS UPDATE POLICY
DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.user_accounts;

-- 5. CREATE HARDENED SUPER_ADMIN UPDATE POLICY
CREATE POLICY "Super admin can update any user account"
  ON public.user_accounts
  FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 6. CREATE RESTRICTED REGULAR USER UPDATE POLICY
-- Users can only target their own row AND WITH CHECK verifies the auth_user_id cannot be changed.
-- Column modifications to authorization fields are completely blocked by trg_protect_user_fields.
CREATE POLICY "Users can update their own non-auth profile fields"
  ON public.user_accounts
  FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (
    auth.uid() = auth_user_id 
    AND auth_user_id = (SELECT a.auth_user_id FROM public.user_accounts a WHERE a.id = user_accounts.id)
  );
-- =====================================================================
-- PHASE 9B.1 — LALA DENTIST SUPABASE BUSINESS DATABASE SCHEMA
-- Migration: 20260923000000_business_schema_foundation.sql
-- 
-- DESCRIPTION:
-- Master and transactional database schema covering the complete Lala Dentist
-- business domain: Master Services, Branch Tariffs, Staff & Doctors,
-- Shifts & Schedules, Patients, Bookings & H-1 Confirmations, Patient Visits,
-- Live Queues, Treatments (Model C PIC + Activities + Multi-day links),
-- Invoices & Invoice Items, Payments, HR & Payroll (Attendances, Overtimes,
-- Compensations, Payrolls), and Branch-Isolated Accounting (COA, Journals, GL).
-- =====================================================================

-- Enable necessary extensions if not already present
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. MASTER TABLES
-- =====================================================================

-- 1.1 Dental Branches (Scope: GLOBAL)
CREATE TABLE IF NOT EXISTS public.dental_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(30) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_dental_branches_active ON public.dental_branches(is_active);

-- 1.2 Master Services (Scope: GLOBAL)
CREATE TABLE IF NOT EXISTS public.master_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  base_price BIGINT NOT NULL CHECK (base_price >= 0),
  estimated_duration_minutes INT NOT NULL DEFAULT 30 CHECK (estimated_duration_minutes > 0),
  category VARCHAR(50) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_master_services_category ON public.master_services(category);
CREATE INDEX IF NOT EXISTS idx_master_services_active ON public.master_services(is_active);

-- 1.3 Branch Service Tariffs (Scope: BRANCH-SCOPED)
CREATE TABLE IF NOT EXISTS public.branch_service_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES public.master_services(id) ON DELETE RESTRICT,
  custom_price BIGINT NOT NULL CHECK (custom_price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_branch_service_tariff UNIQUE (branch_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_service_tariffs_branch ON public.branch_service_tariffs(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_service_tariffs_service ON public.branch_service_tariffs(service_id);

-- 1.4 Staff (Scope: GLOBAL / BRANCH-ASSIGNED)
CREATE TABLE IF NOT EXISTS public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  position VARCHAR(50) NOT NULL CHECK (position IN ('DOCTOR', 'ASSISTANT', 'BRANCH_ADMIN', 'OB', 'OTHER')),
  employment_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (employment_status IN ('ACTIVE', 'INACTIVE', 'RESIGNED')),
  join_date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  branch_id UUID REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  user_account_id UUID REFERENCES public.user_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_staff_branch ON public.staff(branch_id);
CREATE INDEX IF NOT EXISTS idx_staff_position ON public.staff(position);
CREATE INDEX IF NOT EXISTS idx_staff_status ON public.staff(employment_status, active);
CREATE INDEX IF NOT EXISTS idx_staff_user_account ON public.staff(user_account_id);

-- 1.5 Dental Doctors (Scope: GLOBAL MASTER - Multi-branch support)
CREATE TABLE IF NOT EXISTS public.dental_doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.staff(id) ON DELETE RESTRICT,
  doctor_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  full_name VARCHAR(150),
  specialization VARCHAR(100) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(100),
  str VARCHAR(100),
  sip VARCHAR(100),
  assigned_branch_id UUID REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_dental_doctors_code ON public.dental_doctors(doctor_code);
CREATE INDEX IF NOT EXISTS idx_dental_doctors_staff ON public.dental_doctors(staff_id);
CREATE INDEX IF NOT EXISTS idx_dental_doctors_branch ON public.dental_doctors(assigned_branch_id);

-- 1.6 Doctor Branch Assignments (Scope: BRANCH-SCOPED)
CREATE TABLE IF NOT EXISTS public.doctor_branch_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.dental_doctors(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_doctor_branch_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_doc_branch_assign_doc ON public.doctor_branch_assignments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doc_branch_assign_branch ON public.doctor_branch_assignments(branch_id);

-- 1.7 Doctor Schedules (Scope: BRANCH-SCOPED)
CREATE TABLE IF NOT EXISTS public.doctor_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.dental_doctors(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  start_time VARCHAR(10) NOT NULL, -- e.g. "08:00"
  end_time VARCHAR(10) NOT NULL,   -- e.g. "14:00"
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_doctor_schedules_lookup ON public.doctor_schedules(branch_id, date, status);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_doctor ON public.doctor_schedules(doctor_id, date);

-- 1.8 Doctor Assistant Pairings (Scope: BRANCH-SCOPED)
CREATE TABLE IF NOT EXISTS public.doctor_assistant_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.dental_doctors(id) ON DELETE RESTRICT,
  assistant_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  assigned_branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  pairing_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_doc_asst_pair_lookup ON public.doctor_assistant_pairings(assigned_branch_id, pairing_date, is_active);

-- 1.9 Work Shifts (Scope: BRANCH-SCOPED)
CREATE TABLE IF NOT EXISTS public.work_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  name VARCHAR(50) NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_work_shifts_branch ON public.work_shifts(branch_id, active);

-- 1.10 Staff Shift Assignments (Scope: BRANCH-SCOPED)
CREATE TABLE IF NOT EXISTS public.staff_shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  shift_id UUID NOT NULL REFERENCES public.work_shifts(id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_staff_shift_assign_lookup ON public.staff_shift_assignments(branch_id, date, staff_id);

-- =====================================================================
-- 2. PATIENTS & CLINICAL FLOW
-- =====================================================================

-- 2.1 Patient Profiles (Scope: GLOBAL - Patients visit multiple branches)
CREATE TABLE IF NOT EXISTS public.patient_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_record_number VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  full_name VARCHAR(150),
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(100),
  date_of_birth DATE NOT NULL,
  gender VARCHAR(1) NOT NULL CHECK (gender IN ('L', 'P')),
  address TEXT NOT NULL,
  medical_history_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_patient_profiles_rm ON public.patient_profiles(medical_record_number);
CREATE INDEX IF NOT EXISTS idx_patient_profiles_phone ON public.patient_profiles(phone);
CREATE INDEX IF NOT EXISTS idx_patient_profiles_name ON public.patient_profiles(name);

-- 2.2 Bookings (Scope: BRANCH-SCOPED)
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  doctor_id UUID NOT NULL REFERENCES public.dental_doctors(id) ON DELETE RESTRICT,
  service_id UUID REFERENCES public.master_services(id) ON DELETE RESTRICT,
  booking_date_time TIMESTAMPTZ NOT NULL,
  time_slot VARCHAR(20),
  complaint TEXT,
  notes TEXT,
  -- Snapshots for immutable historical representation
  patient_name_snapshot VARCHAR(150),
  doctor_name_snapshot VARCHAR(150),
  branch_name_snapshot VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_bookings_branch_date ON public.bookings(branch_id, booking_date_time);
CREATE INDEX IF NOT EXISTS idx_bookings_patient ON public.bookings(patient_id);
CREATE INDEX IF NOT EXISTS idx_bookings_doctor ON public.bookings(doctor_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);

-- 2.3 Booking Confirmation H-1 (Scope: BRANCH-SCOPED via Booking)
CREATE TABLE IF NOT EXISTS public.booking_confirmations_h1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  confirmation_status VARCHAR(50) NOT NULL DEFAULT 'BELUM_DIHUBUNGI' 
    CHECK (confirmation_status IN ('BELUM_DIHUBUNGI', 'SUDAH_DIHUBUNGI', 'DIKONFIRMASI', 'MINTA_RESCHEDULE', 'BATAL', 'TIDAK_MERESPONS')),
  contacted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_booking_confirm_h1_branch ON public.booking_confirmations_h1(branch_id, confirmation_status);
CREATE INDEX IF NOT EXISTS idx_booking_confirm_h1_booking ON public.booking_confirmations_h1(booking_id);

-- 2.4 Patient Visits (Scope: BRANCH-SCOPED)
-- Walk-in visits have booking_id = NULL
CREATE TABLE IF NOT EXISTS public.patient_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  visit_date_time TIMESTAMPTZ NOT NULL,
  visit_type VARCHAR(30) NOT NULL CHECK (visit_type IN ('BOOKING', 'WALK_IN')),
  visit_status VARCHAR(30) NOT NULL DEFAULT 'WAITING' CHECK (visit_status IN ('WAITING', 'IN_TRIAGE', 'IN_TREATMENT', 'COMPLETED', 'CANCELLED')),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE RESTRICT,
  complaint TEXT,
  doctor_id UUID REFERENCES public.dental_doctors(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_visit_booking_walkin CHECK ((visit_type = 'WALK_IN' AND booking_id IS NULL) OR visit_type = 'BOOKING')
);

CREATE INDEX IF NOT EXISTS idx_patient_visits_branch_date ON public.patient_visits(branch_id, visit_date_time);
CREATE INDEX IF NOT EXISTS idx_patient_visits_patient ON public.patient_visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_visits_doctor ON public.patient_visits(doctor_id);
CREATE INDEX IF NOT EXISTS idx_patient_visits_status ON public.patient_visits(visit_status);

-- 2.5 Queue Items (Scope: BRANCH-SCOPED)
CREATE TABLE IF NOT EXISTS public.queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  doctor_id UUID NOT NULL REFERENCES public.dental_doctors(id) ON DELETE RESTRICT,
  visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE RESTRICT,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE RESTRICT,
  patient_id UUID REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  queue_number VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'WAITING' 
    CHECK (status IN ('WAITING', 'IN_PREPARATION', 'IN_CONSULTATION', 'COMPLETED', 'SKIPPED', 'CALLING', 'CANCELLED')),
  sequence_order INT NOT NULL DEFAULT 1,
  arrival_at TIMESTAMPTZ NOT NULL,
  estimated_service_at TIMESTAMPTZ,
  actual_service_start_at TIMESTAMPTZ,
  actual_service_end_at TIMESTAMPTZ,
  estimated_duration_minutes INT NOT NULL DEFAULT 30,
  -- Snapshots for quick queue board rendering without expensive joins
  patient_name_snapshot VARCHAR(150),
  doctor_name_snapshot VARCHAR(150),
  branch_name_snapshot VARCHAR(100),
  booking_time_snapshot VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_queue_items_active ON public.queue_items(branch_id, doctor_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_items_visit ON public.queue_items(visit_id);

-- 2.6 Treatment Jobs (Scope: BRANCH-SCOPED - MODEL C PIC ASSISTANT)
CREATE TABLE IF NOT EXISTS public.treatment_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  doctor_id UUID NOT NULL REFERENCES public.dental_doctors(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES public.master_services(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'BELUM_DIMULAI'
    CHECK (status IN ('BELUM_DIMULAI', 'DALAM_PROSES', 'SELESAI', 'DISERAHKAN')),
  -- Snapshots
  service_name_snapshot VARCHAR(150) NOT NULL,
  doctor_name_snapshot VARCHAR(150) NOT NULL,
  estimated_duration_minutes INT,
  notes TEXT,
  -- Model C: Ownership and role separation
  assigned_doctor_id UUID REFERENCES public.dental_doctors(id) ON DELETE RESTRICT,
  pic_assistant_id UUID REFERENCES public.staff(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  handed_over_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_treatment_jobs_branch ON public.treatment_jobs(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_treatment_jobs_patient ON public.treatment_jobs(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_jobs_visit ON public.treatment_jobs(visit_id);
CREATE INDEX IF NOT EXISTS idx_treatment_jobs_pic ON public.treatment_jobs(pic_assistant_id);

-- 2.7 Treatment Activities (Scope: BRANCH-SCOPED - Append-only immutable log)
CREATE TABLE IF NOT EXISTS public.treatment_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_id UUID NOT NULL REFERENCES public.treatment_jobs(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL, -- references user_accounts or staff
  actor_role VARCHAR(50) NOT NULL,
  actor_name_snapshot VARCHAR(150) NOT NULL,
  activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('STARTED', 'CONTINUED', 'PROGRESS', 'COMPLETED', 'HANDED_OVER', 'OTHER')),
  activity_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  branch_id UUID REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_treatment_activities_job ON public.treatment_activities(treatment_id, activity_at);
CREATE INDEX IF NOT EXISTS idx_treatment_activities_branch ON public.treatment_activities(branch_id);

-- 2.8 Treatment Visit Links (Scope: BRANCH-SCOPED - Multi-day treatment continuation)
CREATE TABLE IF NOT EXISTS public.treatment_visit_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_job_id UUID NOT NULL REFERENCES public.treatment_jobs(id) ON DELETE RESTRICT,
  visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE RESTRICT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_treatment_visit_link UNIQUE (treatment_job_id, visit_id)
);

CREATE INDEX IF NOT EXISTS idx_treatment_visit_links_job ON public.treatment_visit_links(treatment_job_id);
CREATE INDEX IF NOT EXISTS idx_treatment_visit_links_visit ON public.treatment_visit_links(visit_id);

-- 2.9 Treatment Incentives (Scope: BRANCH-SCOPED)
CREATE TABLE IF NOT EXISTS public.treatment_incentives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_job_id UUID NOT NULL REFERENCES public.treatment_jobs(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  receiver_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ELIGIBLE', 'APPROVED', 'PAID')),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_treatment_incentives_job ON public.treatment_incentives(treatment_job_id);
CREATE INDEX IF NOT EXISTS idx_treatment_incentives_receiver ON public.treatment_incentives(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_treatment_incentives_branch ON public.treatment_incentives(branch_id);

-- =====================================================================
-- 3. INVOICING & PAYMENTS
-- =====================================================================

-- 3.1 Invoices (Scope: BRANCH-SCOPED)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  total_amount BIGINT NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  discount_amount BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  net_amount BIGINT NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
  paid_amount BIGINT NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  outstanding_amount BIGINT NOT NULL DEFAULT 0 CHECK (outstanding_amount >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_invoices_branch_status ON public.invoices(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON public.invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_visit ON public.invoices(visit_id);

-- 3.2 Invoice Items (Scope: BRANCH-SCOPED - Snapshot Principle)
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  service_id UUID REFERENCES public.master_services(id) ON DELETE RESTRICT,
  description_snapshot VARCHAR(200) NOT NULL,
  unit_price_snapshot BIGINT NOT NULL CHECK (unit_price_snapshot >= 0),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);

-- 3.3 Payment Transactions (Scope: BRANCH-SCOPED - Immutable)
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('CASH', 'TRANSFER', 'QRIS', 'OTHER')),
  reference_number VARCHAR(100),
  transaction_date_time TIMESTAMPTZ NOT NULL,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'REFUNDED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice ON public.payment_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_branch ON public.payment_transactions(branch_id, transaction_date_time);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_staff ON public.payment_transactions(staff_id);

-- =====================================================================
-- 4. HR, ATTENDANCE, OVERTIME & PAYROLL
-- =====================================================================

-- 4.1 Staff Compensation Rules (Scope: GLOBAL / STAFF-SCOPED)
CREATE TABLE IF NOT EXISTS public.staff_compensation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  name VARCHAR(100) NOT NULL,
  rule_type_snapshot VARCHAR(50) NOT NULL CHECK (rule_type_snapshot IN ('PERCENTAGE', 'FIXED_PER_TREATMENT', 'BASE_SALARY')),
  value_snapshot NUMERIC(12,2) NOT NULL CHECK (value_snapshot >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_staff_comp_rules_staff ON public.staff_compensation_rules(staff_id, is_active);

-- 4.2 Compensation Accruals (Scope: BRANCH-SCOPED)
CREATE TABLE IF NOT EXISTS public.compensation_accruals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  branch_id UUID REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  rule_id_snapshot VARCHAR(100) NOT NULL,
  rule_type_snapshot VARCHAR(50) NOT NULL,
  value_snapshot NUMERIC(12,2) NOT NULL,
  base_amount_snapshot BIGINT NOT NULL DEFAULT 0,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  source_id VARCHAR(100) NOT NULL, -- e.g. treatmentJobId
  accrued_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_comp_accruals_staff ON public.compensation_accruals(staff_id, accrued_at);
CREATE INDEX IF NOT EXISTS idx_comp_accruals_source ON public.compensation_accruals(source_id);
CREATE INDEX IF NOT EXISTS idx_comp_accruals_branch ON public.compensation_accruals(branch_id);

-- 4.3 Attendances (Scope: BRANCH-SCOPED - Source of Truth for Presence)
CREATE TABLE IF NOT EXISTS public.attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  attendance_status VARCHAR(30) NOT NULL 
    CHECK (attendance_status IN ('PRESENT', 'LATE', 'ABSENT', 'SICK', 'LEAVE', 'OFF')),
  scheduled_start_at VARCHAR(10) NOT NULL, -- e.g. "08:00"
  scheduled_end_at VARCHAR(10) NOT NULL,   -- e.g. "14:00"
  actual_check_in_at TIMESTAMPTZ,
  actual_check_out_at TIMESTAMPTZ,
  late_minutes INT NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
  early_checkout_minutes INT NOT NULL DEFAULT 0 CHECK (early_checkout_minutes >= 0),
  check_in_photo_path TEXT,
  check_out_photo_path TEXT,
  check_in_method VARCHAR(30) DEFAULT 'WEB' CHECK (check_in_method IN ('MANUAL', 'WEB', 'MOBILE')),
  check_out_method VARCHAR(30) CHECK (check_out_method IS NULL OR check_out_method IN ('MANUAL', 'WEB', 'MOBILE')),
  notes TEXT,
  created_by VARCHAR(100),
  updated_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_attendances_lookup ON public.attendances(branch_id, date, staff_id);
CREATE INDEX IF NOT EXISTS idx_attendances_staff_date ON public.attendances(staff_id, date);

-- 4.4 Overtime Records (Scope: BRANCH-SCOPED - Approval State Machine)
CREATE TABLE IF NOT EXISTS public.overtime_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  attendance_id UUID NOT NULL REFERENCES public.attendances(id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  scheduled_end_at VARCHAR(10) NOT NULL,
  actual_end_at VARCHAR(10) NOT NULL,
  overtime_minutes INT NOT NULL CHECK (overtime_minutes >= 0),
  overtime_hours NUMERIC(5,2) NOT NULL CHECK (overtime_hours >= 0),
  overtime_type VARCHAR(30) NOT NULL DEFAULT 'AFTER_SHIFT' CHECK (overtime_type IN ('AFTER_SHIFT')),
  calculation_method VARCHAR(50),
  hourly_rate_snapshot BIGINT CHECK (hourly_rate_snapshot IS NULL OR hourly_rate_snapshot >= 0),
  overtime_amount_snapshot BIGINT CHECK (overtime_amount_snapshot IS NULL OR overtime_amount_snapshot >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'DETECTED' 
    CHECK (status IN ('DETECTED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID')),
  notes TEXT,
  approved_by VARCHAR(100),
  approved_at TIMESTAMPTZ,
  rejected_by VARCHAR(100),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by VARCHAR(100),
  updated_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_overtime_lookup ON public.overtime_records(branch_id, date, status);
CREATE INDEX IF NOT EXISTS idx_overtime_staff ON public.overtime_records(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_overtime_attendance ON public.overtime_records(attendance_id);

-- 4.5 Monthly Payrolls (Scope: BRANCH-SCOPED)
CREATE TABLE IF NOT EXISTS public.monthly_payrolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  branch_id UUID REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INT NOT NULL CHECK (year >= 2020),
  base_salary BIGINT NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
  total_compensation BIGINT NOT NULL DEFAULT 0 CHECK (total_compensation >= 0),
  total_deductions BIGINT NOT NULL DEFAULT 0 CHECK (total_deductions >= 0),
  net_salary BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEW', 'APPROVED', 'PAID')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_monthly_payroll UNIQUE (staff_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_monthly_payrolls_lookup ON public.monthly_payrolls(branch_id, year, month, status);
CREATE INDEX IF NOT EXISTS idx_monthly_payrolls_staff ON public.monthly_payrolls(staff_id);

-- 4.6 Payroll Items (Scope: BRANCH-SCOPED - Snapshot Principle)
CREATE TABLE IF NOT EXISTS public.payroll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id UUID NOT NULL REFERENCES public.monthly_payrolls(id) ON DELETE RESTRICT,
  description_snapshot VARCHAR(200) NOT NULL,
  amount_snapshot BIGINT NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('EARNING', 'DEDUCTION')),
  source_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_payroll_items_payroll ON public.payroll_items(payroll_id);

-- =====================================================================
-- 5. ACCOUNTING & GENERAL LEDGER
-- =====================================================================

-- 5.1 Chart of Accounts (Scope: GLOBAL Master)
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  account_type VARCHAR(30) NOT NULL CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  account_category VARCHAR(50) NOT NULL,
  normal_balance VARCHAR(10) NOT NULL CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_coa_code ON public.chart_of_accounts(code);
CREATE INDEX IF NOT EXISTS idx_coa_type ON public.chart_of_accounts(account_type, account_category);

-- 5.2 Journal Entries (Scope: BRANCH-SCOPED - Immutable when POSTED)
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number VARCHAR(100) NOT NULL UNIQUE,
  journal_date DATE NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('MANUAL', 'INVOICE', 'PAYMENT', 'COMPENSATION', 'PAYROLL', 'EXPENSE', 'ADJUSTMENT')),
  source_id VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'VOID')),
  total_debit BIGINT NOT NULL DEFAULT 0 CHECK (total_debit >= 0),
  total_credit BIGINT NOT NULL DEFAULT 0 CHECK (total_credit >= 0),
  created_by VARCHAR(100) NOT NULL,
  posted_at TIMESTAMPTZ,
  posted_by VARCHAR(100),
  voided_at TIMESTAMPTZ,
  voided_by VARCHAR(100),
  void_reason TEXT,
  event VARCHAR(50) CHECK (event IS NULL OR event IN ('ACCRUAL', 'PAYMENT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_journal_balanced_when_posted CHECK (status != 'POSTED' OR total_debit = total_credit)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_lookup ON public.journal_entries(branch_id, journal_date, status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON public.journal_entries(source_type, source_id);

-- 5.3 Journal Lines (Scope: BRANCH-SCOPED - Atomic Double-Entry Posting)
CREATE TABLE IF NOT EXISTS public.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  debit BIGINT NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit BIGINT NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_journal_line_nonzero CHECK (debit > 0 OR credit > 0)
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON public.journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_branch ON public.journal_lines(account_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_branch ON public.journal_lines(branch_id);

-- 5.4 Branch Operational Expenses (Scope: BRANCH-SCOPED - Section 24 Readiness)
-- Prepares database-level support for branch expenses (Electricity, Stationery, Water, etc.)
-- connected directly to accounting journals without introducing premature UI logic.
CREATE TABLE IF NOT EXISTS public.branch_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  expense_date DATE NOT NULL,
  category VARCHAR(50) NOT NULL, -- e.g. UTILITIES_EXPENSE, SUPPLIES_EXPENSE, etc.
  description TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  expense_account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  payment_account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  receipt_photo_path TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'RECORDED' CHECK (status IN ('RECORDED', 'POSTED', 'VOID')),
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_branch_expenses_branch ON public.branch_expenses(branch_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_branch_expenses_journal ON public.branch_expenses(journal_entry_id);

-- =====================================================================
-- 6. VIEWS FOR FINANCIAL & REPORTING AGGREGATION
-- =====================================================================

-- 6.1 General Ledger View (Derived on-demand from posted journals and lines)
CREATE OR REPLACE VIEW public.v_general_ledger AS
SELECT 
  je.id AS journal_id,
  je.journal_number,
  je.journal_date,
  jl.id AS line_id,
  coa.id AS account_id,
  coa.code AS account_code,
  coa.name AS account_name,
  coa.account_type,
  coa.account_category,
  coa.normal_balance,
  jl.branch_id,
  COALESCE(jl.description, je.description) AS description,
  jl.debit,
  jl.credit,
  je.source_type,
  je.source_id,
  je.posted_at
FROM public.journal_lines jl
JOIN public.journal_entries je ON jl.journal_entry_id = je.id
JOIN public.chart_of_accounts coa ON jl.account_id = coa.id
WHERE je.status = 'POSTED';

-- End of migration
-- =====================================================================
-- PHASE 10A — LALA DENTIST SUPABASE PRODUCTION EXTENSIONS & SECURITY
-- Migration: 20260924000000_phase10a_medical_promotions_backup_storage.sql
-- 
-- DESCRIPTION:
-- Extends the database schema with Clinical Medical Records, Promotion Media,
-- Automated Backup Jobs & Manifests catalog, Storage Object Metadata tracking,
-- and comprehensive Row-Level Security (RLS) policies for complete branch isolation
-- and RBAC enforcement on PostgreSQL.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. CLINICAL MEDICAL RECORDS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.clinical_medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  doctor_id UUID NOT NULL REFERENCES public.dental_doctors(id) ON DELETE RESTRICT,
  assistant_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  anamnesis TEXT NOT NULL,
  physical_examination TEXT NOT NULL,
  odontogram JSONB NOT NULL DEFAULT '[]'::jsonb,
  diagnosis_icd10 JSONB NOT NULL DEFAULT '[]'::jsonb,
  treatment_notes TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINAL')),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  signed_by_doctor_id UUID REFERENCES public.dental_doctors(id) ON DELETE RESTRICT,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_medical_records_patient ON public.clinical_medical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_visit ON public.clinical_medical_records(visit_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_branch ON public.clinical_medical_records(branch_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_doctor ON public.clinical_medical_records(doctor_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_status ON public.clinical_medical_records(status);

-- =====================================================================
-- 2. PROMOTION MEDIA TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.promotion_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  branch_id UUID REFERENCES public.dental_branches(id) ON DELETE CASCADE, -- NULL = GLOBAL promotion
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 1 CHECK (display_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_promotion_media_branch ON public.promotion_media(branch_id);
CREATE INDEX IF NOT EXISTS idx_promotion_media_active ON public.promotion_media(is_active);
CREATE INDEX IF NOT EXISTS idx_promotion_media_order ON public.promotion_media(display_order);

-- =====================================================================
-- 3. AUTOMATED BACKUP JOBS & MANIFESTS CATALOG
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.backup_jobs (
  id VARCHAR(100) PRIMARY KEY,
  backup_type VARCHAR(30) NOT NULL CHECK (backup_type IN ('DATABASE', 'MEDIA', 'FULL')),
  interval_type VARCHAR(30) NOT NULL CHECK (interval_type IN ('DAILY', 'WEEKLY', 'MONTHLY')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'VERIFIED')),
  size_bytes BIGINT,
  destination TEXT NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'GOOGLE_DRIVE',
  checksum VARCHAR(100),
  error_message TEXT,
  manifest JSONB,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  verification_notes TEXT,
  triggered_by VARCHAR(50) NOT NULL DEFAULT 'SYSTEM_SCHEDULE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_backup_jobs_status ON public.backup_jobs(status);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_type ON public.backup_jobs(backup_type);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_created ON public.backup_jobs(created_at DESC);

-- =====================================================================
-- 4. STORAGE METADATA TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.storage_objects_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_name VARCHAR(100) NOT NULL,
  object_path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  branch_id UUID REFERENCES public.dental_branches(id) ON DELETE SET NULL,
  checksum VARCHAR(100),
  uploaded_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_storage_bucket_path UNIQUE (bucket_name, object_path)
);

CREATE INDEX IF NOT EXISTS idx_storage_meta_branch ON public.storage_objects_meta(branch_id);
CREATE INDEX IF NOT EXISTS idx_storage_meta_bucket ON public.storage_objects_meta(bucket_name);

-- =====================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================

ALTER TABLE public.clinical_medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_objects_meta ENABLE ROW LEVEL SECURITY;

-- 5.1 Medical Records RLS
DROP POLICY IF EXISTS "Super Admin can manage all medical records" ON public.clinical_medical_records;
CREATE POLICY "Super Admin can manage all medical records"
ON public.clinical_medical_records
FOR ALL
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPER_ADMIN');

DROP POLICY IF EXISTS "Doctors can view and manage branch medical records" ON public.clinical_medical_records;
CREATE POLICY "Doctors can view and manage branch medical records"
ON public.clinical_medical_records
FOR ALL
TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'DOCTOR'
  AND branch_id::text = (auth.jwt() -> 'app_metadata' ->> 'assigned_branch_id')
);

DROP POLICY IF EXISTS "Assistants and Branch Admins can view own branch medical records" ON public.clinical_medical_records;
CREATE POLICY "Assistants and Branch Admins can view own branch medical records"
ON public.clinical_medical_records
FOR SELECT
TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') IN ('DOCTOR_ASSISTANT', 'BRANCH_ADMIN')
  AND branch_id::text = (auth.jwt() -> 'app_metadata' ->> 'assigned_branch_id')
);

-- 5.2 Promotion Media RLS
DROP POLICY IF EXISTS "Super Admin full control on promotion media" ON public.promotion_media;
CREATE POLICY "Super Admin full control on promotion media"
ON public.promotion_media
FOR ALL
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPER_ADMIN');

DROP POLICY IF EXISTS "All users can view active promotions" ON public.promotion_media;
CREATE POLICY "All users can view active promotions"
ON public.promotion_media
FOR SELECT
TO public
USING (is_active = true);

-- 5.3 Backup Jobs RLS (Strict Super Admin Only)
DROP POLICY IF EXISTS "Super Admin full control on backup jobs" ON public.backup_jobs;
CREATE POLICY "Super Admin full control on backup jobs"
ON public.backup_jobs
FOR ALL
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPER_ADMIN');

-- End of Phase 10A migration
