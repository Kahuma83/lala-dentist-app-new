CREATE OR REPLACE FUNCTION public.user_can_view_compensation_staff(target_staff_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.is_super_admin()
    OR public.get_user_staff_id() = target_staff_id
    OR EXISTS (
      SELECT 1
      FROM public.user_accounts ua
      JOIN public.dental_doctors d ON d.id = ua.doctor_id
      WHERE ua.auth_user_id = auth.uid()
        AND ua.active = true
        AND d.staff_id = target_staff_id
    );
$$;

REVOKE ALL ON FUNCTION public.user_can_view_compensation_staff(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_view_compensation_staff(UUID) TO authenticated;

ALTER TABLE public.staff_compensation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_accruals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.staff_compensation_rules, public.compensation_accruals FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_compensation_rules, public.compensation_accruals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_compensation_rules, public.compensation_accruals TO service_role;

DO $$
DECLARE
  existing_policy RECORD;
BEGIN
  FOR existing_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('staff_compensation_rules', 'compensation_accruals')
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Compensation rules read access" ON public.staff_compensation_rules;
CREATE POLICY "Compensation rules read access"
  ON public.staff_compensation_rules
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_can_view_compensation_staff(staff_id)
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND EXISTS (
        SELECT 1
        FROM public.staff s
        WHERE s.id = staff_compensation_rules.staff_id
          AND s.branch_id::TEXT = public.get_user_branch_id()::TEXT
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.treatment_jobs job
      WHERE job.status IN ('SELESAI', 'DISERAHKAN')
        AND public.user_can_manage_treatment_branch(job.branch_id)
        AND (
          job.pic_assistant_id = staff_compensation_rules.staff_id
          OR EXISTS (
            SELECT 1
            FROM public.dental_doctors doctor
            WHERE doctor.id = job.doctor_id
              AND doctor.staff_id = staff_compensation_rules.staff_id
          )
        )
        AND (staff_compensation_rules.branch_id IS NULL OR staff_compensation_rules.branch_id = job.branch_id)
        AND (staff_compensation_rules.service_id IS NULL OR staff_compensation_rules.service_id = job.service_id)
        AND (staff_compensation_rules.effective_start_date IS NULL OR staff_compensation_rules.effective_start_date <= COALESCE((job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE))
        AND (staff_compensation_rules.effective_end_date IS NULL OR staff_compensation_rules.effective_end_date >= COALESCE((job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE))
    )
  );

DROP POLICY IF EXISTS "Super admin manages compensation rules" ON public.staff_compensation_rules;
CREATE POLICY "Super admin manages compensation rules"
  ON public.staff_compensation_rules
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Compensation accrual read access" ON public.compensation_accruals;
CREATE POLICY "Compensation accrual read access"
  ON public.compensation_accruals
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_can_view_compensation_staff(staff_id)
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
    )
  );

DROP POLICY IF EXISTS "Validated compensation accrual insert" ON public.compensation_accruals;
CREATE POLICY "Validated compensation accrual insert"
  ON public.compensation_accruals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      branch_id IS NOT NULL
      AND public.user_can_manage_treatment_branch(branch_id)
      AND EXISTS (
        SELECT 1
        FROM public.treatment_jobs job
        JOIN public.master_services service ON service.id = job.service_id
        JOIN public.staff_compensation_rules rule
          ON rule.id::TEXT = compensation_accruals.rule_id_snapshot
         AND rule.staff_id = compensation_accruals.staff_id
        WHERE job.id::TEXT = compensation_accruals.source_id
          AND job.branch_id = compensation_accruals.branch_id
          AND job.status IN ('SELESAI', 'DISERAHKAN')
          AND (
            job.pic_assistant_id = compensation_accruals.staff_id
            OR EXISTS (
              SELECT 1
              FROM public.dental_doctors doctor
              WHERE doctor.id = job.doctor_id
                AND doctor.staff_id = compensation_accruals.staff_id
            )
          )
          AND rule.is_active
          AND rule.rule_type_snapshot = compensation_accruals.rule_type_snapshot
          AND rule.rule_type_snapshot IN ('PERCENTAGE', 'FIXED_PER_TREATMENT')
          AND rule.value_snapshot = compensation_accruals.value_snapshot
          AND (rule.service_id IS NULL OR rule.service_id = job.service_id)
          AND (rule.branch_id IS NULL OR rule.branch_id = job.branch_id)
          AND (rule.effective_start_date IS NULL OR rule.effective_start_date <= COALESCE((job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE))
          AND (rule.effective_end_date IS NULL OR rule.effective_end_date >= COALESCE((job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE))
          AND compensation_accruals.base_amount_snapshot = ROUND(COALESCE(service.base_price::NUMERIC, 0))::BIGINT
          AND compensation_accruals.amount = CASE
            WHEN rule.rule_type_snapshot = 'PERCENTAGE'
              THEN ROUND(ROUND(COALESCE(service.base_price::NUMERIC, 0)) * rule.value_snapshot / 100)::BIGINT
            ELSE ROUND(rule.value_snapshot)::BIGINT
          END
      )
    )
  );

DROP POLICY IF EXISTS "Super admin or branch admin deletes compensation accruals" ON public.compensation_accruals;
CREATE POLICY "Super admin or branch admin deletes compensation accruals"
  ON public.compensation_accruals
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_compensation_accrual_source_staff_rule
  ON public.compensation_accruals(source_id, staff_id, rule_id_snapshot);
