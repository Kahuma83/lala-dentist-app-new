BEGIN;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by UUID;

UPDATE public.payment_transactions
SET reversal_reason = 'Pembatalan historis; alasan tidak tercatat',
    reversed_at = COALESCE(updated_at, transaction_date_time, now())
WHERE status = 'REFUNDED'
  AND (reversal_reason IS NULL OR reversed_at IS NULL);

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_reversal_metadata_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_reversal_metadata_check
  CHECK (
    (status = 'REFUNDED'
      AND reversal_reason IS NOT NULL
      AND char_length(btrim(reversal_reason)) BETWEEN 5 AND 500
      AND reversed_at IS NOT NULL)
    OR
    (status <> 'REFUNDED'
      AND reversal_reason IS NULL
      AND reversed_at IS NULL
      AND reversed_by IS NULL)
  );

REVOKE INSERT, UPDATE, DELETE ON public.payment_transactions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reverse_invoice_payment_atomic(
  p_payment_id UUID,
  p_reason TEXT
)
RETURNS public.payment_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payment_transactions%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_journal public.journal_entries%ROWTYPE;
  v_invoice_id UUID;
  v_reversal_id UUID;
  v_reason TEXT := btrim(COALESCE(p_reason, ''));
  v_new_paid BIGINT;
  v_new_outstanding BIGINT;
  v_reversal_date DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi login diperlukan untuk membatalkan pembayaran.';
  END IF;
  IF NOT (public.is_super_admin() OR public.get_user_role() = 'BRANCH_ADMIN') THEN
    RAISE EXCEPTION 'Hanya Super Admin atau Admin Cabang yang dapat membatalkan pembayaran.';
  END IF;
  IF char_length(v_reason) < 5 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi 5 sampai 500 karakter.';
  END IF;
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'ID pembayaran tidak valid.';
  END IF;

  SELECT invoice_id
  INTO v_invoice_id
  FROM public.payment_transactions
  WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi pembayaran tidak ditemukan.';
  END IF;

  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = v_invoice_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice pembayaran tidak ditemukan.';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payment_transactions
  WHERE id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND OR v_payment.invoice_id <> v_invoice_id THEN
    RAISE EXCEPTION 'Pembayaran berubah saat proses pembatalan. Muat ulang data dan coba lagi.';
  END IF;
  IF v_payment.branch_id <> v_invoice.branch_id THEN
    RAISE EXCEPTION 'Cabang pembayaran tidak cocok dengan cabang invoice.';
  END IF;
  IF NOT public.is_super_admin() AND NOT public.user_can_access_branch(v_payment.branch_id) THEN
    RAISE EXCEPTION 'Akses ditolak: pembayaran berada di luar cabang yang dapat diakses.';
  END IF;

  IF v_payment.status = 'REFUNDED' THEN
    IF v_payment.reversal_reason = v_reason THEN
      RETURN v_payment;
    END IF;
    RAISE EXCEPTION 'Pembayaran ini sudah dibatalkan dengan alasan yang berbeda.';
  END IF;
  IF v_payment.status <> 'SUCCESS' THEN
    RAISE EXCEPTION 'Hanya pembayaran berstatus SUCCESS yang dapat dibatalkan.';
  END IF;

  SELECT *
  INTO v_journal
  FROM public.journal_entries
  WHERE source_type = 'PAYMENT'
    AND source_id = v_payment.id::TEXT
    AND status <> 'VOID'
  FOR UPDATE;

  IF FOUND AND v_journal.status = 'POSTED' THEN
    IF EXISTS (
      SELECT 1
      FROM public.journal_entries
      WHERE reversal_of_journal_id = v_journal.id
    ) THEN
      RAISE EXCEPTION 'Jurnal pembayaran sudah memiliki jurnal pembalik. Periksa transaksi sebelum melanjutkan.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.journal_lines WHERE journal_entry_id = v_journal.id
    ) THEN
      RAISE EXCEPTION 'Baris jurnal pembayaran tidak ditemukan; pembatalan tidak dapat dilanjutkan.';
    END IF;

    v_reversal_id := gen_random_uuid();
    v_reversal_date := GREATEST(current_date, v_journal.journal_date);

    INSERT INTO public.journal_entries (
      id,
      journal_number,
      journal_date,
      branch_id,
      description,
      source_type,
      source_id,
      status,
      total_debit,
      total_credit,
      created_by,
      reversal_of_journal_id,
      reversal_reason
    )
    VALUES (
      v_reversal_id,
      'JRN-REV-' || replace(v_reversal_id::TEXT, '-', ''),
      v_reversal_date,
      v_journal.branch_id,
      format('Pembalik %s: %s', v_journal.journal_number, v_reason),
      'REVERSAL',
      v_journal.id::TEXT,
      'DRAFT',
      v_journal.total_credit,
      v_journal.total_debit,
      auth.uid()::TEXT,
      v_journal.id,
      v_reason
    );

    INSERT INTO public.journal_lines (
      journal_entry_id,
      account_id,
      branch_id,
      debit,
      credit,
      description
    )
    SELECT
      v_reversal_id,
      account_id,
      branch_id,
      credit,
      debit,
      COALESCE(description, 'Jurnal pembalik pembayaran')
    FROM public.journal_lines
    WHERE journal_entry_id = v_journal.id;

    UPDATE public.journal_entries
    SET status = 'POSTED',
        posted_at = timezone('utc'::TEXT, now()),
        posted_by = auth.uid()::TEXT,
        updated_at = timezone('utc'::TEXT, now())
    WHERE id = v_reversal_id;
  ELSIF FOUND AND v_journal.status = 'DRAFT' THEN
    DELETE FROM public.journal_lines
    WHERE journal_entry_id = v_journal.id;
    DELETE FROM public.journal_entries
    WHERE id = v_journal.id;
  END IF;

  UPDATE public.payment_transactions
  SET status = 'REFUNDED',
      reversal_reason = v_reason,
      reversed_at = timezone('utc'::TEXT, now()),
      reversed_by = auth.uid(),
      updated_at = timezone('utc'::TEXT, now())
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_new_paid
  FROM public.payment_transactions
  WHERE invoice_id = v_invoice.id
    AND status = 'SUCCESS';

  v_new_outstanding := GREATEST(v_invoice.net_amount - v_new_paid, 0);

  UPDATE public.invoices
  SET paid_amount = v_new_paid,
      outstanding_amount = v_new_outstanding,
      status = CASE
        WHEN v_invoice.status = 'CANCELLED' THEN 'CANCELLED'
        WHEN v_new_outstanding = 0 THEN 'PAID'
        WHEN v_new_paid > 0 THEN 'PARTIALLY_PAID'
        ELSE 'OPEN'
      END,
      updated_at = timezone('utc'::TEXT, now())
  WHERE id = v_invoice.id;

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_invoice_payment_atomic(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_invoice_payment_atomic(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
