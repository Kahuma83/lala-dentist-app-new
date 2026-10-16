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
