BEGIN;

ALTER TABLE public.master_services
  ADD COLUMN IF NOT EXISTS clinical_category TEXT,
  ADD COLUMN IF NOT EXISTS clinical_target TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS requires_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_multi_stage BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tracks_material_lots BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS icd9cm_code TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.master_services'::regclass
      AND conname = 'master_services_clinical_category_check'
  ) THEN
    ALTER TABLE public.master_services
      ADD CONSTRAINT master_services_clinical_category_check
      CHECK (clinical_category IS NULL OR clinical_category IN (
        'PREVENTIVE', 'RESTORATIVE', 'SURGERY', 'ENDODONTIC',
        'PROSTHODONTIC', 'ORTHODONTIC', 'OTHER'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.master_services'::regclass
      AND conname = 'master_services_clinical_target_check'
  ) THEN
    ALTER TABLE public.master_services
      ADD CONSTRAINT master_services_clinical_target_check
      CHECK (clinical_target IN ('TOOTH', 'JAW', 'TOOTH_OR_REGION', 'NONE', 'ADMIN', 'FREE_TEXT'));
  END IF;
END;
$$;

UPDATE public.master_services AS service
SET clinical_category = catalog.clinical_category,
    clinical_target = catalog.clinical_target,
    requires_consent = catalog.requires_consent,
    is_multi_stage = catalog.is_multi_stage,
    tracks_material_lots = catalog.tracks_material_lots
FROM (VALUES
  ('CONSULTATION', 'OTHER', 'NONE', false, false, false),
  ('SCALING', 'PREVENTIVE', 'JAW', false, false, false),
  ('FILLING_PERMANENT', 'RESTORATIVE', 'TOOTH', false, false, false),
  ('EXTRACTION', 'SURGERY', 'TOOTH', true, false, false),
  ('BLEACHING', 'OTHER', 'JAW', true, false, false),
  ('BRACKET_REMOVE', 'ORTHODONTIC', 'TOOTH', false, false, false),
  ('BRACKET_CONTROL_FULL', 'ORTHODONTIC', 'JAW', false, true, false),
  ('BRACKET_CONTROL_SINGLE', 'ORTHODONTIC', 'JAW', false, true, false),
  ('ABSCESS_DRAINAGE', 'SURGERY', 'TOOTH_OR_REGION', true, false, false),
  ('GIPAL_INSERTION', 'PROSTHODONTIC', 'TOOTH_OR_REGION', true, true, false),
  ('GIPAL_CEMENTATION', 'PROSTHODONTIC', 'TOOTH', false, true, false),
  ('MEDICATION', 'OTHER', 'FREE_TEXT', false, false, false),
  ('ODONTECTOMY', 'SURGERY', 'TOOTH', true, false, false),
  ('WIRE_CUT', 'ORTHODONTIC', 'JAW', false, false, false),
  ('POLYP_REMOVAL', 'SURGERY', 'TOOTH_OR_REGION', true, false, false),
  ('ROP', 'ENDODONTIC', 'TOOTH', true, true, false),
  ('VENEER', 'RESTORATIVE', 'TOOTH', true, false, false),
  ('GIPAL_SETTLEMENT', 'PROSTHODONTIC', 'ADMIN', false, false, false),
  ('ABSCESS', 'SURGERY', 'TOOTH_OR_REGION', true, false, false),
  ('OTHER', 'OTHER', 'FREE_TEXT', false, false, false),
  ('ROOT_CANAL', 'ENDODONTIC', 'TOOTH', true, true, false)
) AS catalog(code, clinical_category, clinical_target, requires_consent, is_multi_stage, tracks_material_lots)
WHERE service.code = catalog.code;

CREATE TABLE IF NOT EXISTS public.patient_medical_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL UNIQUE REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  branch_id UUID REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  blood_type TEXT CHECK (blood_type IS NULL OR blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  allergies TEXT,
  systemic_diseases TEXT,
  routine_medications TEXT,
  medical_warnings TEXT,
  medical_history_notes TEXT,
  updated_by UUID REFERENCES public.user_accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_patient_medical_profiles_branch_patient
  ON public.patient_medical_profiles(branch_id, patient_id);

REVOKE ALL ON TABLE public.patient_medical_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.patient_medical_profiles TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'patient_profiles'
      AND column_name = 'medical_history_notes'
  ) THEN
    INSERT INTO public.patient_medical_profiles AS existing_profile (
      patient_id,
      branch_id,
      medical_history_notes
    )
    SELECT patient.id, patient.registered_branch_id, patient.medical_history_notes
    FROM public.patient_profiles AS patient
    WHERE NULLIF(BTRIM(patient.medical_history_notes), '') IS NOT NULL
    ON CONFLICT (patient_id) DO UPDATE
    SET medical_history_notes = COALESCE(
          NULLIF(existing_profile.medical_history_notes, ''),
          EXCLUDED.medical_history_notes
        ),
        branch_id = COALESCE(existing_profile.branch_id, EXCLUDED.branch_id),
        updated_at = timezone('utc'::text, now());
  END IF;
END;
$$;

ALTER TABLE public.patient_profiles
  DROP COLUMN IF EXISTS medical_history_notes;

ALTER TABLE public.patient_medical_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patient medical profile doctor read" ON public.patient_medical_profiles;
DROP POLICY IF EXISTS "Patient medical profile doctor insert" ON public.patient_medical_profiles;
DROP POLICY IF EXISTS "Patient medical profile doctor update" ON public.patient_medical_profiles;

CREATE POLICY "Patient medical profile doctor read"
  ON public.patient_medical_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'DOCTOR'
      AND (
        public.user_can_manage_treatment_branch(branch_id)
        OR (
          branch_id IS NULL
          AND EXISTS (
          SELECT 1
          FROM public.patient_visits visit
          WHERE visit.patient_id = patient_medical_profiles.patient_id
            AND public.user_can_manage_treatment_branch(visit.branch_id)
          )
        )
      )
    )
  );

