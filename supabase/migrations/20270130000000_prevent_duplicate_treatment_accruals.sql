DO $$
DECLARE
  v_obsolete_rule_id UUID := 'b30aa9b9-fb1d-4f56-b497-f5698ee3ecd0';
  v_preferred_rule_id UUID := 'ec762140-7cd1-4a41-a143-77fb3ab81072';
  v_staff_id UUID;
  v_preferred_rate NUMERIC(12, 2);
BEGIN
  SELECT obsolete.staff_id, preferred.value_snapshot
  INTO v_staff_id, v_preferred_rate
  FROM public.staff_compensation_rules obsolete
  JOIN public.staff_compensation_rules preferred
    ON preferred.staff_id = obsolete.staff_id
   AND preferred.id = v_preferred_rule_id
   AND preferred.rule_type_snapshot = 'PERCENTAGE'
   AND preferred.value_snapshot = 28
   AND preferred.service_id IS NULL
   AND preferred.branch_id IS NOT NULL
   AND preferred.is_active
  WHERE obsolete.id = v_obsolete_rule_id
    AND obsolete.name = 'sharing'
    AND obsolete.rule_type_snapshot = 'PERCENTAGE'
    AND obsolete.value_snapshot = 24;

  IF v_staff_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.compensation_accruals obsolete
      JOIN public.compensation_accruals preferred
        ON preferred.source_id = obsolete.source_id
       AND preferred.staff_id = obsolete.staff_id
       AND preferred.rule_id_snapshot = v_preferred_rule_id::TEXT
      WHERE obsolete.staff_id = v_staff_id
        AND obsolete.rule_id_snapshot = v_obsolete_rule_id::TEXT
        AND obsolete.accrued_at >= TIMESTAMPTZ '2026-11-01 00:00:00+07'
        AND obsolete.accrued_at < TIMESTAMPTZ '2026-11-02 00:00:00+07'
        AND (
          EXISTS (
            SELECT 1
            FROM public.payroll_items item
            WHERE item.source_id IN (obsolete.id::TEXT, preferred.id::TEXT)
          )
          OR EXISTS (
            SELECT 1
            FROM public.journal_entries journal
            WHERE journal.source_type = 'COMPENSATION'
              AND journal.source_id IN (obsolete.id::TEXT, preferred.id::TEXT)
          )
        )
    ) THEN
      RAISE EXCEPTION 'Akrual duplikat Regina sudah terkait payroll atau jurnal; koreksi otomatis dibatalkan.';
    END IF;

    UPDATE public.compensation_accruals preferred
    SET value_snapshot = v_preferred_rate,
        amount = ROUND(preferred.base_amount_snapshot * v_preferred_rate / 100)::BIGINT
    WHERE preferred.staff_id = v_staff_id
      AND preferred.rule_id_snapshot = v_preferred_rule_id::TEXT
      AND preferred.accrued_at >= TIMESTAMPTZ '2026-11-01 00:00:00+07'
      AND preferred.accrued_at < TIMESTAMPTZ '2026-11-02 00:00:00+07'
      AND EXISTS (
        SELECT 1
        FROM public.compensation_accruals obsolete
        WHERE obsolete.staff_id = preferred.staff_id
          AND obsolete.source_id = preferred.source_id
          AND obsolete.rule_id_snapshot = v_obsolete_rule_id::TEXT
          AND obsolete.accrued_at >= TIMESTAMPTZ '2026-11-01 00:00:00+07'
          AND obsolete.accrued_at < TIMESTAMPTZ '2026-11-02 00:00:00+07'
      );

    DELETE FROM public.compensation_accruals obsolete
    WHERE obsolete.staff_id = v_staff_id
      AND obsolete.rule_id_snapshot = v_obsolete_rule_id::TEXT
      AND obsolete.accrued_at >= TIMESTAMPTZ '2026-11-01 00:00:00+07'
      AND obsolete.accrued_at < TIMESTAMPTZ '2026-11-02 00:00:00+07'
      AND EXISTS (
        SELECT 1
        FROM public.compensation_accruals preferred
        WHERE preferred.staff_id = obsolete.staff_id
          AND preferred.source_id = obsolete.source_id
          AND preferred.rule_id_snapshot = v_preferred_rule_id::TEXT
          AND preferred.accrued_at >= TIMESTAMPTZ '2026-11-01 00:00:00+07'
          AND preferred.accrued_at < TIMESTAMPTZ '2026-11-02 00:00:00+07'
      );

    UPDATE public.staff_compensation_rules
    SET is_active = false,
        updated_at = now()
    WHERE id = v_obsolete_rule_id
      AND staff_id = v_staff_id;
  END IF;
