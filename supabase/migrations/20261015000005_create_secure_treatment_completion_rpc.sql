CREATE OR REPLACE FUNCTION public.complete_treatment_job_secure(
  p_treatment_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS SETOF public.treatment_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.user_accounts%ROWTYPE;
  v_treatment public.treatment_jobs%ROWTYPE;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: user not authenticated';
  END IF;

  SELECT *
  INTO v_user
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid()
    AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: user account not found or inactive';
  END IF;

  IF v_user.role NOT IN ('DOCTOR', 'DOCTOR_ASSISTANT') THEN
    RAISE EXCEPTION 'Role tidak memiliki izin menyelesaikan tindakan medis';
  END IF;

  SELECT *
  INTO v_treatment
  FROM public.treatment_jobs
  WHERE id = p_treatment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TreatmentJob tidak ditemukan';
  END IF;

  IF NOT public.user_can_manage_treatment_branch(v_treatment.branch_id) THEN
    RAISE EXCEPTION 'Pengguna tidak memiliki izin tindakan di cabang ini';
  END IF;

  IF v_treatment.status <> 'DALAM_PROSES' THEN
    RAISE EXCEPTION 'Treatment belum dimulai atau status tidak valid untuk diselesaikan';
  END IF;

  UPDATE public.treatment_jobs
  SET status = 'SELESAI',
      completed_at = v_now,
      updated_at = v_now
  WHERE id = p_treatment_id
  RETURNING * INTO v_treatment;

  INSERT INTO public.treatment_activities (
    treatment_id,
    actor_id,
    actor_role,
    actor_name_snapshot,
    activity_type,
    activity_at,
    branch_id,
    notes
  )
  VALUES (
    p_treatment_id,
    v_user.id,
    v_user.role,
    v_user.name,
    'COMPLETED',
    v_now,
    v_treatment.branch_id,
    COALESCE(p_notes, 'Penyelesaian tindakan medis')
  );

  RETURN NEXT v_treatment;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_treatment_job_secure(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_treatment_job_secure(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
