ALTER TABLE public.treatment_jobs
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_reason TEXT;

ALTER TABLE public.treatment_jobs
  DROP CONSTRAINT IF EXISTS treatment_jobs_status_check;

ALTER TABLE public.treatment_jobs
  ADD CONSTRAINT treatment_jobs_status_check
  CHECK (status IN ('BELUM_DIMULAI', 'DALAM_PROSES', 'SELESAI', 'DISERAHKAN', 'PERLU_REVISI'));

ALTER TABLE public.treatment_activities
  DROP CONSTRAINT IF EXISTS treatment_activities_activity_type_check;

ALTER TABLE public.treatment_activities
  ADD CONSTRAINT treatment_activities_activity_type_check
  CHECK (activity_type IN (
    'STARTED',
    'CONTINUED',
    'PROGRESS',
    'COMPLETED',
    'HANDED_OVER',
    'RETURNED_TO_DOCTOR',
    'REVISION_RESUBMITTED',
    'OTHER'
  ));

CREATE OR REPLACE FUNCTION public.return_treatment_to_doctor_secure(
  p_treatment_id UUID,
  p_reason TEXT
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

  IF NOT FOUND OR v_user.role NOT IN ('BRANCH_ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Hanya petugas kasir yang dapat mengembalikan tindakan ke dokter';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Alasan pengembalian wajib diisi';
  END IF;

  SELECT *
  INTO v_treatment
  FROM public.treatment_jobs
  WHERE id = p_treatment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TreatmentJob tidak ditemukan';
  END IF;

  IF v_treatment.status <> 'DISERAHKAN' THEN
    RAISE EXCEPTION 'Hanya tindakan yang sudah diserahkan ke kasir yang dapat dikembalikan';
  END IF;

  IF v_user.role <> 'SUPER_ADMIN'
     AND NOT public.user_can_manage_treatment_branch(v_treatment.branch_id) THEN
    RAISE EXCEPTION 'Admin Cabang tidak dapat mengakses treatment cabang lain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices invoice
    WHERE invoice.visit_id = v_treatment.visit_id
      AND invoice.status <> 'CANCELLED'
  ) THEN
    RAISE EXCEPTION 'Tindakan tidak dapat dikembalikan setelah invoice diterbitkan';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payment_transactions payment
    JOIN public.invoices invoice ON invoice.id = payment.invoice_id
    WHERE invoice.visit_id = v_treatment.visit_id
  ) THEN
    RAISE EXCEPTION 'Tindakan tidak dapat dikembalikan setelah ada pembayaran';
  END IF;

  UPDATE public.treatment_jobs
  SET status = 'PERLU_REVISI',
      returned_at = v_now,
      return_reason = v_reason,
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
    'RETURNED_TO_DOCTOR',
    v_now,
    v_treatment.branch_id,
    v_reason
  );

  RETURN NEXT v_treatment;
END;
$$;

CREATE OR REPLACE FUNCTION public.resubmit_treatment_to_cashier_secure(
  p_treatment_id UUID,
  p_corrected_notes TEXT
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

  UPDATE public.treatment_jobs
  SET notes = v_corrected_notes,
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
    'Dokter memperbarui catatan tindakan dan menyerahkan kembali ke kasir'
  );

  RETURN NEXT v_treatment;
END;
$$;

REVOKE ALL ON FUNCTION public.return_treatment_to_doctor_secure(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resubmit_treatment_to_cashier_secure(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_treatment_to_doctor_secure(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resubmit_treatment_to_cashier_secure(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
