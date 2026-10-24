DO $$
DECLARE
  check_constraint RECORD;
BEGIN
  FOR check_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.staff_compensation_rules'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%rule_type_snapshot%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.staff_compensation_rules DROP CONSTRAINT %I',
      check_constraint.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE public.staff_compensation_rules
  ADD CONSTRAINT staff_compensation_rules_rule_type_check
  CHECK (rule_type_snapshot IN (
    'PERCENTAGE',
    'FIXED_PER_TREATMENT',
    'BASE_SALARY',
    'DOCTOR_SITTING_FEE',
    'TAX_PERCENTAGE'
  )),
  ADD CONSTRAINT staff_compensation_rules_tax_scope_check
  CHECK (
    rule_type_snapshot <> 'TAX_PERCENTAGE'
    OR (branch_id IS NOT NULL AND service_id IS NULL AND value_snapshot BETWEEN 0 AND 100)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_branch_active_payroll_tax
  ON public.staff_compensation_rules(staff_id, branch_id)
  WHERE is_active AND rule_type_snapshot = 'TAX_PERCENTAGE';

ALTER TABLE public.monthly_payrolls
  DROP CONSTRAINT IF EXISTS uq_monthly_payroll;

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_payroll_branch_period
  ON public.monthly_payrolls(staff_id, branch_id, month, year)
  WHERE branch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_payroll_global_period
  ON public.monthly_payrolls(staff_id, month, year)
  WHERE branch_id IS NULL;

DROP POLICY IF EXISTS "Super admin manages compensation rules" ON public.staff_compensation_rules;
DROP POLICY IF EXISTS "Super admin and branch admins manage scoped compensation rules" ON public.staff_compensation_rules;
CREATE POLICY "Super admin and branch admins manage scoped compensation rules"
  ON public.staff_compensation_rules
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id IS NOT NULL
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id IS NOT NULL
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
    )
  );

DROP POLICY IF EXISTS "Branch admins read scoped compensation rules" ON public.staff_compensation_rules;
CREATE POLICY "Branch admins read scoped compensation rules"
  ON public.staff_compensation_rules
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'BRANCH_ADMIN'
    AND branch_id IS NOT NULL
    AND branch_id::TEXT = public.get_user_branch_id()::TEXT
  );
