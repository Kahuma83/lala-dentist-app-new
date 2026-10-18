CREATE OR REPLACE FUNCTION public.employee_portal_can_manage_branch(target_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND public.get_user_branch_id()::TEXT = target_branch_id::TEXT
    );
$$;

REVOKE ALL ON FUNCTION public.employee_portal_can_manage_branch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_portal_can_manage_branch(UUID) TO authenticated;

ALTER TABLE public.staff_shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.staff_shift_assignments,
  public.work_shifts,
  public.overtime_records,
  public.monthly_payrolls,
  public.payroll_items
FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.staff_shift_assignments,
  public.work_shifts,
  public.overtime_records,
  public.monthly_payrolls,
  public.payroll_items
TO authenticated, service_role;

DROP POLICY IF EXISTS "Employee portal shift assignment read" ON public.staff_shift_assignments;
CREATE POLICY "Employee portal shift assignment read"
  ON public.staff_shift_assignments
  FOR SELECT
  TO authenticated
  USING (
    staff_id = public.get_user_staff_id()
    OR public.employee_portal_can_manage_branch(branch_id)
  );

DROP POLICY IF EXISTS "Employee portal shift assignment management" ON public.staff_shift_assignments;
CREATE POLICY "Employee portal shift assignment management"
  ON public.staff_shift_assignments
  FOR ALL
  TO authenticated
  USING (public.employee_portal_can_manage_branch(branch_id))
  WITH CHECK (public.employee_portal_can_manage_branch(branch_id));

DROP POLICY IF EXISTS "Employee portal work shift read" ON public.work_shifts;
CREATE POLICY "Employee portal work shift read"
  ON public.work_shifts
  FOR SELECT
  TO authenticated
  USING (
    public.employee_portal_can_manage_branch(branch_id)
    OR EXISTS (
      SELECT 1
      FROM public.staff_shift_assignments assignment
      WHERE assignment.shift_id = work_shifts.id
        AND assignment.staff_id = public.get_user_staff_id()
        AND assignment.active = true
    )
  );

DROP POLICY IF EXISTS "Employee portal work shift management" ON public.work_shifts;
CREATE POLICY "Employee portal work shift management"
  ON public.work_shifts
  FOR ALL
  TO authenticated
  USING (public.employee_portal_can_manage_branch(branch_id))
  WITH CHECK (public.employee_portal_can_manage_branch(branch_id));

DROP POLICY IF EXISTS "Employee portal overtime read" ON public.overtime_records;
CREATE POLICY "Employee portal overtime read"
  ON public.overtime_records
  FOR SELECT
  TO authenticated
  USING (
    staff_id = public.get_user_staff_id()
    OR public.employee_portal_can_manage_branch(branch_id)
  );

DROP POLICY IF EXISTS "Employee portal overtime management" ON public.overtime_records;
CREATE POLICY "Employee portal overtime management"
  ON public.overtime_records
  FOR ALL
  TO authenticated
  USING (public.employee_portal_can_manage_branch(branch_id))
  WITH CHECK (public.employee_portal_can_manage_branch(branch_id));

DROP POLICY IF EXISTS "Employee portal payroll read" ON public.monthly_payrolls;
CREATE POLICY "Employee portal payroll read"
  ON public.monthly_payrolls
  FOR SELECT
  TO authenticated
  USING (
    (
      staff_id = public.get_user_staff_id()
      AND status IN ('APPROVED', 'PAID')
    )
    OR public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND (
        branch_id::TEXT = public.get_user_branch_id()::TEXT
        OR (
          branch_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.staff s
            WHERE s.id = monthly_payrolls.staff_id
              AND s.branch_id::TEXT = public.get_user_branch_id()::TEXT
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "Employee portal payroll management" ON public.monthly_payrolls;
CREATE POLICY "Employee portal payroll management"
  ON public.monthly_payrolls
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND (
        branch_id::TEXT = public.get_user_branch_id()::TEXT
        OR (
          branch_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.staff s
            WHERE s.id = monthly_payrolls.staff_id
              AND s.branch_id::TEXT = public.get_user_branch_id()::TEXT
          )
        )
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND (
        branch_id::TEXT = public.get_user_branch_id()::TEXT
        OR (
          branch_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.staff s
            WHERE s.id = monthly_payrolls.staff_id
              AND s.branch_id::TEXT = public.get_user_branch_id()::TEXT
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "Employee portal payroll item read" ON public.payroll_items;
CREATE POLICY "Employee portal payroll item read"
  ON public.payroll_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.monthly_payrolls payroll
      WHERE payroll.id = payroll_items.payroll_id
        AND (
          (
            payroll.staff_id = public.get_user_staff_id()
            AND payroll.status IN ('APPROVED', 'PAID')
          )
          OR public.is_super_admin()
          OR (
            public.get_user_role() = 'BRANCH_ADMIN'
            AND (
              payroll.branch_id::TEXT = public.get_user_branch_id()::TEXT
              OR (
                payroll.branch_id IS NULL
                AND EXISTS (
                  SELECT 1
                  FROM public.staff s
                  WHERE s.id = payroll.staff_id
                    AND s.branch_id::TEXT = public.get_user_branch_id()::TEXT
                )
              )
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "Employee portal payroll item management" ON public.payroll_items;
CREATE POLICY "Employee portal payroll item management"
  ON public.payroll_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.monthly_payrolls payroll
      WHERE payroll.id = payroll_items.payroll_id
        AND public.employee_portal_can_manage_branch(
          COALESCE(
            payroll.branch_id,
            (
              SELECT s.branch_id
              FROM public.staff s
              WHERE s.id = payroll.staff_id
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.monthly_payrolls payroll
      WHERE payroll.id = payroll_items.payroll_id
        AND public.employee_portal_can_manage_branch(
          COALESCE(
            payroll.branch_id,
            (
              SELECT s.branch_id
              FROM public.staff s
              WHERE s.id = payroll.staff_id
            )
          )
        )
    )
  );