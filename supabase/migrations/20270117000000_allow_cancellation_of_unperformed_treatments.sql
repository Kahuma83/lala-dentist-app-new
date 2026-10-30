DROP FUNCTION IF EXISTS public.cancel_treatment_job_secure(UUID, TEXT);

CREATE FUNCTION public.cancel_treatment_job_secure(
  p_treatment_id UUID,
  p_reason TEXT,
  p_not_performed_confirmed BOOLEAN
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
  v_reason TEXT := NULLIF(BTRIM(p_reason), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: user not authenticated';
  END IF;

  SELECT *
  INTO v_user
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid()
    AND active = true;

  IF NOT FOUND OR v_user.role NOT IN ('DOCTOR', 'DOCTOR_ASSISTANT', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Role tidak memiliki izin membatalkan rencana tindakan';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi';
  END IF;

  SELECT *
  INTO v_treatment
  FROM public.treatment_jobs
  WHERE id = p_treatment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TreatmentJob tidak ditemukan';
  END IF;

  IF v_user.role = 'DOCTOR'
     AND public.get_authenticated_doctor_id()
         IS DISTINCT FROM COALESCE(v_treatment.assigned_doctor_id, v_treatment.doctor_id) THEN
    RAISE EXCEPTION 'Dokter tidak ditugaskan pada tindakan ini';
  END IF;

  IF v_user.role = 'SUPER_ADMIN' AND v_treatment.external_doctor_id IS NULL THEN
    RAISE EXCEPTION 'Super Admin hanya dapat mengelola tindakan dokter eksternal';
  END IF;

  IF v_user.role <> 'SUPER_ADMIN'
     AND NOT public.user_can_manage_treatment_branch(v_treatment.branch_id) THEN
    RAISE EXCEPTION 'Pengguna tidak memiliki izin tindakan di cabang ini';
  END IF;

  IF v_treatment.status NOT IN ('BELUM_DIMULAI', 'DALAM_PROSES') THEN
    RAISE EXCEPTION 'Hanya item yang belum dimulai atau belum dikerjakan yang dapat dibatalkan';
  END IF;

  IF v_treatment.status = 'DALAM_PROSES' THEN
    IF p_not_performed_confirmed IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Konfirmasi bahwa tindakan belum dikerjakan dan belum memakai bahan wajib diisi';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.inventory_treatment_consumptions consumption
      WHERE consumption.treatment_job_id = p_treatment_id
    ) OR EXISTS (
      SELECT 1
      FROM public.inventory_movements movement
      WHERE movement.treatment_job_id = p_treatment_id
        AND movement.movement_type = 'OUT'
    ) THEN
      RAISE EXCEPTION 'Item tidak dapat dibatalkan karena pemakaian bahan sudah tercatat';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.treatment_activities activity
      WHERE activity.treatment_id = p_treatment_id
        AND activity.activity_type <> 'STARTED'
    ) THEN
      RAISE EXCEPTION 'Item tidak dapat dibatalkan karena aktivitas tindakan selain mulai sudah tercatat';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices invoice
    WHERE invoice.visit_id = v_treatment.visit_id
      AND invoice.status <> 'CANCELLED'
  ) THEN
    RAISE EXCEPTION 'Rencana tindakan tidak dapat dibatalkan setelah invoice diterbitkan';
  END IF;

  UPDATE public.treatment_jobs
  SET status = 'DIBATALKAN',
      cancelled_at = v_now,
      cancelled_by = v_user.id,
      cancellation_reason = v_reason,
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
    'CANCELLED',
    v_now,
    v_treatment.branch_id,
    v_reason
  );

  RETURN NEXT v_treatment;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_treatment_job_secure(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_treatment_job_secure(UUID, TEXT, BOOLEAN) TO authenticated, service_role;
