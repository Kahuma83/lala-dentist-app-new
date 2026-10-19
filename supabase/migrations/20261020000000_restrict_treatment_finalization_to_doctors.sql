CREATE OR REPLACE FUNCTION public.start_treatment_job_secure(
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
  v_treatment public.treatment_jobs%ROWTYPE;
  v_now TIMESTAMPTZ;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: user not authenticated';
  END IF;

  SELECT * INTO v_user
  FROM public.user_accounts
  WHERE auth_user_id = v_auth_uid AND active = true;

  IF NOT FOUND OR v_user.role NOT IN ('SUPER_ADMIN', 'DOCTOR_ASSISTANT') THEN
    RAISE EXCEPTION 'Role tidak memiliki izin memulai treatment melalui prosedur ini';
  END IF;

  SELECT * INTO v_treatment
  FROM public.treatment_jobs
  WHERE id = p_treatment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TreatmentJob tidak ditemukan';
  END IF;

  IF v_user.role <> 'SUPER_ADMIN'
     AND NOT public.user_can_manage_treatment_branch(v_treatment.branch_id) THEN
    RAISE EXCEPTION 'Pengguna tidak memiliki izin tindakan di cabang ini';
  END IF;

  IF v_treatment.status <> 'BELUM_DIMULAI' THEN
    RAISE EXCEPTION 'Treatment hanya dapat dimulai dari status BELUM_DIMULAI';
  END IF;

  v_now := timezone('utc'::text, now());

  UPDATE public.treatment_jobs
  SET status = 'DALAM_PROSES',
      started_at = v_now,
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
    'STARTED',
    v_now,
    v_treatment.branch_id,
    COALESCE(p_notes, 'Memulai tindakan medis')
  );

  RETURN QUERY
  SELECT * FROM public.treatment_jobs WHERE id = p_treatment_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.start_treatment_job_secure(UUID, TEXT) TO authenticated, service_role;

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
  v_treatment public.treatment_jobs%ROWTYPE;
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

  IF v_user.role <> 'DOCTOR' THEN
    RAISE EXCEPTION 'Hanya Dokter yang dapat menyelesaikan tindakan medis';
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

  IF NOT public.user_can_manage_treatment_branch(v_treatment.branch_id) THEN
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

DROP POLICY IF EXISTS "Treatment branch isolation" ON public.treatment_jobs;
DROP POLICY IF EXISTS "Authenticated manage treatment jobs" ON public.treatment_jobs;
DROP POLICY IF EXISTS "Clinical staff update treatment jobs" ON public.treatment_jobs;
CREATE POLICY "Doctor and admin update treatment jobs"
  ON public.treatment_jobs
  FOR UPDATE
  TO authenticated
  USING (
    public.get_user_role() = 'DOCTOR'
    AND public.user_can_manage_treatment_branch(branch_id)
  )
  WITH CHECK (
    public.get_user_role() = 'DOCTOR'
    AND public.user_can_manage_treatment_branch(branch_id)
  );
