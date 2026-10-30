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
     AND NOT public.user_can_access_branch(v_treatment.branch_id) THEN
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

REVOKE ALL ON FUNCTION public.return_treatment_to_doctor_secure(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_treatment_to_doctor_secure(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
