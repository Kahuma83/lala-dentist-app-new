BEGIN;

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type IN ('MANUAL', 'INVOICE', 'PAYMENT', 'COMPENSATION', 'PAYROLL', 'EXPENSE', 'ADJUSTMENT', 'REVERSAL'));

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS reversal_of_journal_id UUID
    REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reversal_metadata_check;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_reversal_metadata_check
  CHECK (
    (source_type = 'REVERSAL' AND reversal_of_journal_id IS NOT NULL AND reversal_reason IS NOT NULL AND char_length(btrim(reversal_reason)) BETWEEN 5 AND 500)
    OR
    (source_type <> 'REVERSAL' AND reversal_of_journal_id IS NULL AND reversal_reason IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_single_reversal
  ON public.journal_entries(reversal_of_journal_id)
  WHERE reversal_of_journal_id IS NOT NULL;

DROP POLICY IF EXISTS "Accounting journal insert draft by branch" ON public.journal_entries;
CREATE POLICY "Accounting journal insert draft by branch"
  ON public.journal_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_accounting_branch(branch_id)
    AND source_type <> 'REVERSAL'
    AND (public.is_super_admin() OR status = 'DRAFT')
  );

DROP POLICY IF EXISTS "Accounting journal update by branch" ON public.journal_entries;
CREATE POLICY "Accounting journal update by branch"
  ON public.journal_entries
  FOR UPDATE
  TO authenticated
  USING (
    public.user_can_access_accounting_branch(branch_id)
    AND (public.is_super_admin() OR status IN ('DRAFT', 'POSTED'))
  )
  WITH CHECK (
    public.user_can_access_accounting_branch(branch_id)
    AND source_type <> 'REVERSAL'
    AND (public.is_super_admin() OR status IN ('DRAFT', 'POSTED', 'VOID'))
  );

CREATE OR REPLACE FUNCTION public.enforce_journal_reversal_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'VOID' THEN
      RAISE EXCEPTION 'Jurnal POSTED tidak dapat di-VOID langsung; gunakan jurnal pembalik yang terkait.';
    END IF;
    IF OLD.status = 'POSTED' AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Jurnal POSTED tidak dapat diubah statusnya; gunakan jurnal pembalik yang terkait.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Jurnal POSTED atau VOID harus dipertahankan sebagai jejak audit; hanya draft yang dapat dihapus.';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_posted_journal(
  p_journal_id UUID,
  p_reason TEXT,
  p_reversal_date DATE,
  p_reversed_by TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  original_journal public.journal_entries%ROWTYPE;
  reversal_id UUID := gen_random_uuid();
  clean_reason TEXT := btrim(COALESCE(p_reason, ''));
  clean_actor TEXT := btrim(COALESCE(p_reversed_by, ''));
  reversal_number TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi login diperlukan untuk membuat jurnal pembalik.';
  END IF;
  IF NOT (
    public.is_super_admin()
    OR public.get_user_role() = 'BRANCH_ADMIN'
  ) THEN
    RAISE EXCEPTION 'Hanya Super Admin atau Admin Cabang yang dapat membuat jurnal pembalik.';
  END IF;
  IF char_length(clean_reason) < 5 OR char_length(clean_reason) > 500 THEN
    RAISE EXCEPTION 'Alasan koreksi wajib diisi 5 sampai 500 karakter.';
  END IF;
  IF clean_actor = '' OR char_length(clean_actor) > 100 THEN
    RAISE EXCEPTION 'Nama pembuat jurnal pembalik tidak valid.';
  END IF;
  IF p_reversal_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal jurnal pembalik wajib diisi.';
  END IF;

  SELECT *
  INTO original_journal
  FROM public.journal_entries
  WHERE id = p_journal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jurnal asal tidak ditemukan.';
  END IF;
  IF NOT public.user_can_access_accounting_branch(original_journal.branch_id) THEN
    RAISE EXCEPTION 'Akses ditolak: jurnal berada di luar cabang yang dapat diakses.';
  END IF;
  IF original_journal.status <> 'POSTED' THEN
    RAISE EXCEPTION 'Hanya jurnal POSTED yang dapat dibalik.';
  END IF;
  IF original_journal.source_type NOT IN ('EXPENSE', 'MANUAL', 'ADJUSTMENT') THEN
    RAISE EXCEPTION 'Jurnal transaksi invoice, pembayaran, payroll, atau kompensasi harus dikoreksi dari transaksi sumber.';
  END IF;
  IF original_journal.source_type = 'EXPENSE'
    AND original_journal.source_id LIKE 'RECURRING_SETTLEMENT:%'
  THEN
    RAISE EXCEPTION 'Pembayaran penyisihan berulang harus dikoreksi melalui alur rencana akrual.';
  END IF;
  IF p_reversal_date < original_journal.journal_date THEN
    RAISE EXCEPTION 'Tanggal jurnal pembalik tidak boleh sebelum tanggal jurnal asal.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE reversal_of_journal_id = original_journal.id
  ) THEN
    RAISE EXCEPTION 'Jurnal ini sudah memiliki jurnal pembalik.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.journal_lines
    WHERE journal_entry_id = original_journal.id
  ) THEN
    RAISE EXCEPTION 'Baris jurnal asal tidak ditemukan.';
  END IF;

  reversal_number := 'JRN-REV-' || replace(reversal_id::TEXT, '-', '');

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
    reversal_id,
    reversal_number,
    p_reversal_date,
    original_journal.branch_id,
    format('Pembalik %s: %s', original_journal.journal_number, clean_reason),
    'REVERSAL',
    original_journal.id::TEXT,
    'DRAFT',
    original_journal.total_credit,
    original_journal.total_debit,
    clean_actor,
    original_journal.id,
    clean_reason
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
    reversal_id,
    account_id,
    branch_id,
    credit,
    debit,
    COALESCE(description, 'Jurnal pembalik')
  FROM public.journal_lines
  WHERE journal_entry_id = original_journal.id;

  UPDATE public.journal_entries
  SET
    status = 'POSTED',
    posted_at = timezone('utc'::TEXT, now()),
    posted_by = clean_actor,
    updated_at = timezone('utc'::TEXT, now())
  WHERE id = reversal_id;

  RETURN reversal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_posted_journal(UUID, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_posted_journal(UUID, TEXT, DATE, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
