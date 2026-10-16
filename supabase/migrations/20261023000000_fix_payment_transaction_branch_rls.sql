-- Keep payment transactions branch-scoped and ensure each payment matches its invoice branch.
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payment transactions full access policy" ON public.payment_transactions;
DROP POLICY IF EXISTS "Authenticated manage payments" ON public.payment_transactions;
DROP POLICY IF EXISTS "Payment branch isolation" ON public.payment_transactions;

CREATE POLICY "Payment branch isolation select"
  ON public.payment_transactions
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND public.user_can_access_branch(branch_id)
    )
  );

CREATE POLICY "Payment branch isolation manage"
  ON public.payment_transactions
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND public.user_can_access_branch(branch_id)
      AND EXISTS (
        SELECT 1
        FROM public.invoices i
        WHERE i.id = payment_transactions.invoice_id
          AND i.branch_id = payment_transactions.branch_id
          AND public.user_can_access_branch(i.branch_id)
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND public.user_can_access_branch(branch_id)
      AND EXISTS (
        SELECT 1
        FROM public.invoices i
        WHERE i.id = payment_transactions.invoice_id
          AND i.branch_id = payment_transactions.branch_id
          AND public.user_can_access_branch(i.branch_id)
      )
    )
  );
