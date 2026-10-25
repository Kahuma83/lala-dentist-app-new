DROP POLICY IF EXISTS "Validated compensation accrual insert"
  ON public.compensation_accruals;

CREATE POLICY "Validated compensation accrual insert"
  ON public.compensation_accruals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      branch_id IS NOT NULL
      AND (
        (
          public.get_user_role() = 'BRANCH_ADMIN'
          AND public.user_can_access_branch(branch_id)
        )
        OR public.user_can_manage_treatment_branch(branch_id)
      )
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
