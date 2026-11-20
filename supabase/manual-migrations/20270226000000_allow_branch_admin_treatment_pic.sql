BEGIN;

CREATE OR REPLACE FUNCTION public.assign_treatment_visit_assistant(
  p_visit_id UUID,
  p_assistant_staff_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visit public.patient_visits%ROWTYPE;
  v_user public.user_accounts%ROWTYPE;
  v_assignment public.treatment_visit_assistant_assignments%ROWTYPE;
  v_has_started_treatment BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Hanya dokter yang dapat menetapkan PIC kunjungan.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_user
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid() AND active = true;

  IF NOT FOUND OR v_user.role <> 'DOCTOR' THEN
    RAISE EXCEPTION 'Hanya dokter yang dapat menetapkan PIC kunjungan.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_visit
  FROM public.patient_visits
  WHERE id = p_visit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kunjungan tidak ditemukan.';
  END IF;
  IF NOT public.user_can_manage_treatment_branch(v_visit.branch_id) THEN
    RAISE EXCEPTION 'Dokter tidak memiliki akses ke cabang kunjungan ini.'
      USING ERRCODE = '42501';
  END IF;

  IF p_assistant_staff_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.staff assistant
    WHERE assistant.id = p_assistant_staff_id
      AND assistant.position IN ('ASSISTANT', 'BRANCH_ADMIN')
      AND assistant.employment_status = 'ACTIVE'
      AND assistant.active = true
      AND (
        assistant.branch_id = v_visit.branch_id
        OR EXISTS (
          SELECT 1
          FROM public.staff_shift_assignments assignment
          WHERE assignment.staff_id = assistant.id
            AND assignment.branch_id = v_visit.branch_id
            AND assignment.date = (v_visit.visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE
            AND assignment.active = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'PIC yang dipilih harus Asisten atau Admin Cabang aktif yang ditugaskan di cabang kunjungan.';
  END IF;

  SELECT * INTO v_assignment
  FROM public.treatment_visit_assistant_assignments
  WHERE visit_id = p_visit_id
  FOR UPDATE;

  SELECT EXISTS (
    SELECT 1 FROM public.treatment_jobs job
    WHERE job.visit_id = p_visit_id
      AND (
        job.started_at IS NOT NULL
        OR job.status NOT IN ('BELUM_DIMULAI', 'DIBATALKAN')
      )
  ) INTO v_has_started_treatment;

  IF v_has_started_treatment AND EXISTS (
    SELECT 1 FROM public.treatment_jobs job
    WHERE job.visit_id = p_visit_id
      AND (
        job.started_at IS NOT NULL
        OR job.status NOT IN ('BELUM_DIMULAI', 'DIBATALKAN')
      )
      AND job.pic_assistant_id IS DISTINCT FROM p_assistant_staff_id
  ) THEN
    RAISE EXCEPTION 'PIC kunjungan sudah terkunci saat tindakan dimulai.';
  END IF;
  IF v_has_started_treatment
     AND v_assignment.visit_id IS NOT NULL
     AND v_assignment.assistant_staff_id IS DISTINCT FROM p_assistant_staff_id THEN
    RAISE EXCEPTION 'PIC kunjungan sudah terkunci saat tindakan dimulai.';
  END IF;

  INSERT INTO public.treatment_visit_assistant_assignments (
    visit_id, branch_id, assistant_staff_id, confirmed_by, confirmed_at, updated_at
  ) VALUES (
    p_visit_id, v_visit.branch_id, p_assistant_staff_id, v_user.id, now(), now()
  )
  ON CONFLICT (visit_id) DO UPDATE SET
    assistant_staff_id = EXCLUDED.assistant_staff_id,
    confirmed_by = EXCLUDED.confirmed_by,
    confirmed_at = EXCLUDED.confirmed_at,
    updated_at = EXCLUDED.updated_at;

  UPDATE public.treatment_jobs
  SET pic_assistant_id = p_assistant_staff_id,
      updated_at = now()
  WHERE visit_id = p_visit_id
    AND status <> 'DIBATALKAN';
END;
$$;

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
     AND assistant.position IN ('ASSISTANT', 'BRANCH_ADMIN')
     AND assistant.active
     AND assistant.employment_status = 'ACTIVE'
    JOIN public.patient_visits visit
      ON visit.id = job.visit_id
    JOIN public.assistant_treatment_incentive_rates rate
      ON rate.service_id = job.service_id
     AND rate.is_active
    WHERE job.visit_id = v_visit_id
      AND job.status IN ('SELESAI', 'DISERAHKAN')
      AND (
        assistant.position <> 'BRANCH_ADMIN'
        OR assistant.branch_id = job.branch_id
        OR EXISTS (
          SELECT 1
          FROM public.staff_shift_assignments assignment
          WHERE assignment.staff_id = assistant.id
            AND assignment.branch_id = job.branch_id
            AND assignment.date = (visit.visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE
            AND assignment.active = true
        )
      )
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

DROP POLICY IF EXISTS "Validated shared assistant treatment incentive insert"
  ON public.compensation_accruals;
CREATE POLICY "Validated shared assistant treatment incentive insert"
  ON public.compensation_accruals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    rule_id_snapshot = 'ASSISTANT_TREATMENT_BASE_V1'
    AND rule_type_snapshot = 'FIXED_PER_TREATMENT'
    AND value_snapshot = amount
    AND branch_id IS NOT NULL
    AND (
      public.is_super_admin()
      OR (
        (
          (public.get_user_role() = 'BRANCH_ADMIN' AND public.user_can_access_branch(branch_id))
          OR public.user_can_manage_treatment_branch(branch_id)
        )
        AND EXISTS (
          SELECT 1
          FROM public.treatment_jobs job
          JOIN public.staff assistant
            ON assistant.id = compensation_accruals.staff_id
           AND assistant.id = job.pic_assistant_id
          JOIN public.patient_visits visit
            ON visit.id = job.visit_id
          JOIN public.assistant_treatment_incentive_rates rate
            ON rate.service_id = job.service_id
           AND rate.is_active
          JOIN public.invoices invoice
            ON invoice.visit_id = job.visit_id
           AND invoice.status = 'PAID'
          JOIN public.invoice_items item
            ON item.invoice_id = invoice.id
           AND item.treatment_job_id = job.id
          WHERE job.id::TEXT = compensation_accruals.source_id
            AND job.branch_id = compensation_accruals.branch_id
            AND job.status IN ('SELESAI', 'DISERAHKAN')
            AND assistant.position IN ('ASSISTANT', 'BRANCH_ADMIN')
            AND assistant.active = true
            AND assistant.employment_status = 'ACTIVE'
            AND (
              assistant.position <> 'BRANCH_ADMIN'
              OR assistant.branch_id = job.branch_id
              OR EXISTS (
                SELECT 1
                FROM public.staff_shift_assignments assignment
                WHERE assignment.staff_id = assistant.id
                  AND assignment.branch_id = job.branch_id
                  AND assignment.date = (visit.visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE
                  AND assignment.active = true
              )
            )
            AND rate.amount = compensation_accruals.amount
            AND compensation_accruals.base_amount_snapshot =
              public.invoice_line_amount_after_discount(invoice.id, item.id)
            AND (
              SELECT COUNT(*)
              FROM public.invoices paid_invoice
              JOIN public.invoice_items linked_item ON linked_item.invoice_id = paid_invoice.id
              WHERE paid_invoice.visit_id = job.visit_id
                AND paid_invoice.status = 'PAID'
                AND linked_item.treatment_job_id = job.id
            ) = 1
            AND NOT EXISTS (
              SELECT 1
              FROM public.staff_compensation_rules individual_rule
              WHERE individual_rule.staff_id = assistant.id
                AND individual_rule.is_active
                AND individual_rule.rule_type_snapshot IN ('PERCENTAGE', 'FIXED_PER_TREATMENT')
                AND (individual_rule.service_id IS NULL OR individual_rule.service_id = job.service_id)
                AND (individual_rule.branch_id IS NULL OR individual_rule.branch_id = job.branch_id)
                AND (
                  individual_rule.effective_start_date IS NULL
                  OR individual_rule.effective_start_date <= COALESCE((job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE)
                )
                AND (
                  individual_rule.effective_end_date IS NULL
                  OR individual_rule.effective_end_date >= COALESCE((job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE)
                )
            )
        )
      )
    )
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
