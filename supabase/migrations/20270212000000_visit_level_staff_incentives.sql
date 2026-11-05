BEGIN;

CREATE TABLE IF NOT EXISTS public.compensation_incentive_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE RESTRICT,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  incentive_type VARCHAR(30) NOT NULL
    CHECK (incentive_type IN ('REFERRAL', 'ASSISTANT_TREATMENT')),
  previous_amount BIGINT NOT NULL,
  expected_amount BIGINT NOT NULL CHECK (expected_amount >= 0),
  delta_amount BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'REVIEW'
    CHECK (status IN ('REVIEW', 'RESOLVED')),
  notes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  CONSTRAINT uq_compensation_incentive_adjustment
    UNIQUE (visit_id, staff_id, incentive_type),
  CONSTRAINT chk_compensation_incentive_adjustment_delta
    CHECK (delta_amount = expected_amount - previous_amount)
);

ALTER TABLE public.compensation_incentive_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.compensation_incentive_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.compensation_incentive_adjustments TO authenticated;

DROP POLICY IF EXISTS "Super admins read incentive adjustments"
  ON public.compensation_incentive_adjustments;
CREATE POLICY "Super admins read incentive adjustments"
  ON public.compensation_incentive_adjustments
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.accrue_visit_staff_incentives(p_treatment_job_id UUID)
RETURNS SETOF public.compensation_accruals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visit_id UUID;
  v_branch_id UUID;
  v_referrer_id UUID;
  v_referrer_position TEXT;
  v_referral_job_id UUID;
  v_referral_amount BIGINT;
  v_assistant_id UUID;
  v_assistant_job_id UUID;
  v_assistant_amount BIGINT;
  v_accrued_at TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi pengguna diperlukan untuk mencatat insentif kunjungan.'
      USING ERRCODE = '42501';
  END IF;

  SELECT job.visit_id, job.branch_id
  INTO v_visit_id, v_branch_id
  FROM public.treatment_jobs job
  WHERE job.id = p_treatment_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tindakan tidak ditemukan.';
  END IF;

  IF NOT (
    public.is_super_admin()
    OR (public.get_user_role() = 'BRANCH_ADMIN' AND public.user_can_access_branch(v_branch_id))
    OR public.user_can_manage_treatment_branch(v_branch_id)
  ) THEN
    RAISE EXCEPTION 'Anda tidak memiliki akses ke kunjungan ini.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.patient_visits visit
  WHERE visit.id = v_visit_id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.invoices invoice
    WHERE invoice.visit_id = v_visit_id
      AND invoice.status <> 'CANCELLED'
  ) OR EXISTS (
    SELECT 1 FROM public.invoices invoice
    WHERE invoice.visit_id = v_visit_id
      AND invoice.status <> 'CANCELLED'
      AND invoice.status <> 'PAID'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.treatment_jobs job
    WHERE job.visit_id = v_visit_id
      AND job.status <> 'DIBATALKAN'
      AND (
        job.status NOT IN ('SELESAI', 'DISERAHKAN')
        OR (
          SELECT COUNT(*)
          FROM public.invoices invoice
          JOIN public.invoice_items item ON item.invoice_id = invoice.id
          WHERE invoice.visit_id = v_visit_id
            AND invoice.status <> 'CANCELLED'
            AND item.treatment_job_id = job.id
        ) <> 1
      )
  ) THEN
    RETURN;
  END IF;

  SELECT booking.referring_staff_id, staff.position
  INTO v_referrer_id, v_referrer_position
  FROM public.patient_visits visit
  JOIN public.bookings booking ON booking.id = visit.booking_id
  JOIN public.staff staff ON staff.id = booking.referring_staff_id
  WHERE visit.id = v_visit_id
    AND staff.position IN ('BRANCH_ADMIN', 'ASSISTANT')
    AND staff.active
    AND staff.employment_status = 'ACTIVE';

  SELECT candidate.job_id, candidate.amount
  INTO v_referral_job_id, v_referral_amount
  FROM (
    SELECT
      job.id AS job_id,
      rate.amount,
      ROW_NUMBER() OVER (ORDER BY rate.amount DESC, job.id) AS rate_rank
    FROM public.treatment_jobs job
    JOIN LATERAL (
      SELECT configured_rate.amount
      FROM public.staff_referral_incentive_rates configured_rate
      WHERE configured_rate.staff_position = v_referrer_position
        AND configured_rate.is_active
        AND (
          configured_rate.service_name IS NULL
          OR lower(regexp_replace(trim(configured_rate.service_name), '[^a-zA-Z0-9]', '', 'g'))
            = lower(regexp_replace(trim(job.service_name_snapshot), '[^a-zA-Z0-9]', '', 'g'))
        )
      ORDER BY (configured_rate.service_name IS NOT NULL) DESC
      LIMIT 1
    ) rate ON true
    WHERE job.visit_id = v_visit_id
      AND job.status IN ('SELESAI', 'DISERAHKAN')
  ) candidate
  WHERE candidate.rate_rank = 1;

  v_accrued_at := timezone('utc'::TEXT, now());

  IF v_referrer_id IS NOT NULL
    AND v_referral_job_id IS NOT NULL
    AND v_referral_amount > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.compensation_accruals accrual
      WHERE accrual.rule_id_snapshot = 'STAFF_VISIT_REFERRAL_RP3000_V1'
        AND (
          accrual.source_id = 'referral:visit:' || v_visit_id::TEXT
          OR accrual.source_id LIKE 'referral:visit:' || v_visit_id::TEXT || ':treatment:%'
        )
    )
  THEN
    RETURN QUERY
    INSERT INTO public.compensation_accruals (
      staff_id, branch_id, rule_id_snapshot, rule_type_snapshot,
      value_snapshot, base_amount_snapshot, amount, source_id, accrued_at
    )
    VALUES (
      v_referrer_id, v_branch_id, 'STAFF_VISIT_REFERRAL_RP3000_V1',
      'STAFF_VISIT_REFERRAL', v_referral_amount, 0, v_referral_amount,
      'referral:visit:' || v_visit_id::TEXT || ':treatment:' || v_referral_job_id::TEXT,
      v_accrued_at
    )
    ON CONFLICT DO NOTHING
    RETURNING *;
  END IF;

  SELECT candidate.staff_id, candidate.job_id, candidate.amount
  INTO v_assistant_id, v_assistant_job_id, v_assistant_amount
  FROM (
    SELECT
      assistant.id AS staff_id,
      job.id AS job_id,
      rate.amount,
      ROW_NUMBER() OVER (ORDER BY rate.amount DESC, job.id, assistant.id) AS rate_rank
    FROM public.treatment_jobs job
    JOIN public.staff assistant
      ON assistant.id = job.pic_assistant_id
     AND assistant.position = 'ASSISTANT'
     AND assistant.active
     AND assistant.employment_status = 'ACTIVE'
    JOIN public.assistant_treatment_incentive_rates rate
      ON rate.service_id = job.service_id
     AND rate.is_active
    WHERE job.visit_id = v_visit_id
      AND job.status IN ('SELESAI', 'DISERAHKAN')
      AND NOT EXISTS (
        SELECT 1
        FROM public.staff_compensation_rules individual_rule
        WHERE individual_rule.staff_id = assistant.id
          AND individual_rule.is_active
          AND individual_rule.rule_type_snapshot IN ('PERCENTAGE', 'FIXED_PER_TREATMENT')
          AND individual_rule.value_snapshot > 0
          AND (individual_rule.service_id IS NULL OR individual_rule.service_id = job.service_id)
          AND (individual_rule.branch_id IS NULL OR individual_rule.branch_id = job.branch_id)
          AND (
            individual_rule.effective_start_date IS NULL
            OR individual_rule.effective_start_date <= COALESCE(
              (job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE
            )
          )
          AND (
            individual_rule.effective_end_date IS NULL
            OR individual_rule.effective_end_date >= COALESCE(
              (job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE
            )
          )
      )
  ) candidate
  WHERE candidate.rate_rank = 1;

  IF v_assistant_id IS NOT NULL
    AND v_assistant_job_id IS NOT NULL
    AND v_assistant_amount > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.compensation_accruals accrual
      JOIN public.treatment_jobs job ON job.id::TEXT = accrual.source_id
      WHERE job.visit_id = v_visit_id
        AND accrual.staff_id = v_assistant_id
        AND accrual.rule_id_snapshot = 'ASSISTANT_TREATMENT_BASE_V1'
    )
  THEN
    RETURN QUERY
    INSERT INTO public.compensation_accruals (
      staff_id, branch_id, rule_id_snapshot, rule_type_snapshot,
      value_snapshot, base_amount_snapshot, amount, source_id, accrued_at
    )
    VALUES (
      v_assistant_id, v_branch_id, 'ASSISTANT_TREATMENT_BASE_V1',
      'FIXED_PER_TREATMENT', v_assistant_amount, 0, v_assistant_amount,
      v_assistant_job_id::TEXT, v_accrued_at
    )
    ON CONFLICT DO NOTHING
    RETURNING *;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.accrue_visit_staff_incentives(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accrue_visit_staff_incentives(UUID) TO authenticated;

DO $$
DECLARE
  v_deleted_count INTEGER;
  v_inserted_count INTEGER;
BEGIN
  CREATE TEMP TABLE visit_incentive_expected
  ON COMMIT DROP
  AS
  WITH ready_visits AS (
    SELECT visit.id AS visit_id, job.branch_id, visit.booking_id,
      max(invoice.updated_at) AS accrued_at
    FROM public.patient_visits visit
    JOIN public.treatment_jobs job ON job.visit_id = visit.id
      AND job.status <> 'DIBATALKAN'
    JOIN public.invoices invoice ON invoice.visit_id = visit.id
      AND invoice.status <> 'CANCELLED'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.invoices unpaid
      WHERE unpaid.visit_id = visit.id
        AND unpaid.status <> 'CANCELLED'
        AND unpaid.status <> 'PAID'
    )
      AND NOT EXISTS (
        SELECT 1 FROM public.treatment_jobs unfinished
        WHERE unfinished.visit_id = visit.id
          AND unfinished.status <> 'DIBATALKAN'
          AND (
            unfinished.status NOT IN ('SELESAI', 'DISERAHKAN')
            OR (
              SELECT COUNT(*)
              FROM public.invoices linked_invoice
              JOIN public.invoice_items item ON item.invoice_id = linked_invoice.id
              WHERE linked_invoice.visit_id = visit.id
                AND linked_invoice.status <> 'CANCELLED'
                AND item.treatment_job_id = unfinished.id
            ) <> 1
          )
      )
    GROUP BY visit.id, job.branch_id, visit.booking_id
  ),
  referral_candidates AS (
    SELECT
      ready.visit_id,
      ready.branch_id,
      referral_staff.id AS staff_id,
      'REFERRAL'::VARCHAR(30) AS incentive_type,
      'STAFF_VISIT_REFERRAL_RP3000_V1'::VARCHAR(100) AS rule_id_snapshot,
      'STAFF_VISIT_REFERRAL'::VARCHAR(50) AS rule_type_snapshot,
      ROUND(rate.amount)::BIGINT AS amount,
      job.id AS job_id,
      ready.accrued_at,
      ROW_NUMBER() OVER (
        PARTITION BY ready.visit_id
        ORDER BY rate.amount DESC, job.id
      ) AS rate_rank
    FROM ready_visits ready
    JOIN public.bookings booking ON booking.id = ready.booking_id
    JOIN public.staff referral_staff ON referral_staff.id = booking.referring_staff_id
      AND referral_staff.position IN ('BRANCH_ADMIN', 'ASSISTANT')
    JOIN public.treatment_jobs job ON job.visit_id = ready.visit_id
      AND job.status IN ('SELESAI', 'DISERAHKAN')
    JOIN LATERAL (
      SELECT configured_rate.amount
      FROM public.staff_referral_incentive_rates configured_rate
      WHERE configured_rate.staff_position = referral_staff.position
        AND configured_rate.is_active
        AND (
          configured_rate.service_name IS NULL
          OR lower(regexp_replace(trim(configured_rate.service_name), '[^a-zA-Z0-9]', '', 'g'))
            = lower(regexp_replace(trim(job.service_name_snapshot), '[^a-zA-Z0-9]', '', 'g'))
        )
      ORDER BY (configured_rate.service_name IS NOT NULL) DESC
      LIMIT 1
    ) rate ON true
  ),
  assistant_candidates AS (
    SELECT
      ready.visit_id,
      ready.branch_id,
      assistant.id AS staff_id,
      'ASSISTANT_TREATMENT'::VARCHAR(30) AS incentive_type,
      'ASSISTANT_TREATMENT_BASE_V1'::VARCHAR(100) AS rule_id_snapshot,
      'FIXED_PER_TREATMENT'::VARCHAR(50) AS rule_type_snapshot,
      rate.amount::BIGINT AS amount,
      job.id AS job_id,
      ready.accrued_at,
      ROW_NUMBER() OVER (
        PARTITION BY ready.visit_id
        ORDER BY rate.amount DESC, job.id, assistant.id
      ) AS rate_rank
    FROM ready_visits ready
    JOIN public.treatment_jobs job ON job.visit_id = ready.visit_id
      AND job.status IN ('SELESAI', 'DISERAHKAN')
    JOIN public.staff assistant ON assistant.id = job.pic_assistant_id
      AND assistant.position = 'ASSISTANT'
    JOIN public.assistant_treatment_incentive_rates rate
      ON rate.service_id = job.service_id AND rate.is_active
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.staff_compensation_rules individual_rule
      WHERE individual_rule.staff_id = assistant.id
        AND individual_rule.is_active
        AND individual_rule.rule_type_snapshot IN ('PERCENTAGE', 'FIXED_PER_TREATMENT')
        AND individual_rule.value_snapshot > 0
        AND (individual_rule.service_id IS NULL OR individual_rule.service_id = job.service_id)
        AND (individual_rule.branch_id IS NULL OR individual_rule.branch_id = job.branch_id)
        AND (
          individual_rule.effective_start_date IS NULL
          OR individual_rule.effective_start_date <= COALESCE(
            (job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE
          )
        )
        AND (
          individual_rule.effective_end_date IS NULL
          OR individual_rule.effective_end_date >= COALESCE(
            (job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE
          )
        )
    )
  )
  SELECT
    candidate.visit_id,
    candidate.branch_id,
    candidate.staff_id,
    candidate.incentive_type,
    candidate.rule_id_snapshot,
    candidate.rule_type_snapshot,
    candidate.amount,
    candidate.job_id,
    candidate.accrued_at
  FROM (
    SELECT * FROM referral_candidates WHERE rate_rank = 1
    UNION ALL
    SELECT * FROM assistant_candidates WHERE rate_rank = 1
  ) candidate
  WHERE candidate.amount > 0;

  CREATE TEMP TABLE visit_incentive_existing
  ON COMMIT DROP
  AS
  SELECT
    accrual.id,
    COALESCE(job.visit_id, referral_visit.id) AS visit_id,
    accrual.staff_id,
    accrual.branch_id,
    CASE
      WHEN accrual.rule_id_snapshot = 'STAFF_VISIT_REFERRAL_RP3000_V1' THEN 'REFERRAL'
      ELSE 'ASSISTANT_TREATMENT'
    END::VARCHAR(30) AS incentive_type,
    accrual.amount,
    accrual.accrued_at,
    EXISTS (
      SELECT 1
      FROM public.payroll_items item
      WHERE item.source_id = accrual.id::TEXT
    )
    OR EXISTS (
      SELECT 1
      FROM public.journal_entries journal
      WHERE journal.source_type = 'COMPENSATION'
        AND journal.source_id = accrual.id::TEXT
    )
    OR EXISTS (
      SELECT 1
      FROM public.payroll_items item
      JOIN public.monthly_payrolls payroll ON payroll.id = item.payroll_id
      JOIN public.journal_entries journal
        ON journal.source_type = 'PAYROLL'
       AND journal.source_id = payroll.id::TEXT
      WHERE item.source_id = accrual.id::TEXT
    ) AS protected
  FROM public.compensation_accruals accrual
  LEFT JOIN public.treatment_jobs job
    ON accrual.rule_id_snapshot = 'ASSISTANT_TREATMENT_BASE_V1'
   AND job.id::TEXT = accrual.source_id
  LEFT JOIN public.patient_visits referral_visit
    ON accrual.rule_id_snapshot = 'STAFF_VISIT_REFERRAL_RP3000_V1'
   AND (
     accrual.source_id = 'referral:visit:' || referral_visit.id::TEXT
     OR accrual.source_id LIKE 'referral:visit:' || referral_visit.id::TEXT || ':treatment:%'
   )
  WHERE (
    accrual.rule_id_snapshot = 'ASSISTANT_TREATMENT_BASE_V1'
    OR accrual.rule_id_snapshot = 'STAFF_VISIT_REFERRAL_RP3000_V1'
  )
    AND COALESCE(job.visit_id, referral_visit.id) IS NOT NULL;

  DELETE FROM public.compensation_accruals accrual
  USING visit_incentive_existing existing
  WHERE accrual.id = existing.id
    AND NOT existing.protected;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  INSERT INTO public.compensation_accruals (
    staff_id, branch_id, rule_id_snapshot, rule_type_snapshot,
    value_snapshot, base_amount_snapshot, amount, source_id, accrued_at
  )
  SELECT
    expected.staff_id,
    expected.branch_id,
    expected.rule_id_snapshot,
    expected.rule_type_snapshot,
    expected.amount,
    0,
    expected.amount,
    CASE
      WHEN expected.incentive_type = 'REFERRAL'
        THEN 'referral:visit:' || expected.visit_id::TEXT || ':treatment:' || expected.job_id::TEXT
      ELSE expected.job_id::TEXT
    END,
    expected.accrued_at
  FROM visit_incentive_expected expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM visit_incentive_existing existing
    WHERE existing.visit_id = expected.visit_id
      AND existing.incentive_type = expected.incentive_type
      AND existing.protected
  )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  INSERT INTO public.compensation_incentive_adjustments (
    visit_id, staff_id, branch_id, incentive_type,
    previous_amount, expected_amount, delta_amount, notes
  )
  SELECT
    balance.visit_id,
    balance.staff_id,
    balance.branch_id,
    balance.incentive_type,
    balance.previous_amount,
    balance.expected_amount,
    balance.expected_amount - balance.previous_amount,
    'Tarif historis dihitung ulang memakai tarif Super Admin yang aktif saat migration. Payroll atau jurnal terkait dipertahankan dan selisih perlu ditinjau; kelebihan bayar tidak dipotong otomatis.'
  FROM (
    SELECT
      existing.visit_id,
      existing.staff_id,
      existing.branch_id,
      existing.incentive_type,
      SUM(existing.amount)::BIGINT AS previous_amount,
      COALESCE(MAX(expected.amount), 0)::BIGINT AS expected_amount
    FROM visit_incentive_existing existing
    LEFT JOIN visit_incentive_expected expected
      ON expected.visit_id = existing.visit_id
     AND expected.staff_id = existing.staff_id
     AND expected.incentive_type = existing.incentive_type
    WHERE existing.protected
    GROUP BY existing.visit_id, existing.staff_id, existing.branch_id, existing.incentive_type

    UNION ALL

    SELECT
      expected.visit_id,
      expected.staff_id,
      expected.branch_id,
      expected.incentive_type,
      0::BIGINT AS previous_amount,
      expected.amount::BIGINT AS expected_amount
    FROM visit_incentive_expected expected
    WHERE EXISTS (
      SELECT 1
      FROM visit_incentive_existing existing
      WHERE existing.visit_id = expected.visit_id
        AND existing.incentive_type = expected.incentive_type
        AND existing.protected
    )
      AND NOT EXISTS (
        SELECT 1
        FROM visit_incentive_existing existing
        WHERE existing.visit_id = expected.visit_id
          AND existing.staff_id = expected.staff_id
          AND existing.incentive_type = expected.incentive_type
          AND existing.protected
      )
  ) balance
  WHERE balance.previous_amount <> balance.expected_amount
  ON CONFLICT (visit_id, staff_id, incentive_type)
  DO UPDATE SET
    previous_amount = EXCLUDED.previous_amount,
    expected_amount = EXCLUDED.expected_amount,
    delta_amount = EXCLUDED.delta_amount,
    status = 'REVIEW',
    notes = EXCLUDED.notes;

  RAISE NOTICE 'Insentif per kunjungan: % akrual lama tanpa payroll/jurnal diringkas, % akrual dibuat, % selisih historis menunggu tinjauan.',
    v_deleted_count,
    v_inserted_count,
    (SELECT COUNT(*) FROM public.compensation_incentive_adjustments WHERE status = 'REVIEW');
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