CREATE POLICY "Patient medical profile doctor insert"
  ON public.patient_medical_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'DOCTOR'
      AND (
        public.user_can_manage_treatment_branch(branch_id)
        OR (
          branch_id IS NULL
          AND EXISTS (
          SELECT 1
          FROM public.patient_visits visit
          WHERE visit.patient_id = patient_medical_profiles.patient_id
            AND public.user_can_manage_treatment_branch(visit.branch_id)
          )
        )
      )
    )
  );

CREATE POLICY "Patient medical profile doctor update"
  ON public.patient_medical_profiles
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'DOCTOR'
      AND (
        public.user_can_manage_treatment_branch(branch_id)
        OR (
          branch_id IS NULL
          AND EXISTS (
          SELECT 1
          FROM public.patient_visits visit
          WHERE visit.patient_id = patient_medical_profiles.patient_id
            AND public.user_can_manage_treatment_branch(visit.branch_id)
          )
        )
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'DOCTOR'
      AND (
        public.user_can_manage_treatment_branch(branch_id)
        OR (
          branch_id IS NULL
          AND EXISTS (
          SELECT 1
          FROM public.patient_visits visit
          WHERE visit.patient_id = patient_medical_profiles.patient_id
            AND public.user_can_manage_treatment_branch(visit.branch_id)
          )
        )
      )
    )
  );

ALTER TABLE public.clinical_medical_records
  ADD COLUMN IF NOT EXISTS medical_history_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vital_signs JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS clinical_examination_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS soap_subjective TEXT,
  ADD COLUMN IF NOT EXISTS soap_objective TEXT,
  ADD COLUMN IF NOT EXISTS soap_assessment TEXT,
  ADD COLUMN IF NOT EXISTS soap_plan TEXT;

CREATE TABLE IF NOT EXISTS public.treatment_job_clinical_details (
  treatment_job_id UUID PRIMARY KEY REFERENCES public.treatment_jobs(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  tooth_numbers SMALLINT[],
  surfaces TEXT[],
  jaw TEXT,
  stage_number SMALLINT,
  stage_total SMALLINT,
  icd9cm_code TEXT,
  sterile_pack_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_treatment_job_clinical_details_branch
  ON public.treatment_job_clinical_details(branch_id);

REVOKE ALL ON TABLE public.treatment_job_clinical_details FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.treatment_job_clinical_details TO authenticated;
ALTER TABLE public.treatment_job_clinical_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Treatment clinical details doctor read" ON public.treatment_job_clinical_details;
DROP POLICY IF EXISTS "Treatment clinical details doctor insert" ON public.treatment_job_clinical_details;
DROP POLICY IF EXISTS "Treatment clinical details doctor update" ON public.treatment_job_clinical_details;

CREATE POLICY "Treatment clinical details doctor read"
  ON public.treatment_job_clinical_details
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.get_user_role() = 'DOCTOR' AND public.user_can_manage_treatment_branch(branch_id))
  );

CREATE POLICY "Treatment clinical details doctor insert"
  ON public.treatment_job_clinical_details
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (public.get_user_role() = 'DOCTOR' AND public.user_can_manage_treatment_branch(branch_id))
  );

CREATE POLICY "Treatment clinical details doctor update"
  ON public.treatment_job_clinical_details
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.get_user_role() = 'DOCTOR' AND public.user_can_manage_treatment_branch(branch_id))
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.get_user_role() = 'DOCTOR' AND public.user_can_manage_treatment_branch(branch_id))
  );

