ALTER TABLE public.patient_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Visit branch isolation" ON public.patient_visits;
CREATE POLICY "Patient visit read own or staff branch"
  ON public.patient_visits
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_can_access_branch(branch_id)
    OR (
      public.get_user_role() = 'PATIENT'
      AND patient_id::TEXT = public.get_user_patient_id()::TEXT
    )
  );

CREATE POLICY "Staff manage visits by branch"
  ON public.patient_visits
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_can_access_branch(branch_id)
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.user_can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS "Queue branch isolation" ON public.queue_items;
DROP POLICY IF EXISTS "Queue items full access policy" ON public.queue_items;
DROP POLICY IF EXISTS "Authenticated manage queue items" ON public.queue_items;

CREATE POLICY "Patient queue read own or staff branch"
  ON public.queue_items
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_can_access_branch(branch_id)
    OR (
      public.get_user_role() = 'PATIENT'
      AND patient_id::TEXT = public.get_user_patient_id()::TEXT
    )
  );

CREATE POLICY "Staff manage queue by branch"
  ON public.queue_items
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_can_access_branch(branch_id)
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.user_can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS "Invoice items isolation" ON public.invoice_items;
DROP POLICY IF EXISTS "Invoice items full access policy" ON public.invoice_items;

CREATE POLICY "Invoice items read own or staff branch"
  ON public.invoice_items
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.invoices invoice
      WHERE invoice.id = invoice_items.invoice_id
        AND (
          (
            public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
            AND public.user_can_access_branch(invoice.branch_id)
          )
          OR (
            public.get_user_role() = 'PATIENT'
            AND invoice.patient_id::TEXT = public.get_user_patient_id()::TEXT
          )
        )
    )
  );

CREATE POLICY "Staff manage invoice items"
  ON public.invoice_items
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND EXISTS (
        SELECT 1
        FROM public.invoices invoice
        WHERE invoice.id = invoice_items.invoice_id
          AND public.user_can_access_branch(invoice.branch_id)
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND EXISTS (
        SELECT 1
        FROM public.invoices invoice
        WHERE invoice.id = invoice_items.invoice_id
          AND public.user_can_access_branch(invoice.branch_id)
      )
    )
  );

DROP POLICY IF EXISTS "Payment branch isolation" ON public.payment_transactions;
DROP POLICY IF EXISTS "Payment branch isolation select" ON public.payment_transactions;
DROP POLICY IF EXISTS "Payment branch isolation manage" ON public.payment_transactions;

CREATE POLICY "Payment read own invoice or staff branch"
  ON public.payment_transactions
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND public.user_can_access_branch(branch_id)
    )
    OR (
      public.get_user_role() = 'PATIENT'
      AND EXISTS (
        SELECT 1
        FROM public.invoices invoice
        WHERE invoice.id = payment_transactions.invoice_id
          AND invoice.patient_id::TEXT = public.get_user_patient_id()::TEXT
      )
    )
  );

CREATE POLICY "Staff manage payments by branch"
  ON public.payment_transactions
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND public.user_can_access_branch(branch_id)
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND public.user_can_access_branch(branch_id)
      AND EXISTS (
        SELECT 1
        FROM public.invoices invoice
        WHERE invoice.id = payment_transactions.invoice_id
          AND invoice.branch_id = payment_transactions.branch_id
          AND public.user_can_access_branch(invoice.branch_id)
      )
    )
  );
