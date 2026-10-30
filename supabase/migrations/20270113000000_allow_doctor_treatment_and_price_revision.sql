DROP FUNCTION IF EXISTS public.resubmit_treatment_to_cashier_secure(UUID, TEXT, UUID, BIGINT);

CREATE FUNCTION public.resubmit_treatment_to_cashier_secure(
  p_treatment_id UUID,
  p_corrected_notes TEXT,
  p_service_id UUID,
  p_price_snapshot BIGINT
)
RETURNS SETOF public.treatment_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.user_accounts%ROWTYPE;
  v_treatment public.treatment_jobs%ROWTYPE;
  v_service_name TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_corrected_notes TEXT := NULLIF(BTRIM(p_corrected_notes), '');
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
    RAISE EXCEPTION 'Hanya dokter penanggung jawab yang dapat mengirim ulang tindakan ini';
  END IF;

  IF v_corrected_notes IS NULL THEN
    RAISE EXCEPTION 'Catatan tindakan yang sudah dikoreksi wajib diisi';
  END IF;

  IF p_price_snapshot IS NULL
     OR p_price_snapshot < 0
     OR p_price_snapshot > 9007199254740991 THEN
    RAISE EXCEPTION 'Harga tindakan harus berupa angka Rupiah bulat dan tidak boleh negatif';
  END IF;

  SELECT *
  INTO v_treatment
  FROM public.treatment_jobs
  WHERE id = p_treatment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TreatmentJob tidak ditemukan';
  END IF;

  IF v_treatment.status <> 'PERLU_REVISI' THEN
    RAISE EXCEPTION 'Tindakan tidak sedang menunggu revisi dokter';
  END IF;

  IF public.get_authenticated_doctor_id() IS NULL
     OR public.get_authenticated_doctor_id()
        IS DISTINCT FROM COALESCE(v_treatment.assigned_doctor_id, v_treatment.doctor_id) THEN
    RAISE EXCEPTION 'Dokter tidak ditugaskan pada tindakan ini';
  END IF;

  IF NOT public.user_can_manage_treatment_branch(v_treatment.branch_id) THEN
    RAISE EXCEPTION 'Dokter tidak memiliki izin tindakan di cabang ini';
  END IF;

  SELECT name
  INTO v_service_name
  FROM public.master_services
  WHERE id = p_service_id
    AND (is_active = true OR id = v_treatment.service_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jenis tindakan aktif tidak ditemukan';
  END IF;

  UPDATE public.treatment_jobs
  SET service_id = p_service_id,
      service_name_snapshot = v_service_name,
      price_snapshot = p_price_snapshot,
      notes = v_corrected_notes,
      status = 'DISERAHKAN',
      handed_over_at = v_now,
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
  ) VALUES (
    p_treatment_id,
    v_user.id,
    v_user.role,
    v_user.name,
    'REVISION_RESUBMITTED',
    v_now,
    v_treatment.branch_id,
    format(
      'Dokter mengubah tindakan menjadi %s dengan harga Rp %s dan menyerahkan kembali ke kasir',
      v_service_name,
      p_price_snapshot
    )
  );

  RETURN NEXT v_treatment;
END;
$$;

REVOKE ALL ON FUNCTION public.resubmit_treatment_to_cashier_secure(UUID, TEXT, UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_treatment_to_cashier_secure(UUID, TEXT, UUID, BIGINT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
