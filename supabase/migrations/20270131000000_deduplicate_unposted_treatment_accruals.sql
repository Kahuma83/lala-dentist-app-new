DO $$
DECLARE
  v_linked_loser_count INTEGER;
  v_deleted_count INTEGER;
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
      accrual.rule_id_snapshot,
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
      COUNT(*) OVER (
        PARTITION BY source_id, staff_id, rule_type_snapshot
      ) AS matching_rule_count,
      ROW_NUMBER() OVER (
        PARTITION BY source_id, staff_id, rule_type_snapshot
        ORDER BY specificity DESC, created_at DESC, rule_id_snapshot DESC, id DESC
      ) AS rule_rank
    FROM eligible_accruals eligible
  )
  SELECT id, source_id, staff_id, rule_type_snapshot, rule_rank, matching_rule_count
  FROM ranked_accruals
  WHERE matching_rule_count > 1;

  SELECT COUNT(*)
  INTO v_linked_loser_count
  FROM treatment_accrual_dedup_plan plan
  WHERE plan.rule_rank > 1
    AND (
      EXISTS (
        SELECT 1
        FROM public.payroll_items item
        WHERE item.source_id = plan.id::TEXT
      )
      OR EXISTS (
        SELECT 1
        FROM public.journal_entries journal
        WHERE journal.source_type = 'COMPENSATION'
          AND journal.source_id = plan.id::TEXT
      )
    );

  IF v_linked_loser_count > 0 THEN
    RAISE EXCEPTION
      'Ditemukan % akrual duplikat yang sudah terkait payroll/jurnal. Migration dibatalkan tanpa menghapus akrual; periksa manual.',
      v_linked_loser_count;
  END IF;

  DELETE FROM public.compensation_accruals accrual
  USING treatment_accrual_dedup_plan plan
  WHERE accrual.id = plan.id
    AND plan.rule_rank > 1;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Akrual tindakan duplikat yang belum terposting dihapus: %', v_deleted_count;
END;
$$;
