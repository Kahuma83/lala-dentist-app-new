-- Resolve a branch admin's accounting scope from their authenticated account,
-- while retaining the shared branch-access helper for linked staff accounts.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_entries TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.journal_lines TO authenticated;

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_can_access_accounting_branch(target_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND (
        public.get_user_branch_id()::TEXT = target_branch_id::TEXT
        OR public.user_can_access_branch(target_branch_id)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.user_can_access_accounting_branch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_accounting_branch(UUID) TO authenticated;

DROP POLICY IF EXISTS "Accounting journal read by branch" ON public.journal_entries;
CREATE POLICY "Accounting journal read by branch"
  ON public.journal_entries
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_accounting_branch(branch_id));

DROP POLICY IF EXISTS "Accounting journal insert draft by branch" ON public.journal_entries;
CREATE POLICY "Accounting journal insert draft by branch"
  ON public.journal_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_accounting_branch(branch_id)
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
    AND (public.is_super_admin() OR status IN ('DRAFT', 'POSTED', 'VOID'))
  );

DROP POLICY IF EXISTS "Accounting journal delete by branch" ON public.journal_entries;
CREATE POLICY "Accounting journal delete by branch"
  ON public.journal_entries
  FOR DELETE
  TO authenticated
  USING (
    public.user_can_access_accounting_branch(branch_id)
    AND (public.is_super_admin() OR status = 'DRAFT')
  );

DROP POLICY IF EXISTS "Accounting journal lines read by branch" ON public.journal_lines;
CREATE POLICY "Accounting journal lines read by branch"
  ON public.journal_lines
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_accounting_branch(branch_id));

DROP POLICY IF EXISTS "Accounting journal lines insert into draft" ON public.journal_lines;
CREATE POLICY "Accounting journal lines insert into draft"
  ON public.journal_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_accounting_branch(branch_id)
    AND EXISTS (
      SELECT 1
      FROM public.journal_entries journal
      WHERE journal.id = journal_entry_id
        AND journal.branch_id = journal_lines.branch_id
        AND journal.status = 'DRAFT'
    )
  );

DROP POLICY IF EXISTS "Accounting journal lines delete from draft" ON public.journal_lines;
CREATE POLICY "Accounting journal lines delete from draft"
  ON public.journal_lines
  FOR DELETE
  TO authenticated
  USING (
    public.user_can_access_accounting_branch(branch_id)
    AND EXISTS (
      SELECT 1
      FROM public.journal_entries journal
      WHERE journal.id = journal_entry_id
        AND journal.branch_id = journal_lines.branch_id
        AND (journal.status = 'DRAFT' OR public.is_super_admin())
    )
  );
