-- Journal access is branch-scoped. Branch admins may create, post, void,
-- and delete drafts only for branches assigned to their account. Only Super
-- Admin may delete posted journals or bypass posting immutability.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_entries TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.journal_lines TO authenticated;

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

-- Replace any legacy permissive policies so the rules below are authoritative.
DO $$
DECLARE
  policy_row RECORD;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('journal_entries', 'journal_lines')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END;
$$;

CREATE POLICY "Accounting journal read by branch"
  ON public.journal_entries
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND public.user_can_access_branch(branch_id)
    )
  );

CREATE POLICY "Accounting journal insert draft by branch"
  ON public.journal_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND public.user_can_access_branch(branch_id)
      AND status = 'DRAFT'
    )
  );

CREATE POLICY "Accounting journal update by branch"
  ON public.journal_entries
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND public.user_can_access_branch(branch_id)
      AND status IN ('DRAFT', 'POSTED')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND public.user_can_access_branch(branch_id)
      AND status IN ('DRAFT', 'POSTED', 'VOID')
    )
  );

CREATE POLICY "Accounting journal delete by branch"
  ON public.journal_entries
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND public.user_can_access_branch(branch_id)
      AND status = 'DRAFT'
    )
  );

CREATE POLICY "Accounting journal lines read by branch"
  ON public.journal_lines
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND public.user_can_access_branch(branch_id)
    )
  );

CREATE POLICY "Accounting journal lines insert into draft"
  ON public.journal_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      public.is_super_admin()
      OR (
        public.get_user_role() = 'BRANCH_ADMIN'
        AND public.user_can_access_branch(branch_id)
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.journal_entries journal
      WHERE journal.id = journal_entry_id
        AND journal.branch_id = journal_lines.branch_id
        AND journal.status = 'DRAFT'
    )
  );

CREATE POLICY "Accounting journal lines delete from draft"
  ON public.journal_lines
  FOR DELETE
  TO authenticated
  USING (
    (
      public.is_super_admin()
      OR (
        public.get_user_role() = 'BRANCH_ADMIN'
        AND public.user_can_access_branch(branch_id)
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.journal_entries journal
      WHERE journal.id = journal_entry_id
        AND journal.branch_id = journal_lines.branch_id
        AND (journal.status = 'DRAFT' OR public.is_super_admin())
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_journal_posting_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  line_count BIGINT;
  debit_sum BIGINT;
  credit_sum BIGINT;
  mismatched_branch_count BIGINT;
BEGIN
  IF current_user = 'service_role' OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'POSTED' THEN
    IF NEW.status <> 'VOID'
      OR (to_jsonb(NEW) - ARRAY['status', 'updated_at', 'voided_at', 'voided_by', 'void_reason'])
        <> (to_jsonb(OLD) - ARRAY['status', 'updated_at', 'voided_at', 'voided_by', 'void_reason'])
    THEN
      RAISE EXCEPTION 'Jurnal POSTED tidak dapat diubah selain dibatalkan (VOID)';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'VOID' THEN
    RAISE EXCEPTION 'Jurnal VOID tidak dapat diubah';
  END IF;

  IF NEW.status = 'VOID' THEN
    RAISE EXCEPTION 'Draft jurnal harus diposting atau dihapus, bukan di-VOID';
  END IF;

  IF NEW.status = 'POSTED' THEN
    SELECT
      COUNT(*),
      COALESCE(SUM(debit), 0),
      COALESCE(SUM(credit), 0),
      COUNT(*) FILTER (WHERE branch_id <> NEW.branch_id)
    INTO line_count, debit_sum, credit_sum, mismatched_branch_count
    FROM public.journal_lines
    WHERE journal_entry_id = OLD.id;

    IF line_count < 2
      OR mismatched_branch_count > 0
      OR debit_sum <= 0
      OR debit_sum <> credit_sum
      OR debit_sum <> NEW.total_debit
      OR credit_sum <> NEW.total_credit
    THEN
      RAISE EXCEPTION 'Jurnal tidak dapat diposting: baris debit/kredit tidak lengkap atau tidak seimbang';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_journal_posting_integrity
  ON public.journal_entries;
CREATE TRIGGER trg_enforce_journal_posting_integrity
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_posting_integrity();
