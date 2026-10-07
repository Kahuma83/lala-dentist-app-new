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