CREATE OR REPLACE FUNCTION public.enforce_treatment_job_clinical_details_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  treatment_branch_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Rincian klinis tindakan tidak dapat dihapus.';
  END IF;

  SELECT treatment.branch_id
  INTO treatment_branch_id
  FROM public.treatment_jobs AS treatment
  WHERE treatment.id = NEW.treatment_job_id;

  IF treatment_branch_id IS DISTINCT FROM NEW.branch_id THEN
    RAISE EXCEPTION 'Cabang rincian klinis harus sama dengan cabang tindakan.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_treatment_job_clinical_details_integrity
  ON public.treatment_job_clinical_details;
CREATE TRIGGER trg_enforce_treatment_job_clinical_details_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON public.treatment_job_clinical_details
  FOR EACH ROW EXECUTE FUNCTION public.enforce_treatment_job_clinical_details_integrity();

CREATE TABLE IF NOT EXISTS public.clinical_medical_record_addenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_record_id UUID NOT NULL REFERENCES public.clinical_medical_records(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  author_doctor_id UUID NOT NULL REFERENCES public.dental_doctors(id) ON DELETE RESTRICT,
  correction_reason TEXT NOT NULL CHECK (BTRIM(correction_reason) <> ''),
  addendum_text TEXT NOT NULL CHECK (BTRIM(addendum_text) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_clinical_record_addenda_record
  ON public.clinical_medical_record_addenda(medical_record_id, created_at);

REVOKE ALL ON TABLE public.clinical_medical_record_addenda FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.clinical_medical_record_addenda TO authenticated;
ALTER TABLE public.clinical_medical_record_addenda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinical record addenda doctor read" ON public.clinical_medical_record_addenda;
DROP POLICY IF EXISTS "Clinical record addenda doctor insert" ON public.clinical_medical_record_addenda;

CREATE POLICY "Clinical record addenda doctor read"
  ON public.clinical_medical_record_addenda
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.get_user_role() = 'DOCTOR' AND public.user_can_manage_treatment_branch(branch_id))
  );

CREATE POLICY "Clinical record addenda doctor insert"
  ON public.clinical_medical_record_addenda
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role() = 'DOCTOR'
    AND public.user_can_manage_treatment_branch(branch_id)
  );

CREATE OR REPLACE FUNCTION public.enforce_clinical_medical_record_addendum_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  record_branch_id UUID;
  record_status TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Addendum rekam medis bersifat permanen dan tidak dapat diubah atau dihapus.';
  END IF;

  SELECT record.branch_id, record.status
  INTO record_branch_id, record_status
  FROM public.clinical_medical_records AS record
  WHERE record.id = NEW.medical_record_id;

  IF record_status IS DISTINCT FROM 'FINAL'
     OR record_branch_id IS DISTINCT FROM NEW.branch_id
     OR public.get_user_role() <> 'DOCTOR'
     OR NOT public.user_can_manage_treatment_branch(NEW.branch_id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.user_accounts account
       JOIN public.dental_doctors doctor
         ON doctor.staff_id::text = account.staff_id
       WHERE account.auth_user_id = auth.uid()
         AND account.active = true
         AND account.role = 'DOCTOR'
         AND doctor.id = NEW.author_doctor_id
     ) THEN
    RAISE EXCEPTION 'Addendum hanya dapat dibuat dokter berwenang untuk rekam medis final pada cabangnya.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_clinical_medical_record_addendum_integrity
  ON public.clinical_medical_record_addenda;
