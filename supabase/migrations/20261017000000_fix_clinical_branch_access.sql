-- Resolve branch aliases and doctor assignments consistently for clinical work.
ALTER TABLE public.user_accounts
  ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.dental_doctors(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.user_can_access_branch(target_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_accounts ua
      JOIN public.dental_branches b ON b.id = target_branch_id
      WHERE ua.auth_user_id = auth.uid()
        AND ua.active = true
        AND ua.role IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
        AND (
          ua.branch_id::TEXT = target_branch_id::TEXT
          OR regexp_replace(
            regexp_replace(lower(trim(ua.branch_id::TEXT)), '^(branch[-_ ]*|cabang[-_ ]*)', ''),
            '[^a-z0-9]', '', 'g'
          ) = regexp_replace(
            regexp_replace(lower(trim(b.name)), '^(branch[-_ ]*|cabang[-_ ]*)', ''),
            '[^a-z0-9]', '', 'g'
          )
          OR EXISTS (
            SELECT 1
            FROM public.staff s
            WHERE (s.id::TEXT = ua.staff_id::TEXT OR s.user_account_id = ua.id)
              AND s.branch_id = target_branch_id
              AND s.active = true
          )
          OR EXISTS (
            SELECT 1
            FROM public.dental_doctors d
            WHERE d.id = ua.doctor_id
              AND public.doctor_is_assigned_to_branch(
                d.id,
                d.assigned_branch_id,
                target_branch_id
              )
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION public.user_can_access_branch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_branch(UUID) TO authenticated;

DROP POLICY IF EXISTS "Branch staff read patient profiles" ON public.patient_profiles;
CREATE POLICY "Branch staff read patient profiles"
  ON public.patient_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
      AND (
        (
          registered_branch_id IS NOT NULL
          AND public.user_can_access_branch(registered_branch_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.patient_visits pv
          WHERE pv.patient_id = patient_profiles.id
            AND public.user_can_access_branch(pv.branch_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.bookings b
          WHERE b.patient_id = patient_profiles.id
            AND public.user_can_access_branch(b.branch_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.queue_items q
          WHERE q.patient_id = patient_profiles.id
            AND public.user_can_access_branch(q.branch_id)
        )
      )
    )
    OR (
      public.get_user_role() = 'PATIENT'
      AND id::TEXT = public.get_user_patient_id()::TEXT
    )
  );

DROP POLICY IF EXISTS "Treatment branch isolation" ON public.treatment_jobs;
DROP POLICY IF EXISTS "Authenticated manage treatment jobs" ON public.treatment_jobs;
DROP POLICY IF EXISTS "Treatment branch read" ON public.treatment_jobs;
DROP POLICY IF EXISTS "Clinical staff create treatment" ON public.treatment_jobs;
DROP POLICY IF EXISTS "Clinical staff update treatment" ON public.treatment_jobs;
CREATE POLICY "Treatment branch read"
  ON public.treatment_jobs
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_can_access_branch(branch_id)
  );

CREATE POLICY "Clinical staff create treatment"
  ON public.treatment_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('SUPER_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
    AND public.user_can_access_branch(branch_id)
  );

CREATE POLICY "Clinical staff update treatment"
  ON public.treatment_jobs
  FOR UPDATE
  TO authenticated
  USING (
    public.get_user_role() IN ('SUPER_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
    AND public.user_can_access_branch(branch_id)
  )
  WITH CHECK (
    public.get_user_role() IN ('SUPER_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
    AND public.user_can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS "Treatment activity branch isolation" ON public.treatment_activities;
DROP POLICY IF EXISTS "Authenticated manage treatment activities" ON public.treatment_activities;
DROP POLICY IF EXISTS "Treatment activity branch read" ON public.treatment_activities;
DROP POLICY IF EXISTS "Clinical staff append treatment activity" ON public.treatment_activities;
CREATE POLICY "Treatment activity branch read"
  ON public.treatment_activities
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_can_access_branch(branch_id)
  );

CREATE POLICY "Clinical staff append treatment activity"
  ON public.treatment_activities
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('SUPER_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
    AND public.user_can_access_branch(branch_id)
  );

CREATE OR REPLACE FUNCTION public.complete_treatment_job_secure(
  p_treatment_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS SETOF public.treatment_jobs
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_uid UUID;
  v_user RECORD;
  v_treatment RECORD;
  v_now TIMESTAMPTZ;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: user not authenticated';
  END IF;

  SELECT * INTO v_user
  FROM public.user_accounts
  WHERE auth_user_id = v_auth_uid AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: user account not found or inactive';
  END IF;

  IF v_user.role = 'BRANCH_ADMIN' THEN
    RAISE EXCEPTION 'Branch Admin tidak diizinkan menyelesaikan tindakan medis';
  END IF;

  SELECT * INTO v_treatment
  FROM public.treatment_jobs
  WHERE id = p_treatment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TreatmentJob tidak ditemukan';
  END IF;

  IF v_treatment.status IN ('SELESAI', 'DISERAHKAN') THEN
    RAISE EXCEPTION 'Treatment sudah selesai atau diserahkan';
  END IF;

  IF v_treatment.status <> 'DALAM_PROSES' THEN
    RAISE EXCEPTION 'Treatment belum dimulai atau status tidak valid untuk diselesaikan';
  END IF;

  IF v_user.role NOT IN ('SUPER_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT') THEN
    RAISE EXCEPTION 'Role tidak memiliki izin menyelesaikan tindakan medis';
  END IF;

  IF v_user.role <> 'SUPER_ADMIN'
     AND NOT public.user_can_access_branch(v_treatment.branch_id) THEN
    RAISE EXCEPTION 'Pengguna tidak memiliki izin tindakan di cabang ini';
  END IF;

  v_now := timezone('utc'::text, now());

  UPDATE public.treatment_jobs
  SET status = 'SELESAI',
      completed_at = v_now,
      updated_at = v_now
  WHERE id = p_treatment_id;

  INSERT INTO public.treatment_activities (
    treatment_id,
    actor_id,
    actor_role,
    actor_name_snapshot,
    activity_type,
    activity_at,
    branch_id,
    notes
  ) VALUES (
    p_treatment_id,
    v_user.id,
    v_user.role,
    v_user.name,
    'COMPLETED',
    v_now,
    v_treatment.branch_id,
    COALESCE(p_notes, 'Penyelesaian tindakan medis')
  );

  RETURN QUERY
  SELECT * FROM public.treatment_jobs WHERE id = p_treatment_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.complete_treatment_job_secure(UUID, TEXT) TO authenticated, service_role;
