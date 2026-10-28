CREATE OR REPLACE FUNCTION public.invoice_line_amount_after_discount(
  p_invoice_id UUID,
  p_invoice_item_id UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_amount BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.invoices invoice
    JOIN public.invoice_items item ON item.invoice_id = invoice.id
    WHERE invoice.id = p_invoice_id
      AND item.id = p_invoice_item_id
      AND (
        public.is_super_admin()
        OR public.user_can_access_branch(invoice.branch_id)
        OR public.user_can_manage_treatment_branch(invoice.branch_id)
      )
  ) THEN
    RETURN NULL;
  END IF;

  WITH invoice_base AS (
    SELECT GREATEST(0, invoice.total_amount - invoice.discount_amount)::NUMERIC AS distributable
    FROM public.invoices invoice
    WHERE invoice.id = p_invoice_id
  ),
  line_amounts AS (
    SELECT
      item.id,
      GREATEST(0, item.amount)::NUMERIC AS amount,
      invoice_base.distributable,
      SUM(GREATEST(0, item.amount)::NUMERIC) OVER () AS subtotal
    FROM public.invoice_items item
    CROSS JOIN invoice_base
    WHERE item.invoice_id = p_invoice_id
  ),
  line_floors AS (
    SELECT
      id,
      distributable,
      CASE
        WHEN subtotal <= 0 THEN 0::NUMERIC
        ELSE FLOOR(distributable * amount / subtotal)
      END AS floor_amount,
      CASE
        WHEN subtotal <= 0 THEN 0::NUMERIC
        ELSE distributable * amount / subtotal - FLOOR(distributable * amount / subtotal)
      END AS remainder
    FROM line_amounts
  ),
  ranked_lines AS (
    SELECT
      id,
      floor_amount,
      distributable - SUM(floor_amount) OVER () AS remaining_amount,
      ROW_NUMBER() OVER (ORDER BY remainder DESC, id ASC) AS allocation_rank
    FROM line_floors
  )
  SELECT (
    floor_amount + CASE WHEN allocation_rank <= remaining_amount THEN 1 ELSE 0 END
  )::BIGINT
  INTO v_amount
  FROM ranked_lines
  WHERE id = p_invoice_item_id;

  RETURN v_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.invoice_line_amount_after_discount(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_line_amount_after_discount(UUID, UUID) TO authenticated, service_role;

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

CREATE OR REPLACE FUNCTION public.guard_overtime_eligible_position()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'APPROVED'
    AND NOT EXISTS (
      SELECT 1
      FROM public.staff employee
      WHERE employee.id = NEW.staff_id
        AND employee.position IN ('BRANCH_ADMIN', 'ASSISTANT')
    ) THEN
    RAISE EXCEPTION 'Lembur hanya dapat disetujui untuk Asisten Dokter dan Admin Cabang.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_overtime_eligible_position() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_overtime_eligible_position ON public.overtime_records;
CREATE TRIGGER guard_overtime_eligible_position
  BEFORE INSERT OR UPDATE ON public.overtime_records
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_overtime_eligible_position();
