BEGIN;

CREATE OR REPLACE FUNCTION public.get_authenticated_doctor_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT account.doctor_id
  FROM public.user_accounts AS account
  JOIN public.dental_doctors AS doctor ON doctor.id = account.doctor_id
  WHERE account.auth_user_id = auth.uid()
    AND account.active = TRUE
    AND account.role = 'DOCTOR'
    AND doctor.active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.doctor_can_access_patient(target_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_doctor_id UUID;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role() <> 'DOCTOR' THEN
    RETURN FALSE;
  END IF;

  current_doctor_id := public.get_authenticated_doctor_id();
  IF current_doctor_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.patient_visits AS visit
    WHERE visit.patient_id = target_patient_id
      AND visit.doctor_id = current_doctor_id
      AND visit.visit_status <> 'CANCELLED'
      AND public.user_can_manage_treatment_branch(visit.branch_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.bookings AS booking
    WHERE booking.patient_id = target_patient_id
      AND booking.doctor_id = current_doctor_id
      AND booking.status IN ('PENDING', 'CONFIRMED')
      AND booking.booking_date_time >= now() - INTERVAL '1 day'
      AND public.user_can_manage_treatment_branch(booking.branch_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.treatment_jobs AS job
    WHERE job.patient_id = target_patient_id
      AND COALESCE(job.assigned_doctor_id, job.doctor_id) = current_doctor_id
      AND public.user_can_manage_treatment_branch(job.branch_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_can_manage_clinical_visit(
  target_visit_id UUID,
  target_branch_id UUID,
  target_doctor_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN auth.uid() IS NOT NULL
    AND public.get_user_role() = 'DOCTOR'
    AND target_doctor_id = public.get_authenticated_doctor_id()
    AND public.user_can_manage_treatment_branch(target_branch_id)
    AND EXISTS (
      SELECT 1
      FROM public.patient_visits AS visit
      WHERE visit.id = target_visit_id
        AND visit.branch_id = target_branch_id
        AND visit.doctor_id = target_doctor_id
        AND visit.visit_status <> 'CANCELLED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_authenticated_doctor_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_can_access_patient(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_can_manage_clinical_visit(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_authenticated_doctor_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_can_access_patient(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_can_manage_clinical_visit(UUID, UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "Doctors read all global patient profiles" ON public.patient_profiles;
DROP POLICY IF EXISTS "Branch staff read patient profiles" ON public.patient_profiles;
DROP POLICY IF EXISTS "Staff read patients" ON public.patient_profiles;
DROP POLICY IF EXISTS "Branch staff update patient profiles" ON public.patient_profiles;
DROP POLICY IF EXISTS "Doctors update assigned patient profiles" ON public.patient_profiles;
DROP POLICY IF EXISTS "Patients update own profile" ON public.patient_profiles;
DROP POLICY IF EXISTS "Patient profiles super admin read" ON public.patient_profiles;
DROP POLICY IF EXISTS "Branch staff read assigned patient profiles" ON public.patient_profiles;
DROP POLICY IF EXISTS "Doctors read assigned patient profiles" ON public.patient_profiles;
DROP POLICY IF EXISTS "Patients read own profile" ON public.patient_profiles;

CREATE POLICY "Patient profiles super admin read"
  ON public.patient_profiles
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "Branch staff read assigned patient profiles"
  ON public.patient_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR_ASSISTANT')
    AND (
      (registered_branch_id IS NOT NULL AND public.user_can_access_branch(registered_branch_id))
      OR EXISTS (
        SELECT 1 FROM public.patient_visits AS visit
        WHERE visit.patient_id = patient_profiles.id
          AND public.user_can_access_branch(visit.branch_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.bookings AS booking
        WHERE booking.patient_id = patient_profiles.id
          AND public.user_can_access_branch(booking.branch_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.queue_items AS queue
        WHERE queue.patient_id = patient_profiles.id
          AND public.user_can_access_branch(queue.branch_id)
      )
    )
  );

CREATE POLICY "Doctors read assigned patient profiles"
  ON public.patient_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.doctor_can_access_patient(patient_profiles.id)
  );

CREATE POLICY "Patients read own profile"
  ON public.patient_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'PATIENT'
    AND id::TEXT = public.get_user_patient_id()::TEXT
  );

CREATE POLICY "Branch staff update patient profiles"
  ON public.patient_profiles
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR_ASSISTANT')
      AND (
        (registered_branch_id IS NOT NULL AND public.user_can_access_branch(registered_branch_id))
        OR EXISTS (
          SELECT 1 FROM public.patient_visits AS visit
          WHERE visit.patient_id = patient_profiles.id
            AND public.user_can_access_branch(visit.branch_id)
        )
        OR EXISTS (
          SELECT 1 FROM public.bookings AS booking
          WHERE booking.patient_id = patient_profiles.id
            AND public.user_can_access_branch(booking.branch_id)
        )
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR_ASSISTANT')
      AND registered_branch_id IS NOT NULL
      AND public.user_can_access_branch(registered_branch_id)
    )
  );

CREATE POLICY "Doctors update assigned patient profiles"
  ON public.patient_profiles
  FOR UPDATE
  TO authenticated
  USING (public.doctor_can_access_patient(id))
  WITH CHECK (public.doctor_can_access_patient(id));

CREATE POLICY "Patients update own profile"
  ON public.patient_profiles
  FOR UPDATE
  TO authenticated
  USING (
    public.get_user_role() = 'PATIENT'
    AND id::TEXT = public.get_user_patient_id()::TEXT
  )
  WITH CHECK (
    public.get_user_role() = 'PATIENT'
    AND id::TEXT = public.get_user_patient_id()::TEXT
  );

DROP POLICY IF EXISTS "Doctors read all patient visits" ON public.patient_visits;
DROP POLICY IF EXISTS "Visit branch isolation" ON public.patient_visits;
DROP POLICY IF EXISTS "Visit branch staff manage" ON public.patient_visits;
DROP POLICY IF EXISTS "Visit assigned doctor manage" ON public.patient_visits;
DROP POLICY IF EXISTS "Visit assigned doctor read" ON public.patient_visits;
DROP POLICY IF EXISTS "Patient read own visits" ON public.patient_visits;

CREATE POLICY "Visit branch staff manage"
  ON public.patient_visits
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR_ASSISTANT')
      AND branch_id = public.get_user_branch_id()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR_ASSISTANT')
      AND branch_id = public.get_user_branch_id()
    )
  );

CREATE POLICY "Visit assigned doctor manage"
  ON public.patient_visits
  FOR ALL
  TO authenticated
  USING (
    public.doctor_can_manage_clinical_visit(id, branch_id, doctor_id)
  )
  WITH CHECK (
    public.doctor_can_manage_clinical_visit(id, branch_id, doctor_id)
  );

CREATE POLICY "Visit assigned doctor read"
  ON public.patient_visits
  FOR SELECT
  TO authenticated
  USING (
    public.doctor_can_access_patient(patient_id)
    AND public.user_can_manage_treatment_branch(branch_id)
  );

CREATE POLICY "Patient read own visits"
  ON public.patient_visits
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'PATIENT'
    AND patient_id = public.get_user_patient_id()
  );

DROP POLICY IF EXISTS "Booking branch isolation select" ON public.bookings;
DROP POLICY IF EXISTS "Booking staff branch isolation manage" ON public.bookings;
DROP POLICY IF EXISTS "Booking assigned doctor read" ON public.bookings;
DROP POLICY IF EXISTS "Booking assigned doctor manage" ON public.bookings;
DROP POLICY IF EXISTS "Booking patient read own" ON public.bookings;

CREATE POLICY "Booking branch staff manage"
  ON public.bookings
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR_ASSISTANT')
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR_ASSISTANT')
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
    )
  );

