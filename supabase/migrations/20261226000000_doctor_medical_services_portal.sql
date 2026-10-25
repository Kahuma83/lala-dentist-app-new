CREATE OR REPLACE FUNCTION public.get_own_doctor_medical_services(
  p_start_date DATE,
  p_end_date DATE,
  p_before_accrued_at TIMESTAMPTZ DEFAULT NULL,
  p_before_source_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
  v_total_amount NUMERIC;
  v_action_count BIGINT;
  v_rows JSONB;
  v_has_more BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role() IS DISTINCT FROM 'DOCTOR' THEN
    RAISE EXCEPTION 'Menu jasa medis hanya tersedia untuk akun dokter yang aktif.';
  END IF;

  v_staff_id := public.get_user_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Akun dokter belum terhubung ke data staf.';
  END IF;

  IF p_start_date IS NULL
    OR p_end_date IS NULL
    OR p_start_date > p_end_date
    OR p_end_date - p_start_date > 31 THEN
    RAISE EXCEPTION 'Rentang tanggal jasa medis tidak valid.';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'Jumlah data jasa medis per halaman harus antara 1 dan 50.';
  END IF;

  IF (p_before_accrued_at IS NULL) <> (p_before_source_id IS NULL) THEN
    RAISE EXCEPTION 'Kursor halaman jasa medis tidak valid.';
  END IF;

  WITH actions AS MATERIALIZED (
    SELECT
      job.id AS source_id,
      job.service_name_snapshot AS service_name,
      branch.name AS branch_name,
      MAX(accrual.accrued_at) AS accrued_at,
      SUM(accrual.amount)::BIGINT AS amount
    FROM public.compensation_accruals accrual
    JOIN public.treatment_jobs job
      ON job.id::TEXT = accrual.source_id
    JOIN public.dental_doctors doctor
      ON doctor.id = job.doctor_id
      AND doctor.staff_id = v_staff_id
    JOIN public.dental_branches branch
      ON branch.id = job.branch_id
    WHERE accrual.staff_id = v_staff_id
      AND accrual.rule_type_snapshot IN ('PERCENTAGE', 'FIXED_PER_TREATMENT')
      AND accrual.accrued_at >= p_start_date::TIMESTAMP AT TIME ZONE 'Asia/Jakarta'
      AND accrual.accrued_at < (p_end_date + 1)::TIMESTAMP AT TIME ZONE 'Asia/Jakarta'
      AND job.status IN ('SELESAI', 'DISERAHKAN')
    GROUP BY job.id, job.service_name_snapshot, branch.name
  ),
  page_rows AS (
    SELECT *
    FROM actions
    WHERE p_before_accrued_at IS NULL
      OR accrued_at < p_before_accrued_at
      OR (accrued_at = p_before_accrued_at AND source_id < p_before_source_id)
    ORDER BY accrued_at DESC, source_id DESC
    LIMIT p_limit + 1
  )
  SELECT
    COALESCE((SELECT SUM(amount) FROM actions), 0),
    (SELECT COUNT(*) FROM actions),
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'sourceId', page.source_id,
          'serviceName', page.service_name,
          'branchName', page.branch_name,
          'accruedAt', page.accrued_at,
          'amount', page.amount
        )
        ORDER BY page.accrued_at DESC, page.source_id DESC
      )
      FROM (
        SELECT *
        FROM page_rows
        ORDER BY accrued_at DESC, source_id DESC
        LIMIT p_limit
      ) page
    ), '[]'::JSONB),
    (SELECT COUNT(*) > p_limit FROM page_rows)
  INTO v_total_amount, v_action_count, v_rows, v_has_more;

  RETURN jsonb_build_object(
    'totalAmount', v_total_amount,
    'actionCount', v_action_count,
    'rows', v_rows,
    'hasMore', v_has_more
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_own_doctor_medical_services(DATE, DATE, TIMESTAMPTZ, UUID, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_doctor_medical_services(DATE, DATE, TIMESTAMPTZ, UUID, INTEGER)
  TO authenticated;
