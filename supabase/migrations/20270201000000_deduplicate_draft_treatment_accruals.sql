DO $$
DECLARE
  v_linked_unsafe_count INTEGER;
  v_deleted_accrual_count INTEGER;
  v_payroll_id UUID;
  v_gross_income BIGINT;
  v_non_tax_deductions BIGINT;
  v_tax_item_id UUID;
  v_tax_rate NUMERIC;
  v_tax_amount BIGINT;
  v_total_deductions BIGINT;
  v_total_compensation BIGINT;
BEGIN
  CREATE TEMP TABLE treatment_accrual_dedup_plan
  ON COMMIT DROP
  AS
  WITH eligible_accruals AS (
    SELECT
      accrual.id,
      accrual.source_id,
      accrual.staff_id,
      accrual.rule_type_snapshot,
      rule.id AS rule_id,
      rule.service_id,
      rule.branch_id,
      rule.created_at,
      (
        CASE WHEN rule.service_id IS NOT NULL THEN 2 ELSE 0 END
        + CASE WHEN rule.branch_id IS NOT NULL THEN 1 ELSE 0 END
      ) AS specificity
    FROM public.compensation_accruals accrual
    JOIN public.treatment_jobs job
      ON job.id::TEXT = accrual.source_id
    JOIN public.staff_compensation_rules rule
      ON rule.id::TEXT = accrual.rule_id_snapshot
     AND rule.staff_id = accrual.staff_id
     AND rule.rule_type_snapshot = accrual.rule_type_snapshot
    WHERE accrual.rule_type_snapshot IN ('PERCENTAGE', 'FIXED_PER_TREATMENT')
      AND job.external_doctor_id IS NULL
      AND job.status IN ('SELESAI', 'DISERAHKAN')
      AND rule.is_active
      AND (rule.service_id IS NULL OR rule.service_id = job.service_id)
      AND (rule.branch_id IS NULL OR rule.branch_id = job.branch_id)
      AND (
        rule.effective_start_date IS NULL
        OR rule.effective_start_date <= COALESCE(
          (job.completed_at AT TIME ZONE 'Asia/Jakarta')::DATE,
          (accrual.accrued_at AT TIME ZONE 'Asia/Jakarta')::DATE
        )
      )
      AND (
        rule.effective_end_date IS NULL
        OR rule.effective_end_date >= COALESCE(
          (job.completed_at AT TIME ZONE 'Asia/Jakarta')::DATE,
          (accrual.accrued_at AT TIME ZONE 'Asia/Jakarta')::DATE
        )
      )
      AND (
        job.pic_assistant_id = accrual.staff_id
        OR EXISTS (
          SELECT 1
          FROM public.dental_doctors doctor
          WHERE doctor.id = job.doctor_id
            AND doctor.staff_id = accrual.staff_id
        )
      )
  ),
  ranked_accruals AS (
    SELECT
      eligible.*,
      ROW_NUMBER() OVER (
        PARTITION BY source_id, staff_id, rule_type_snapshot
        ORDER BY specificity DESC, created_at DESC, rule_id DESC, id DESC
      ) AS rule_rank,
      COUNT(*) OVER (
        PARTITION BY source_id, staff_id, rule_type_snapshot
      ) AS matching_rule_count
    FROM eligible_accruals eligible
  )
  SELECT id, source_id, staff_id, rule_type_snapshot, rule_rank
  FROM ranked_accruals
  WHERE matching_rule_count > 1
    AND rule_rank > 1;

  CREATE TEMP TABLE treatment_accrual_affected_payrolls
  ON COMMIT DROP
  AS
  SELECT DISTINCT payroll.id AS payroll_id
  FROM treatment_accrual_dedup_plan plan
  JOIN public.payroll_items item
    ON item.source_id = plan.id::TEXT
  JOIN public.monthly_payrolls payroll
    ON payroll.id = item.payroll_id;

  SELECT COUNT(*)
  INTO v_linked_unsafe_count
  FROM treatment_accrual_dedup_plan plan
  WHERE EXISTS (
    SELECT 1
    FROM public.journal_entries journal
    WHERE journal.source_type = 'COMPENSATION'
      AND journal.source_id = plan.id::TEXT
  )
  OR EXISTS (
    SELECT 1
    FROM public.payroll_items item
    JOIN public.monthly_payrolls payroll
      ON payroll.id = item.payroll_id
    WHERE item.source_id = plan.id::TEXT
      AND payroll.status <> 'DRAFT'
  );

  IF v_linked_unsafe_count > 0 THEN
    RAISE EXCEPTION
      'Ditemukan % akrual duplikat yang terkait payroll non-DRAFT atau jurnal. Tidak ada perubahan dilakukan; periksa manual.',
      v_linked_unsafe_count;
  END IF;

  DELETE FROM public.payroll_items item
  USING treatment_accrual_dedup_plan plan
  WHERE item.source_id = plan.id::TEXT;

  DELETE FROM public.compensation_accruals accrual
  USING treatment_accrual_dedup_plan plan
  WHERE accrual.id = plan.id;

  GET DIAGNOSTICS v_deleted_accrual_count = ROW_COUNT;

  FOR v_payroll_id IN
    SELECT payroll_id FROM treatment_accrual_affected_payrolls
  LOOP
    SELECT
      COALESCE(SUM(item.amount_snapshot) FILTER (WHERE item.type = 'EARNING'), 0),
      COALESCE(SUM(item.amount_snapshot) FILTER (
        WHERE item.type = 'DEDUCTION'
          AND item.description_snapshot NOT LIKE 'Potongan Pajak (%'
      ), 0),
      (array_agg(item.id) FILTER (
        WHERE item.type = 'DEDUCTION'
          AND item.description_snapshot LIKE 'Potongan Pajak (%'
      ))[1],
      COALESCE(SUM(item.amount_snapshot) FILTER (
        WHERE item.type = 'EARNING'
          AND item.description_snapshot !~* '^(gaji pokok|lembur disetujui)'
      ), 0)
    INTO v_gross_income, v_non_tax_deductions, v_tax_item_id, v_total_compensation
    FROM public.payroll_items item
    WHERE item.payroll_id = v_payroll_id;

    v_tax_amount := 0;
    IF v_tax_item_id IS NOT NULL THEN
      SELECT substring(description_snapshot FROM '^Potongan Pajak \(([0-9]+([.][0-9]+)?)% dari bruto\)$')::NUMERIC
      INTO v_tax_rate
      FROM public.payroll_items
      WHERE id = v_tax_item_id;

      IF v_tax_rate IS NULL OR v_tax_rate < 0 OR v_tax_rate > 100 THEN
        RAISE EXCEPTION 'Format tarif pajak pada payroll Draft % tidak valid; tidak dapat menyelesaikan koreksi.', v_payroll_id;
      END IF;

      v_tax_amount := ROUND(v_gross_income * v_tax_rate / 100)::BIGINT;
      UPDATE public.payroll_items
      SET amount_snapshot = v_tax_amount
      WHERE id = v_tax_item_id;
    END IF;

    v_total_deductions := v_non_tax_deductions + v_tax_amount;
    UPDATE public.monthly_payrolls
    SET total_compensation = v_total_compensation,
        total_deductions = v_total_deductions,
        net_salary = v_gross_income - v_total_deductions,
        updated_at = NOW()
    WHERE id = v_payroll_id
      AND status = 'DRAFT';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payroll % berubah status saat koreksi. Tidak dapat menyelesaikan migration.', v_payroll_id;
    END IF;
  END LOOP;

  RAISE NOTICE 'Akrual duplikat dihapus: %. Payroll DRAFT dihitung ulang: %.',
    v_deleted_accrual_count,
    (SELECT COUNT(*) FROM treatment_accrual_affected_payrolls);
END;
$$;
