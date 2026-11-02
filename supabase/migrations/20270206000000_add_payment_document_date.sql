BEGIN;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE public.payment_transactions
SET payment_date = (transaction_date_time AT TIME ZONE 'Asia/Jakarta')::DATE
WHERE payment_date IS NULL;

ALTER TABLE public.payment_transactions
  ALTER COLUMN payment_date SET DEFAULT (timezone('Asia/Jakarta', now())::DATE),
  ALTER COLUMN payment_date SET NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_payment_receipt_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_branch_code TEXT;
BEGIN
  IF NEW.receipt_number IS NULL OR btrim(NEW.receipt_number) = '' THEN
    v_branch_code := public.get_invoice_branch_code(NEW.branch_id);
    IF v_branch_code IS NULL THEN
      RAISE EXCEPTION 'Kode cabang tidak ditemukan untuk kwitansi ini';
    END IF;

    NEW.receipt_number := 'KWT/'
      || v_branch_code
      || '/'
      || to_char(NEW.payment_date, 'YYYYMM')
      || '/'
      || lpad(nextval('public.payment_receipt_number_seq')::TEXT, 6, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.record_invoice_payment_atomic(
  UUID, BIGINT, TEXT, TEXT, UUID, UUID, TEXT
);

CREATE OR REPLACE FUNCTION public.record_invoice_payment_atomic(
  p_invoice_id UUID,
  p_amount BIGINT,
  p_payment_method TEXT,
  p_reference_number TEXT DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL,
  p_payment_id UUID DEFAULT NULL,
  p_receipt_number TEXT DEFAULT NULL,
  p_payment_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.payment_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_payment public.payment_transactions%ROWTYPE;
  v_payment_date DATE := COALESCE(p_payment_date, timezone('Asia/Jakarta', now())::DATE);
  v_today DATE := timezone('Asia/Jakarta', now())::DATE;
  v_outstanding BIGINT;
  v_paid_after BIGINT;
  v_outstanding_after BIGINT;
  v_role TEXT;
  v_notes TEXT := NULLIF(btrim(p_notes), '');
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
  IF v_payment_date > v_today THEN
    RAISE EXCEPTION 'Tanggal pembayaran tidak boleh melebihi tanggal hari ini.';
  END IF;
  IF v_payment_date < v_today
    AND (v_notes IS NULL OR char_length(v_notes) NOT BETWEEN 5 AND 500) THEN
    RAISE EXCEPTION 'Alasan pencatatan pembayaran mundur wajib diisi 5 sampai 500 karakter.';
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
  IF v_payment_date < v_invoice.invoice_date THEN
    RAISE EXCEPTION 'Tanggal pembayaran tidak boleh sebelum tanggal invoice.';
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
        AND v_payment.reference_number IS NOT DISTINCT FROM p_reference_number
        AND v_payment.payment_date = v_payment_date THEN
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

  v_paid_after := v_invoice.paid_amount + p_amount;
  v_outstanding_after := v_outstanding - p_amount;

  INSERT INTO public.payment_transactions (
    id,
    invoice_id,
    branch_id,
    amount,
    invoice_net_amount_snapshot,
    invoice_paid_amount_snapshot,
    invoice_outstanding_amount_snapshot,
    payment_method,
    reference_number,
    receipt_number,
    transaction_date_time,
    payment_date,
    notes,
    staff_id,
    status
  ) VALUES (
    coalesce(p_payment_id, gen_random_uuid()),
    v_invoice.id,
    v_invoice.branch_id,
    p_amount,
    v_invoice.net_amount,
    v_paid_after,
    v_outstanding_after,
    p_payment_method,
    p_reference_number,
    p_receipt_number,
    now(),
    v_payment_date,
    v_notes,
    p_staff_id,
    'SUCCESS'
  )
  RETURNING * INTO v_payment;

  UPDATE public.invoices
  SET paid_amount = v_paid_after,
      outstanding_amount = v_outstanding_after,
      status = CASE WHEN v_outstanding_after = 0 THEN 'PAID' ELSE 'PARTIALLY_PAID' END,
      updated_at = now()
  WHERE id = v_invoice.id;

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment_atomic(
  UUID, BIGINT, TEXT, TEXT, UUID, UUID, TEXT, DATE, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment_atomic(
  UUID, BIGINT, TEXT, TEXT, UUID, UUID, TEXT, DATE, TEXT
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
