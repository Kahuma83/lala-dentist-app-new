DO $$
DECLARE
  v_unsafe_count INTEGER;
  v_updated_accrual_count INTEGER;
  v_payroll_id UUID;
  v_gross_income BIGINT;
  v_non_tax_deductions BIGINT;
  v_tax_item_id UUID;
  v_tax_rate NUMERIC;
  v_tax_amount BIGINT;
  v_total_deductions BIGINT;
  v_total_compensation BIGINT;
BEGIN
  CREATE TEMP TABLE treatment_accrual_rate_correction_plan
  ON COMMIT DROP
  AS
  WITH applicable_rules AS (
    SELECT
      job.id::TEXT AS source_id,
      rule.staff_id,
      rule.rule_type_snapshot,
      rule.id AS current_rule_id,
      rule.value_snapshot AS current_value,
      ROW_NUMBER() OVER (
        PARTITION BY job.id, rule.staff_id, rule.rule_type_snapshot
        ORDER BY
          (CASE WHEN rule.service_id IS NOT NULL THEN 2 ELSE 0 END
            + CASE WHEN rule.branch_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
          rule.created_at DESC,
          rule.id DESC
      ) AS rule_rank
    FROM public.treatment_jobs job
    JOIN public.staff_compensation_rules rule
      ON rule.rule_type_snapshot = 'PERCENTAGE'
     AND rule.is_active
     AND (rule.service_id IS NULL OR rule.service_id = job.service_id)
     AND (rule.branch_id IS NULL OR rule.branch_id = job.branch_id)
     AND (
       rule.effective_start_date IS NULL
       OR rule.effective_start_date <= COALESCE((job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE)
     )
     AND (
       rule.effective_end_date IS NULL
       OR rule.effective_end_date >= COALESCE((job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE)
     )
    WHERE job.external_doctor_id IS NULL
      AND job.status IN ('SELESAI', 'DISERAHKAN')
      AND (
        job.pic_assistant_id = rule.staff_id
        OR EXISTS (
          SELECT 1
          FROM public.dental_doctors doctor
          WHERE doctor.id = job.doctor_id
            AND doctor.staff_id = rule.staff_id
        )
      )
  ),
  selected_rules AS (
    SELECT *
    FROM applicable_rules
    WHERE rule_rank = 1
  )
  SELECT
    accrual.id AS accrual_id,
    selected.source_id,
    selected.staff_id,
    selected.current_rule_id,
    selected.current_value,
    accrual.value_snapshot AS old_value,
    accrual.amount AS old_amount,
    accrual.base_amount_snapshot,
    ROUND(accrual.base_amount_snapshot * selected.current_value / 100)::BIGINT AS corrected_amount,
    accrual.accrued_at
  FROM selected_rules selected
  JOIN public.compensation_accruals accrual
    ON accrual.source_id = selected.source_id
   AND accrual.staff_id = selected.staff_id
   AND accrual.rule_type_snapshot = selected.rule_type_snapshot
   AND accrual.rule_id_snapshot = selected.current_rule_id::TEXT
  WHERE accrual.rule_type_snapshot = 'PERCENTAGE'
    AND (
      accrual.value_snapshot <> selected.current_value
      OR accrual.amount <> ROUND(accrual.base_amount_snapshot * selected.current_value / 100)::BIGINT
    );

  PERFORM payroll.id
  FROM public.monthly_payrolls payroll
  JOIN public.payroll_items item
    ON item.payroll_id = payroll.id
  JOIN treatment_accrual_rate_correction_plan plan
    ON item.source_id = plan.accrual_id::TEXT
  FOR UPDATE OF payroll;

  SELECT COUNT(*)
  INTO v_unsafe_count
  FROM treatment_accrual_rate_correction_plan plan
  WHERE EXISTS (
    SELECT 1
    FROM public.journal_entries journal
    WHERE journal.source_type = 'COMPENSATION'
      AND journal.source_id = plan.accrual_id::TEXT
  )
  OR EXISTS (
    SELECT 1
    FROM public.payroll_items item
    JOIN public.monthly_payrolls payroll
      ON payroll.id = item.payroll_id
    WHERE item.source_id = plan.accrual_id::TEXT
      AND (
        payroll.status <> 'DRAFT'
        OR payroll.staff_id <> plan.staff_id
        OR payroll.month <> EXTRACT(MONTH FROM plan.accrued_at AT TIME ZONE 'Asia/Jakarta')
        OR payroll.year <> EXTRACT(YEAR FROM plan.accrued_at AT TIME ZONE 'Asia/Jakarta')
        OR EXISTS (
          SELECT 1
          FROM public.journal_entries journal
          WHERE journal.source_type = 'PAYROLL'
            AND journal.source_id = payroll.id::TEXT
        )
      )
  );

  IF v_unsafe_count > 0 THEN
    RAISE EXCEPTION
      'Ditemukan % akrual dengan payroll/jurnal yang sudah diposting atau periode tidak cocok. Tidak ada perubahan dilakukan.',
      v_unsafe_count;
  END IF;

  UPDATE public.compensation_accruals accrual
  SET value_snapshot = plan.current_value,
      amount = plan.corrected_amount
  FROM treatment_accrual_rate_correction_plan plan
  WHERE accrual.id = plan.accrual_id;

  GET DIAGNOSTICS v_updated_accrual_count = ROW_COUNT;

  UPDATE public.payroll_items item
  SET amount_snapshot = plan.corrected_amount
  FROM treatment_accrual_rate_correction_plan plan
  WHERE item.source_id = plan.accrual_id::TEXT;

  CREATE TEMP TABLE treatment_accrual_rate_affected_payrolls
  ON COMMIT DROP
  AS
  SELECT DISTINCT payroll.id AS payroll_id
  FROM treatment_accrual_rate_correction_plan plan
  JOIN public.payroll_items item
    ON item.source_id = plan.accrual_id::TEXT
  JOIN public.monthly_payrolls payroll
    ON payroll.id = item.payroll_id;

  FOR v_payroll_id IN
    SELECT payroll_id FROM treatment_accrual_rate_affected_payrolls
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
        RAISE EXCEPTION
          'Format tarif pajak pada payroll DRAFT % tidak valid. Tidak ada perubahan dilakukan.',
          v_payroll_id;
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
      RAISE EXCEPTION
        'Payroll % berubah status saat koreksi. Tidak dapat menyelesaikan migration.',
        v_payroll_id;
    END IF;
  END LOOP;

  RAISE NOTICE 'Akrual dengan tarif snapshot yang dikoreksi: %. Payroll DRAFT dihitung ulang: %.',
    v_updated_accrual_count,
    (SELECT COUNT(*) FROM treatment_accrual_rate_affected_payrolls);
END;
$$;
