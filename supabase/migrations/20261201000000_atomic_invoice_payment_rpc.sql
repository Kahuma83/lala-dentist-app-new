CREATE OR REPLACE FUNCTION public.record_invoice_payment_atomic(
  p_invoice_id UUID,
  p_amount BIGINT,
  p_payment_method TEXT,
  p_reference_number TEXT DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL,
  p_payment_id UUID DEFAULT NULL,
  p_receipt_number TEXT DEFAULT NULL
)
RETURNS public.payment_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_payment public.payment_transactions%ROWTYPE;
  v_outstanding BIGINT;
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: sesi pengguna tidak ditemukan';
  END IF;

  v_role := public.get_user_role();
  IF NOT public.is_super_admin() AND v_role <> 'BRANCH_ADMIN' THEN
    RAISE EXCEPTION 'Akses ditolak: hanya Super Admin atau Branch Admin yang dapat menerima pembayaran';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal pembayaran harus lebih dari 0';
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('CASH', 'TRANSFER', 'QRIS', 'OTHER') THEN
    RAISE EXCEPTION 'Metode pembayaran tidak valid';
  END IF;
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staf penerima pembayaran wajib diisi';
  END IF;

  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice yang dituju tidak ditemukan';
  END IF;
  IF NOT public.is_super_admin() AND NOT public.user_can_access_branch(v_invoice.branch_id) THEN
    RAISE EXCEPTION 'Branch Admin tidak dapat menerima pembayaran untuk Invoice cabang lain';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.id = p_staff_id
      AND s.branch_id = v_invoice.branch_id
      AND s.active = true
      AND s.employment_status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Staf penerima pembayaran tidak aktif atau bukan dari cabang invoice';
  END IF;

  IF p_payment_id IS NOT NULL THEN
    SELECT *
    INTO v_payment
    FROM public.payment_transactions
    WHERE id = p_payment_id;
    IF FOUND THEN
      IF v_payment.invoice_id = p_invoice_id
        AND v_payment.amount = p_amount
        AND v_payment.payment_method = p_payment_method
        AND v_payment.staff_id = p_staff_id
        AND v_payment.reference_number IS NOT DISTINCT FROM p_reference_number THEN
        RETURN v_payment;
      END IF;
      RAISE EXCEPTION 'ID pembayaran telah digunakan untuk transaksi lain';
    END IF;
  END IF;

  IF v_invoice.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Tidak dapat menerima pembayaran untuk invoice yang telah DIBATALKAN';
  END IF;
  IF v_invoice.status NOT IN ('OPEN', 'PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Status invoice tidak mengizinkan pembayaran';
  END IF;

  v_outstanding := greatest(v_invoice.net_amount - v_invoice.paid_amount, 0);
  IF v_outstanding <= 0 OR p_amount > v_outstanding THEN
    RAISE EXCEPTION 'Nominal pembayaran melebihi sisa tagihan invoice';
  END IF;

  INSERT INTO public.payment_transactions (
    id,
    invoice_id,
    branch_id,
    amount,
    payment_method,
    reference_number,
    receipt_number,
    transaction_date_time,
    staff_id,
    status
  ) VALUES (
    coalesce(p_payment_id, gen_random_uuid()),
    v_invoice.id,
    v_invoice.branch_id,
    p_amount,
    p_payment_method,
    p_reference_number,
    p_receipt_number,
    now(),
    p_staff_id,
    'SUCCESS'
  )
  RETURNING * INTO v_payment;

  UPDATE public.invoices
  SET paid_amount = v_invoice.paid_amount + p_amount,
      outstanding_amount = v_outstanding - p_amount,
      status = CASE WHEN v_outstanding = p_amount THEN 'PAID' ELSE 'PARTIALLY_PAID' END,
      updated_at = now()
  WHERE id = v_invoice.id;

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment_atomic(UUID, BIGINT, TEXT, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment_atomic(UUID, BIGINT, TEXT, TEXT, UUID, UUID, TEXT) TO authenticated;
