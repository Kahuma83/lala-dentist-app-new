CREATE OR REPLACE FUNCTION public.get_owner_dashboard_weekly_trend(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_owner() THEN
    RAISE EXCEPTION 'Akses ditolak: grafik hanya untuk akun Owner aktif.'
      USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL
    OR p_end_date IS NULL
    OR p_end_date < p_start_date
    OR p_end_date - p_start_date > 30 THEN
    RAISE EXCEPTION 'Rentang tanggal grafik Owner tidak valid.'
      USING ERRCODE = '22023';
  END IF;

  WITH date_range AS (
    SELECT generate_series(p_start_date, p_end_date, INTERVAL '1 day')::DATE AS activity_date
  ),
  completed_visits AS (
    SELECT
      (visit.visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE AS activity_date,
      count(*) AS total
    FROM public.patient_visits visit
    JOIN public.dental_branches branch
      ON branch.id = visit.branch_id
     AND branch.is_active
    WHERE visit.visit_status = 'COMPLETED'
      AND visit.visit_date_time >= (p_start_date::TIMESTAMP AT TIME ZONE 'Asia/Jakarta')
      AND visit.visit_date_time < ((p_end_date + 1)::TIMESTAMP AT TIME ZONE 'Asia/Jakarta')
    GROUP BY (visit.visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE
  ),
  successful_payments AS (
    SELECT
      (payment.transaction_date_time AT TIME ZONE 'Asia/Jakarta')::DATE AS activity_date,
      coalesce(sum(payment.amount), 0) AS total
    FROM public.payment_transactions payment
    JOIN public.dental_branches branch
      ON branch.id = payment.branch_id
     AND branch.is_active
    WHERE payment.status = 'SUCCESS'
      AND payment.transaction_date_time >= (p_start_date::TIMESTAMP AT TIME ZONE 'Asia/Jakarta')
      AND payment.transaction_date_time < ((p_end_date + 1)::TIMESTAMP AT TIME ZONE 'Asia/Jakarta')
    GROUP BY (payment.transaction_date_time AT TIME ZONE 'Asia/Jakarta')::DATE
  )
  SELECT jsonb_build_object(
    'startDate', p_start_date,
    'endDate', p_end_date,
    'days', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', dates.activity_date,
          'completedVisits', coalesce(visits.total, 0),
          'collected', coalesce(payments.total, 0)
        )
        ORDER BY dates.activity_date
      ),
      '[]'::JSONB
    )
  )
  INTO v_result
  FROM date_range dates
  LEFT JOIN completed_visits visits ON visits.activity_date = dates.activity_date
  LEFT JOIN successful_payments payments ON payments.activity_date = dates.activity_date;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_owner_dashboard_weekly_trend(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_dashboard_weekly_trend(DATE, DATE) TO authenticated;