CREATE POLICY "Booking assigned doctor manage"
  ON public.bookings
  FOR ALL
  TO authenticated
  USING (
    public.get_user_role() = 'DOCTOR'
    AND doctor_id = public.get_authenticated_doctor_id()
    AND public.user_can_manage_treatment_branch(branch_id)
  )
  WITH CHECK (
    public.get_user_role() = 'DOCTOR'
    AND doctor_id = public.get_authenticated_doctor_id()
    AND public.user_can_manage_treatment_branch(branch_id)
  );

CREATE POLICY "Booking assigned doctor read"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'DOCTOR'
    AND doctor_id = public.get_authenticated_doctor_id()
    AND public.user_can_manage_treatment_branch(branch_id)
  );

CREATE POLICY "Booking patient read own"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'PATIENT'
    AND patient_id::TEXT = public.get_user_patient_id()::TEXT
  );

DROP POLICY IF EXISTS "Patient medical profile doctor read" ON public.patient_medical_profiles;
CREATE POLICY "Patient medical profile doctor read"
  ON public.patient_medical_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.doctor_can_access_patient(patient_id)
      AND (branch_id IS NULL OR public.user_can_manage_treatment_branch(branch_id))
    )
  );

DROP POLICY IF EXISTS "Patient medical profile doctor insert" ON public.patient_medical_profiles;
CREATE POLICY "Patient medical profile doctor insert"
  ON public.patient_medical_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.doctor_can_access_patient(patient_id)
      AND (branch_id IS NULL OR public.user_can_manage_treatment_branch(branch_id))
    )
  );

