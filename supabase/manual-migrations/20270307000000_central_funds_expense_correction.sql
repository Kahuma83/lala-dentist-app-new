-- Apply manually after reviewing the production schema and backing up the database.
BEGIN;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS corrects_journal_id UUID
    REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS correction_reason TEXT;

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_correction_metadata_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_correction_metadata_check
  CHECK (
    (corrects_journal_id IS NULL AND correction_reason IS NULL)
    OR (
      source_type = 'EXPENSE'
      AND corrects_journal_id IS NOT NULL
      AND correction_reason IS NOT NULL
      AND char_length(btrim(correction_reason)) BETWEEN 5 AND 500
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_single_correction
  ON public.journal_entries(corrects_journal_id)
  WHERE corrects_journal_id IS NOT NULL;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS cash_source VARCHAR(20);

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20);

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_payment_method_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('CASH', 'TRANSFER', 'QRIS', 'OTHER'));

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_cash_source_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_cash_source_check
  CHECK (cash_source IS NULL OR cash_source IN ('DAILY_CASH', 'KERITING', 'CENTRAL'));

CREATE OR REPLACE FUNCTION public.correct_posted_expense(
  p_journal_id UUID,
  p_correction_date DATE,
  p_reason TEXT,
  p_expense_account_id UUID,
  p_payment_account_id UUID,
  p_payment_method TEXT,
  p_cash_source TEXT,
  p_amount BIGINT,
  p_description TEXT,
  p_corrected_by TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  original_journal public.journal_entries%ROWTYPE;
  expense_account public.chart_of_accounts%ROWTYPE;
  payment_account public.chart_of_accounts%ROWTYPE;
  reversal_id UUID := gen_random_uuid();
  replacement_id UUID := gen_random_uuid();
  clean_reason TEXT := btrim(COALESCE(p_reason, ''));
  clean_description TEXT := btrim(COALESCE(p_description, ''));
  clean_actor TEXT := btrim(COALESCE(p_corrected_by, ''));
  replacement_cash_source TEXT;
  reversal_number TEXT;
  replacement_number TEXT;
  expense_line_count INTEGER;
  payment_line_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi login diperlukan untuk mengoreksi jurnal.';
  END IF;
  IF NOT (
    public.is_super_admin()
    OR public.get_user_role() = 'BRANCH_ADMIN'
  ) THEN
    RAISE EXCEPTION 'Hanya Super Admin atau Admin Cabang yang dapat mengoreksi jurnal pengeluaran.';
  END IF;
  IF char_length(clean_reason) < 5 OR char_length(clean_reason) > 500 THEN
    RAISE EXCEPTION 'Alasan koreksi wajib diisi 5 sampai 500 karakter.';
  END IF;
  IF clean_actor = '' OR char_length(clean_actor) > 100 THEN
    RAISE EXCEPTION 'Nama pembuat koreksi tidak valid.';
  END IF;
  IF p_correction_date IS NULL OR p_amount IS NULL OR p_amount <= 0
    OR clean_description = '' OR char_length(clean_description) > 500
    OR p_payment_method IS NULL
    OR p_payment_method NOT IN ('CASH', 'TRANSFER', 'QRIS', 'OTHER') THEN
    RAISE EXCEPTION 'Tanggal, nominal, dan keterangan jurnal pengganti wajib valid.';
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
  IF original_journal.status <> 'POSTED' OR original_journal.source_type <> 'EXPENSE' THEN
    RAISE EXCEPTION 'Hanya jurnal pengeluaran POSTED yang dapat dikoreksi melalui alur ini.';
  END IF;
  IF original_journal.source_id LIKE 'RECURRING_SETTLEMENT:%' THEN
    RAISE EXCEPTION 'Pembayaran penyisihan berulang harus dikoreksi melalui alur rencana akrual.';
  END IF;
  IF p_correction_date <> original_journal.journal_date THEN
    RAISE EXCEPTION 'Tanggal jurnal pembalik dan pengganti harus sama dengan tanggal jurnal asal.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE reversal_of_journal_id = original_journal.id
       OR corrects_journal_id = original_journal.id
  ) THEN
    RAISE EXCEPTION 'Jurnal ini sudah pernah dikoreksi.';
  END IF;

  SELECT
    count(*) FILTER (WHERE line.debit > 0 AND account.account_type = 'EXPENSE'),
    count(*) FILTER (
      WHERE line.credit > 0
        AND account.account_type = 'ASSET'
        AND account.account_category IN ('CASH', 'BANK')
    )
  INTO expense_line_count, payment_line_count
  FROM public.journal_lines line
  JOIN public.chart_of_accounts account ON account.id = line.account_id
  WHERE line.journal_entry_id = original_journal.id;

  IF expense_line_count <> 1 OR payment_line_count <> 1
    OR (SELECT count(*) FROM public.journal_lines WHERE journal_entry_id = original_journal.id) <> 2 THEN
    RAISE EXCEPTION 'Jurnal asal bukan pengeluaran sederhana dengan satu akun beban dan satu akun pembayaran.';
  END IF;

  SELECT *
  INTO expense_account
  FROM public.chart_of_accounts
  WHERE id = p_expense_account_id
    AND is_active
    AND account_type = 'EXPENSE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun beban/pengeluaran tidak valid atau nonaktif.';
  END IF;

  SELECT *
  INTO payment_account
  FROM public.chart_of_accounts
  WHERE id = p_payment_account_id
    AND is_active
    AND account_type = 'ASSET'
    AND account_category IN ('CASH', 'BANK');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun pembayaran harus berupa akun kas atau bank yang aktif.';
  END IF;

  IF p_payment_method = 'CASH' AND payment_account.account_category <> 'CASH' THEN
    RAISE EXCEPTION 'Metode tunai harus menggunakan akun kas.';
  END IF;
  IF p_payment_method <> 'CASH' AND payment_account.account_category <> 'BANK' THEN
    RAISE EXCEPTION 'Metode QRIS, EDC, dan transfer harus menggunakan akun bank/settlement.';
  END IF;
  IF p_cash_source IS NOT NULL AND p_cash_source NOT IN ('DAILY_CASH', 'KERITING', 'CENTRAL') THEN
    RAISE EXCEPTION 'Sumber kas tidak valid.';
  END IF;
  IF p_cash_source IS NOT NULL AND payment_account.account_category <> 'CASH' THEN
    RAISE EXCEPTION 'Sumber kas hanya dapat digunakan dengan akun kas tunai.';
  END IF;

  replacement_cash_source := CASE
    WHEN payment_account.account_category = 'CASH' THEN COALESCE(p_cash_source, 'DAILY_CASH')
    ELSE NULL
  END;
  reversal_number := 'JRN-REV-COR-' || replace(reversal_id::TEXT, '-', '');
  replacement_number := 'JRN-EXP-COR-' || replace(replacement_id::TEXT, '-', '');

  INSERT INTO public.journal_entries (
    id, journal_number, journal_date, branch_id, description, source_type, source_id,
    status, total_debit, total_credit, created_by, cash_source, payment_method,
    reversal_of_journal_id, reversal_reason
  )
  VALUES (
    reversal_id, reversal_number, p_correction_date, original_journal.branch_id,
    format('Pembalik %s: %s', original_journal.journal_number, clean_reason),
    'REVERSAL', original_journal.id::TEXT, 'DRAFT',
    original_journal.total_credit, original_journal.total_debit, clean_actor,
    original_journal.cash_source, original_journal.payment_method,
    original_journal.id, clean_reason
  );

  INSERT INTO public.journal_lines (
    journal_entry_id, account_id, branch_id, debit, credit, description
  )
  SELECT
    reversal_id, account_id, branch_id, credit, debit,
    COALESCE(description, 'Jurnal pembalik')
  FROM public.journal_lines
  WHERE journal_entry_id = original_journal.id;

  UPDATE public.journal_entries
  SET status = 'POSTED',
      posted_at = timezone('utc'::TEXT, now()),
      posted_by = clean_actor,
      updated_at = timezone('utc'::TEXT, now())
  WHERE id = reversal_id;

  INSERT INTO public.journal_entries (
    id, journal_number, journal_date, branch_id, description, source_type, source_id,
    status, total_debit, total_credit, created_by, cash_source, payment_method,
    corrects_journal_id, correction_reason
  )
  VALUES (
    replacement_id, replacement_number, p_correction_date, original_journal.branch_id,
    format('Koreksi %s: Pengeluaran Cabang: %s [%s]',
      original_journal.journal_number, clean_description, expense_account.name),
    'EXPENSE', 'EXP-CORR:' || replacement_id::TEXT, 'DRAFT',
    p_amount, p_amount, clean_actor, replacement_cash_source, p_payment_method,
    original_journal.id, clean_reason
  );

  INSERT INTO public.journal_lines (
    journal_entry_id, account_id, branch_id, debit, credit, description
  )
  VALUES
    (replacement_id, expense_account.id, original_journal.branch_id, p_amount, 0, clean_description),
    (replacement_id, payment_account.id, original_journal.branch_id, 0, p_amount,
      'Pembayaran via ' || payment_account.name);

  UPDATE public.journal_entries
  SET status = 'POSTED',
      posted_at = timezone('utc'::TEXT, now()),
      posted_by = clean_actor,
      updated_at = timezone('utc'::TEXT, now())
  WHERE id = replacement_id;

  RETURN jsonb_build_object(
    'reversal_id', reversal_id,
    'replacement_id', replacement_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.correct_posted_expense(UUID, DATE, TEXT, UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_posted_expense(UUID, DATE, TEXT, UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT)
  TO authenticated;

DO $$
DECLARE
  function_definition TEXT;
  old_condition CONSTANT TEXT := 'cash_source <> ''KERITING''';
  new_condition CONSTANT TEXT := 'cash_source = ''DAILY_CASH''';
  occurrences INTEGER;
  function_signature REGPROCEDURE;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.get_owner_daily_cash_report(date)'::REGPROCEDURE,
    'public.get_branch_cash_rounding_report(date, uuid)'::REGPROCEDURE
  ]
  LOOP
    function_definition := pg_get_functiondef(function_signature);
    occurrences := (
      length(function_definition) - length(replace(function_definition, old_condition, ''))
    ) / length(old_condition);
    IF occurrences <> 2 THEN
      RAISE EXCEPTION 'Expected two daily-cash filters in %, found %.',
        function_signature, occurrences;
    END IF;
    EXECUTE replace(function_definition, old_condition, new_condition);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