END;
$$;

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
        JOIN public.staff_compensation_rules rule
          ON rule.id::TEXT = compensation_accruals.rule_id_snapshot
         AND rule.staff_id = compensation_accruals.staff_id
        JOIN public.invoices invoice
          ON invoice.visit_id = job.visit_id
         AND invoice.status = 'PAID'
        JOIN public.invoice_items invoice_item
          ON invoice_item.invoice_id = invoice.id
         AND invoice_item.treatment_job_id = job.id
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
          AND NOT EXISTS (
            SELECT 1
            FROM public.staff_compensation_rules candidate
            WHERE candidate.staff_id = rule.staff_id
              AND candidate.rule_type_snapshot = rule.rule_type_snapshot
              AND candidate.id <> rule.id
              AND candidate.is_active
              AND (candidate.service_id IS NULL OR candidate.service_id = job.service_id)
              AND (candidate.branch_id IS NULL OR candidate.branch_id = job.branch_id)
              AND (candidate.effective_start_date IS NULL OR candidate.effective_start_date <= COALESCE((job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE))
              AND (candidate.effective_end_date IS NULL OR candidate.effective_end_date >= COALESCE((job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE))
              AND (
                (
                  (CASE WHEN candidate.service_id IS NOT NULL THEN 2 ELSE 0 END
                    + CASE WHEN candidate.branch_id IS NOT NULL THEN 1 ELSE 0 END)
                  >
                  (CASE WHEN rule.service_id IS NOT NULL THEN 2 ELSE 0 END
                    + CASE WHEN rule.branch_id IS NOT NULL THEN 1 ELSE 0 END)
                )
                OR (
                  (CASE WHEN candidate.service_id IS NOT NULL THEN 2 ELSE 0 END
                    + CASE WHEN candidate.branch_id IS NOT NULL THEN 1 ELSE 0 END)
                  =
                  (CASE WHEN rule.service_id IS NOT NULL THEN 2 ELSE 0 END
                    + CASE WHEN rule.branch_id IS NOT NULL THEN 1 ELSE 0 END)
                  AND (
                    candidate.created_at > rule.created_at
                    OR (candidate.created_at = rule.created_at AND candidate.id > rule.id)
                  )
                )
              )
          )
          AND (
            SELECT COUNT(*)
            FROM public.invoices paid_invoice
            JOIN public.invoice_items linked_item ON linked_item.invoice_id = paid_invoice.id
            WHERE paid_invoice.visit_id = job.visit_id
              AND paid_invoice.status = 'PAID'
              AND linked_item.treatment_job_id = job.id
          ) = 1
          AND compensation_accruals.base_amount_snapshot =
            public.invoice_line_amount_after_discount(invoice.id, invoice_item.id)
          AND compensation_accruals.amount = CASE
            WHEN rule.rule_type_snapshot = 'PERCENTAGE'
              THEN ROUND(compensation_accruals.base_amount_snapshot * rule.value_snapshot / 100)::BIGINT
            ELSE ROUND(rule.value_snapshot)::BIGINT
          END
      )
    )
  );

NOTIFY pgrst, 'reload schema';
