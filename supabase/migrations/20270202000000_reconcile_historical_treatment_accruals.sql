DO $$
DECLARE
  v_unsafe_count INTEGER;
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
  CREATE TEMP TABLE treatment_accrual_reconcile_plan
  ON COMMIT DROP
  AS
  WITH duplicate_groups AS (
    SELECT source_id, staff_id, rule_type_snapshot
    FROM public.compensation_accruals
    WHERE rule_type_snapshot IN ('PERCENTAGE', 'FIXED_PER_TREATMENT')
    GROUP BY source_id, staff_id, rule_type_snapshot
    HAVING COUNT(*) > 1
  ),
  eligible_winners AS (
    SELECT
      accrual.id,
      accrual.source_id,
      accrual.staff_id,
      accrual.rule_type_snapshot,
      accrual.base_amount_snapshot,
      rule.value_snapshot,
      rule.id AS rule_id,
      ROW_NUMBER() OVER (
        PARTITION BY accrual.source_id, accrual.staff_id, accrual.rule_type_snapshot
        ORDER BY
          (CASE WHEN rule.service_id IS NOT NULL THEN 2 ELSE 0 END
            + CASE WHEN rule.branch_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
          rule.created_at DESC,
          rule.id DESC,
          accrual.id DESC
      ) AS winner_rank
    FROM duplicate_groups duplicate_group
    JOIN public.compensation_accruals accrual
      ON accrual.source_id = duplicate_group.source_id
     AND accrual.staff_id = duplicate_group.staff_id
     AND accrual.rule_type_snapshot = duplicate_group.rule_type_snapshot
    JOIN public.treatment_jobs job
      ON job.id::TEXT = accrual.source_id
    JOIN public.staff_compensation_rules rule
      ON rule.id::TEXT = accrual.rule_id_snapshot
     AND rule.staff_id = accrual.staff_id
     AND rule.rule_type_snapshot = accrual.rule_type_snapshot
    WHERE job.external_doctor_id IS NULL
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
  winners AS (
    SELECT
      id,
      source_id,
      staff_id,
      rule_type_snapshot,
      value_snapshot,
      CASE
        WHEN rule_type_snapshot = 'PERCENTAGE'
          THEN ROUND(base_amount_snapshot * value_snapshot / 100)::BIGINT
        ELSE ROUND(value_snapshot)::BIGINT
      END AS corrected_amount
    FROM eligible_winners
    WHERE winner_rank = 1
  )
  SELECT
    loser.id AS loser_id,
    winner.id AS winner_id,
    winner.source_id,
    winner.staff_id,
    winner.rule_type_snapshot,
    winner.value_snapshot AS winner_value,
    winner.corrected_amount AS winner_amount
  FROM winners winner
  JOIN public.compensation_accruals loser
    ON loser.source_id = winner.source_id
   AND loser.staff_id = winner.staff_id
   AND loser.rule_type_snapshot = winner.rule_type_snapshot
   AND loser.id <> winner.id;

  CREATE TEMP TABLE treatment_accrual_affected_payrolls
  ON COMMIT DROP
  AS
  SELECT DISTINCT payroll.id AS payroll_id
  FROM treatment_accrual_reconcile_plan plan
  JOIN public.payroll_items item
    ON item.source_id IN (plan.loser_id::TEXT, plan.winner_id::TEXT)
  JOIN public.monthly_payrolls payroll
    ON payroll.id = item.payroll_id;

  SELECT COUNT(*)
  INTO v_unsafe_count
  FROM treatment_accrual_reconcile_plan plan
  WHERE EXISTS (
    SELECT 1
    FROM public.journal_entries journal
    WHERE journal.source_type = 'COMPENSATION'
      AND journal.source_id IN (plan.loser_id::TEXT, plan.winner_id::TEXT)
  )
  OR EXISTS (
    SELECT 1
    FROM public.payroll_items item
    JOIN public.monthly_payrolls payroll
      ON payroll.id = item.payroll_id
    WHERE item.source_id IN (plan.loser_id::TEXT, plan.winner_id::TEXT)
      AND (
        payroll.status <> 'DRAFT'
        OR EXISTS (
          SELECT 1
          FROM public.journal_entries journal
          WHERE journal.source_type = 'PAYROLL'
            AND journal.source_id = payroll.id::TEXT
        )
        OR payroll.staff_id <> plan.staff_id
      )
  );

  IF v_unsafe_count > 0 THEN
    RAISE EXCEPTION
      'Ditemukan % duplikasi yang sudah terposting atau tidak cocok dengan payroll DRAFT. Tidak ada perubahan dilakukan; periksa manual.',
      v_unsafe_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM treatment_accrual_reconcile_plan plan
    JOIN public.payroll_items item
      ON item.source_id = plan.loser_id::TEXT
    JOIN public.monthly_payrolls payroll
      ON payroll.id = item.payroll_id
    JOIN public.compensation_accruals winner
      ON winner.id = plan.winner_id
    WHERE item.source_id IN (plan.loser_id::TEXT, plan.winner_id::TEXT)
      AND (
        payroll.month <> EXTRACT(MONTH FROM winner.accrued_at AT TIME ZONE 'Asia/Jakarta')
        OR payroll.year <> EXTRACT(YEAR FROM winner.accrued_at AT TIME ZONE 'Asia/Jakarta')
      )
  ) THEN
    RAISE EXCEPTION
      'Ditemukan item duplikat di payroll yang periodenya tidak cocok dengan tanggal akrual. Tidak ada perubahan dilakukan.';
  END IF;

  UPDATE public.compensation_accruals winner
  SET value_snapshot = plan.winner_value,
      amount = plan.winner_amount
  FROM (
    SELECT DISTINCT winner_id, winner_value, winner_amount
    FROM treatment_accrual_reconcile_plan
  ) plan
  WHERE winner.id = plan.winner_id;

  DELETE FROM public.payroll_items loser_item
  USING treatment_accrual_reconcile_plan plan
  WHERE loser_item.source_id = plan.loser_id::TEXT
    AND EXISTS (
      SELECT 1
      FROM public.payroll_items winner_item
      WHERE winner_item.payroll_id = loser_item.payroll_id
        AND winner_item.source_id = plan.winner_id::TEXT
    );

  UPDATE public.payroll_items loser_item
  SET source_id = plan.winner_id::TEXT,
      amount_snapshot = plan.winner_amount
  FROM treatment_accrual_reconcile_plan plan
  WHERE loser_item.source_id = plan.loser_id::TEXT;

  UPDATE public.payroll_items winner_item
  SET amount_snapshot = plan.winner_amount
  FROM (
    SELECT DISTINCT winner_id, winner_amount
    FROM treatment_accrual_reconcile_plan
  ) plan
  WHERE winner_item.source_id = plan.winner_id::TEXT;

  DELETE FROM public.compensation_accruals loser
  USING treatment_accrual_reconcile_plan plan
  WHERE loser.id = plan.loser_id;

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
        'Payroll % berubah status saat rekonsiliasi. Tidak dapat menyelesaikan migration.',
        v_payroll_id;
    END IF;
  END LOOP;

  RAISE NOTICE 'Akrual historis yang dideduplikasi: %. Payroll DRAFT dihitung ulang: %.',
    v_deleted_accrual_count,
    (SELECT COUNT(*) FROM treatment_accrual_affected_payrolls);
END;
$$;