DROP POLICY IF EXISTS "Patient medical profile doctor update" ON public.patient_medical_profiles;
CREATE POLICY "Patient medical profile doctor update"
  ON public.patient_medical_profiles
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.doctor_can_access_patient(patient_id)
      AND (branch_id IS NULL OR public.user_can_manage_treatment_branch(branch_id))
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.doctor_can_access_patient(patient_id)
      AND (branch_id IS NULL OR public.user_can_manage_treatment_branch(branch_id))
    )
  );

DROP POLICY IF EXISTS "Clinical records doctor read" ON public.clinical_medical_records;
CREATE POLICY "Clinical records doctor read"
  ON public.clinical_medical_records
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.doctor_can_access_patient(patient_id)
      AND public.user_can_manage_treatment_branch(branch_id)
    )
  );

DROP POLICY IF EXISTS "Clinical records doctor insert" ON public.clinical_medical_records;
CREATE POLICY "Clinical records doctor insert"
  ON public.clinical_medical_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      public.is_super_admin()
      OR public.doctor_can_manage_clinical_visit(visit_id, branch_id, doctor_id)
    )
    AND status = 'DRAFT'
    AND NOT is_locked
    AND signed_at IS NULL
    AND signed_by_doctor_id IS NULL
  );

DROP POLICY IF EXISTS "Clinical records doctor update" ON public.clinical_medical_records;
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
      OR public.doctor_can_manage_clinical_visit(visit_id, branch_id, doctor_id)
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.doctor_can_manage_clinical_visit(visit_id, branch_id, doctor_id)
  );

DROP POLICY IF EXISTS "Clinical consent documents doctor read" ON public.clinical_consent_documents;
CREATE POLICY "Clinical consent documents doctor read"
  ON public.clinical_consent_documents
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.doctor_can_access_patient(
        (SELECT visit.patient_id FROM public.patient_visits AS visit WHERE visit.id = clinical_consent_documents.visit_id)
      )
      AND public.user_can_manage_treatment_branch(branch_id)
    )
  );

DROP POLICY IF EXISTS "Clinical consent document authorized read" ON storage.objects;
CREATE POLICY "Clinical consent document authorized read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'clinical-consent-documents'
    AND EXISTS (
      SELECT 1
      FROM public.clinical_consent_documents AS document
      JOIN public.patient_visits AS visit ON visit.id = document.visit_id
      WHERE document.object_path = name
        AND (
          public.is_super_admin()
          OR (
            public.doctor_can_access_patient(visit.patient_id)
            AND public.user_can_manage_treatment_branch(document.branch_id)
          )
        )
    )
  );

COMMIT;