CREATE TRIGGER trg_enforce_clinical_medical_record_addendum_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON public.clinical_medical_record_addenda
  FOR EACH ROW EXECUTE FUNCTION public.enforce_clinical_medical_record_addendum_integrity();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.treatment_job_clinical_details'::regclass
      AND conname = 'treatment_job_clinical_details_tooth_numbers_fdi_check'
  ) THEN
    ALTER TABLE public.treatment_job_clinical_details
      ADD CONSTRAINT treatment_job_clinical_details_tooth_numbers_fdi_check
      CHECK (
        tooth_numbers IS NULL OR tooth_numbers <@ ARRAY[
          11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,
          31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48,
          51,52,53,54,55,61,62,63,64,65,71,72,73,74,75,81,82,83,84,85
        ]::SMALLINT[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.treatment_job_clinical_details'::regclass
      AND conname = 'treatment_job_clinical_details_surfaces_check'
  ) THEN
    ALTER TABLE public.treatment_job_clinical_details
      ADD CONSTRAINT treatment_job_clinical_details_surfaces_check
      CHECK (surfaces IS NULL OR surfaces <@ ARRAY['O', 'M', 'D', 'B', 'F', 'L', 'P']::TEXT[]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.treatment_job_clinical_details'::regclass
      AND conname = 'treatment_job_clinical_details_jaw_check'
  ) THEN
    ALTER TABLE public.treatment_job_clinical_details
      ADD CONSTRAINT treatment_job_clinical_details_jaw_check
      CHECK (jaw IS NULL OR jaw IN ('RA', 'RB', 'BOTH'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.treatment_job_clinical_details'::regclass
      AND conname = 'treatment_job_clinical_details_stage_pair_check'
  ) THEN
    ALTER TABLE public.treatment_job_clinical_details
      ADD CONSTRAINT treatment_job_clinical_details_stage_pair_check
      CHECK (
        (stage_number IS NULL AND stage_total IS NULL)
        OR (
          stage_number IS NOT NULL
          AND stage_total IS NOT NULL
          AND stage_number >= 1
          AND stage_total >= stage_number
        )
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_clinical_medical_record_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Rekam medis tidak dapat dihapus; gunakan addendum untuk koreksi.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' OR NEW.is_locked OR NEW.signed_at IS NOT NULL
       OR NEW.signed_by_doctor_id IS NOT NULL THEN
      RAISE EXCEPTION 'Rekam medis harus dibuat sebagai draft sebelum ditandatangani.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'FINAL' OR OLD.is_locked OR OLD.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Rekam medis final terkunci; gunakan addendum untuk koreksi.';
  END IF;

  IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.visit_id IS DISTINCT FROM OLD.visit_id
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id THEN
    RAISE EXCEPTION 'Identitas pasien, kunjungan, cabang, dan dokter pada rekam medis tidak dapat diubah.';
  END IF;

  IF NEW.status = 'FINAL' THEN
    IF public.get_user_role() <> 'DOCTOR'
       OR NEW.signed_at IS NULL
       OR NEW.signed_by_doctor_id IS DISTINCT FROM NEW.doctor_id
       OR NOT EXISTS (
         SELECT 1
         FROM public.user_accounts account
         JOIN public.dental_doctors doctor
           ON doctor.staff_id::text = account.staff_id
         WHERE account.auth_user_id = auth.uid()
           AND account.active = true
           AND account.role = 'DOCTOR'
           AND doctor.id = NEW.doctor_id
       ) THEN
      RAISE EXCEPTION 'Hanya dokter penanggung jawab yang dapat menandatangani rekam medis.';
    END IF;
    NEW.is_locked := true;
  ELSE
    NEW.is_locked := false;
    NEW.signed_by_doctor_id := NULL;
    NEW.signed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_clinical_medical_record_integrity ON public.clinical_medical_records;
CREATE TRIGGER trg_enforce_clinical_medical_record_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON public.clinical_medical_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_clinical_medical_record_integrity();

ALTER TABLE public.clinical_medical_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Medical record read isolation" ON public.clinical_medical_records;
DROP POLICY IF EXISTS "Medical record doctor manage" ON public.clinical_medical_records;
DROP POLICY IF EXISTS "Authenticated manage medical records" ON public.clinical_medical_records;
DROP POLICY IF EXISTS "Doctors read all patient medical records" ON public.clinical_medical_records;
DROP POLICY IF EXISTS "Super Admin can manage all medical records" ON public.clinical_medical_records;
DROP POLICY IF EXISTS "Doctors can view and manage branch medical records" ON public.clinical_medical_records;
DROP POLICY IF EXISTS "Assistants and Branch Admins can view own branch medical records" ON public.clinical_medical_records;
DROP POLICY IF EXISTS "Clinical records doctor read" ON public.clinical_medical_records;
DROP POLICY IF EXISTS "Clinical records doctor insert" ON public.clinical_medical_records;
DROP POLICY IF EXISTS "Clinical records doctor update" ON public.clinical_medical_records;

CREATE POLICY "Clinical records doctor read"
  ON public.clinical_medical_records
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.get_user_role() = 'DOCTOR' AND public.user_can_manage_treatment_branch(branch_id))
  );

CREATE POLICY "Clinical records doctor insert"
  ON public.clinical_medical_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.is_super_admin() OR (public.get_user_role() = 'DOCTOR' AND public.user_can_manage_treatment_branch(branch_id)))
    AND status = 'DRAFT'
    AND NOT is_locked
    AND signed_at IS NULL
    AND signed_by_doctor_id IS NULL
  );

CREATE POLICY "Clinical records doctor update"
  ON public.clinical_medical_records
  FOR UPDATE
  TO authenticated
  USING (
    status = 'DRAFT'
    AND NOT is_locked
    AND signed_at IS NULL
    AND (
      public.is_super_admin()
      OR (public.get_user_role() = 'DOCTOR' AND public.user_can_manage_treatment_branch(branch_id))
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.get_user_role() = 'DOCTOR' AND public.user_can_manage_treatment_branch(branch_id))
  );

REVOKE DELETE ON TABLE public.clinical_medical_records FROM PUBLIC, anon, authenticated;

COMMIT;
