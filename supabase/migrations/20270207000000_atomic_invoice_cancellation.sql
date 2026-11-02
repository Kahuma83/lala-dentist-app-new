BEGIN;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID;

UPDATE public.invoices
SET cancellation_reason = 'Pembatalan historis; alasan tidak tercatat',
    cancelled_at = COALESCE(updated_at, created_at, now())
WHERE status = 'CANCELLED'
  AND (cancellation_reason IS NULL OR cancelled_at IS NULL);

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_cancellation_metadata_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_cancellation_metadata_check
  CHECK (
    (status = 'CANCELLED'
      AND cancellation_reason IS NOT NULL
      AND char_length(btrim(cancellation_reason)) BETWEEN 5 AND 500
      AND cancelled_at IS NOT NULL)
    OR
    (status <> 'CANCELLED'
      AND cancellation_reason IS NULL
      AND cancelled_at IS NULL
      AND cancelled_by IS NULL)
  );

CREATE OR REPLACE FUNCTION public.prevent_untracked_invoice_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'CANCELLED'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND COALESCE(current_setting('app.allow_invoice_cancellation', true), '') <> 'true'
  THEN
    RAISE EXCEPTION 'Invoice hanya dapat dibatalkan melalui alur pembatalan atomik.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_untracked_invoice_cancellation ON public.invoices;
CREATE TRIGGER trg_prevent_untracked_invoice_cancellation
  BEFORE UPDATE OF status ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_untracked_invoice_cancellation();

CREATE OR REPLACE FUNCTION public.cancel_invoice_with_reversal_atomic(
  p_invoice_id UUID,
  p_reason TEXT
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_journal public.journal_entries%ROWTYPE;
  v_reversal_id UUID;
  v_reason TEXT := btrim(COALESCE(p_reason, ''));
  v_now TIMESTAMPTZ := timezone('utc'::TEXT, now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi login diperlukan untuk membatalkan invoice.';
  END IF;
  IF NOT (public.is_super_admin() OR public.get_user_role() = 'BRANCH_ADMIN') THEN
    RAISE EXCEPTION 'Hanya Super Admin atau Admin Cabang yang dapat membatalkan invoice.';
  END IF;
  IF char_length(v_reason) < 5 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Alasan pembatalan invoice wajib diisi 5 sampai 500 karakter.';
  END IF;
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'ID invoice tidak valid.';
  END IF;

  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice tidak ditemukan.';
  END IF;
  IF NOT public.is_super_admin()
    AND NOT public.user_can_access_branch(v_invoice.branch_id)
  THEN
    RAISE EXCEPTION 'Admin Cabang tidak dapat membatalkan invoice cabang lain.';
  END IF;

  IF v_invoice.status = 'CANCELLED' THEN
    IF v_invoice.cancellation_reason = v_reason THEN
      RETURN v_invoice;
    END IF;
    RAISE EXCEPTION 'Invoice ini sudah dibatalkan dengan alasan yang berbeda.';
  END IF;
  IF v_invoice.paid_amount <> 0 OR EXISTS (
    SELECT 1
    FROM public.payment_transactions
    WHERE invoice_id = v_invoice.id
      AND status = 'SUCCESS'
  ) THEN
    RAISE EXCEPTION 'Seluruh pembayaran invoice harus dibalik sebelum invoice dibatalkan.';
  END IF;
  IF v_invoice.status NOT IN ('DRAFT', 'OPEN') THEN
    RAISE EXCEPTION 'Invoice harus berstatus DRAFT atau OPEN sebelum dibatalkan.';
  END IF;

  SELECT *
  INTO v_journal
  FROM public.journal_entries
  WHERE source_type = 'INVOICE'
    AND source_id = v_invoice.id::TEXT
    AND status <> 'VOID'
  FOR UPDATE;

  IF FOUND AND v_journal.status = 'POSTED' THEN
    IF EXISTS (
      SELECT 1
      FROM public.journal_entries
      WHERE reversal_of_journal_id = v_journal.id
    ) THEN
      RAISE EXCEPTION 'Jurnal invoice sudah memiliki jurnal pembalik. Periksa transaksi sebelum melanjutkan.';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.journal_lines
      WHERE journal_entry_id = v_journal.id
    ) THEN
      RAISE EXCEPTION 'Baris jurnal invoice tidak ditemukan; pembatalan tidak dapat dilanjutkan.';
    END IF;

    v_reversal_id := gen_random_uuid();
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
      GREATEST(timezone('Asia/Jakarta', now())::DATE, v_journal.journal_date),
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
      COALESCE(description, 'Jurnal pembalik invoice')
    FROM public.journal_lines
    WHERE journal_entry_id = v_journal.id;

    UPDATE public.journal_entries
    SET status = 'POSTED',
        posted_at = v_now,
        posted_by = auth.uid()::TEXT,
        updated_at = v_now
    WHERE id = v_reversal_id;
  ELSIF FOUND AND v_journal.status = 'DRAFT' THEN
    DELETE FROM public.journal_lines
    WHERE journal_entry_id = v_journal.id;
    DELETE FROM public.journal_entries
    WHERE id = v_journal.id;
  END IF;

  PERFORM set_config('app.allow_invoice_cancellation', 'true', true);
  UPDATE public.invoices
  SET status = 'CANCELLED',
      cancellation_reason = v_reason,
      cancelled_at = v_now,
      cancelled_by = auth.uid(),
      outstanding_amount = 0,
      updated_at = v_now
  WHERE id = v_invoice.id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_invoice_with_reversal_atomic(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_invoice_with_reversal_atomic(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
