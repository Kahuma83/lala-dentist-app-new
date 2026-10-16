-- Keep invoice access branch-scoped while resolving branch aliases consistently.
-- This migration replaces legacy permissive fallback policies and direct ID comparisons.

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoices full access policy" ON public.invoices;
DROP POLICY IF EXISTS "Invoice branch isolation select" ON public.invoices;
DROP POLICY IF EXISTS "Invoice branch isolation manage" ON public.invoices;
DROP POLICY IF EXISTS "Invoice items full access policy" ON public.invoice_items;
DROP POLICY IF EXISTS "Invoice items isolation" ON public.invoice_items;

CREATE POLICY "Invoice branch isolation select"
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'PATIENT'
      AND patient_id::TEXT = public.get_user_patient_id()::TEXT
    )
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
      AND public.user_can_access_branch(branch_id)
    )
  );

CREATE POLICY "Invoice branch isolation manage"
  ON public.invoices
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
    )
  );

CREATE POLICY "Invoice items isolation"
  ON public.invoice_items
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id
        AND (
          (
            public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
            AND public.user_can_access_branch(i.branch_id)
          )
          OR (
            public.get_user_role() = 'PATIENT'
            AND i.patient_id::TEXT = public.get_user_patient_id()::TEXT
          )
        )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND EXISTS (
        SELECT 1
        FROM public.invoices i
        WHERE i.id = invoice_items.invoice_id
          AND public.user_can_access_branch(i.branch_id)
      )
    )
  );
