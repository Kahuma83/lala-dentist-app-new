CREATE OR REPLACE FUNCTION public.complete_treatment_job_with_final_price_secure(
  p_treatment_id UUID,
  p_notes TEXT,
  p_final_price_snapshot BIGINT,
  p_patient_approval_confirmed BOOLEAN
)
RETURNS SETOF public.treatment_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.user_accounts%ROWTYPE;
  v_treatment public.treatment_jobs%ROWTYPE;
  v_previous_price BIGINT;
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

  IF NOT FOUND OR v_user.role <> 'DOCTOR' THEN
    RAISE EXCEPTION 'Hanya dokter yang dapat mencatat harga final tindakan';
  END IF;

  IF p_patient_approval_confirmed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Konfirmasi bahwa pasien menyetujui harga final sebelum tindakan wajib dicatat';
  END IF;

  IF p_final_price_snapshot IS NULL
     OR p_final_price_snapshot < 0
     OR p_final_price_snapshot > 9007199254740991 THEN
    RAISE EXCEPTION 'Harga final harus berupa angka Rupiah bulat dan tidak boleh negatif';
  END IF;

  SELECT *
  INTO v_treatment
  FROM public.treatment_jobs
  WHERE id = p_treatment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TreatmentJob tidak ditemukan';
  END IF;

  IF v_treatment.status <> 'DALAM_PROSES' THEN
    RAISE EXCEPTION 'Treatment hanya dapat diselesaikan dari status DALAM_PROSES';
  END IF;

  IF public.get_authenticated_doctor_id() IS NULL
     OR public.get_authenticated_doctor_id()
        IS DISTINCT FROM COALESCE(v_treatment.assigned_doctor_id, v_treatment.doctor_id) THEN
    RAISE EXCEPTION 'Dokter tidak ditugaskan pada tindakan ini';
  END IF;

  IF NOT public.user_can_manage_treatment_branch(v_treatment.branch_id) THEN
    RAISE EXCEPTION 'Pengguna tidak memiliki izin tindakan di cabang ini';
  END IF;

  v_previous_price := v_treatment.price_snapshot;

  PERFORM 1
  FROM public.complete_treatment_job_secure(
    p_treatment_id,
    COALESCE(p_notes, 'Penyelesaian tindakan medis')
  );

  UPDATE public.treatment_jobs
  SET price_snapshot = p_final_price_snapshot,
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
    'OTHER',
    v_now,
    v_treatment.branch_id,
    format(
      'Harga final Rp %s dicatat setelah tindakan. Dokter mengonfirmasi pasien telah menyetujuinya sebelum tindakan%s.',
      p_final_price_snapshot,
      CASE
        WHEN v_previous_price IS NULL THEN ''
        ELSE format(' (estimasi sebelumnya Rp %s)', v_previous_price)
      END
    )
  );

  RETURN QUERY
  SELECT *
  FROM public.treatment_jobs
  WHERE id = p_treatment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_treatment_job_with_final_price_secure(UUID, TEXT, BIGINT, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_treatment_job_with_final_price_secure(UUID, TEXT, BIGINT, BOOLEAN)
  TO authenticated, service_role;
