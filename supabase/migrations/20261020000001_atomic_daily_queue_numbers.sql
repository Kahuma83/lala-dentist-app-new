WITH ranked_queue AS (
  SELECT
    queue.id,
    queue.branch_id,
    queue.doctor_id,
    (queue.arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE AS queue_day,
    ROW_NUMBER() OVER (
      PARTITION BY queue.branch_id, queue.doctor_id, (queue.arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE
      ORDER BY queue.arrival_at, queue.created_at, queue.id
    ) AS corrected_sequence,
    COALESCE(
      NULLIF(
        LEFT(
          UPPER(TRIM(REGEXP_REPLACE(doctor.name, '^[[:space:]]*drg\.?[[:space:]]*', '', 'i'))),
          1
        ),
        ''
      ),
      'A'
    ) AS doctor_prefix
  FROM public.queue_items AS queue
  LEFT JOIN public.dental_doctors AS doctor ON doctor.id = queue.doctor_id
)
UPDATE public.queue_items AS queue
SET
  sequence_order = ranked_queue.corrected_sequence,
  queue_number = ranked_queue.doctor_prefix || '-' || LPAD(ranked_queue.corrected_sequence::TEXT, 2, '0')
FROM ranked_queue
WHERE queue.id = ranked_queue.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_items_daily_sequence_unique
  ON public.queue_items (
    branch_id,
    doctor_id,
    ((arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE),
    sequence_order
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_items_daily_number_unique
  ON public.queue_items (
    branch_id,
    doctor_id,
    ((arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE),
    queue_number
  );

CREATE OR REPLACE FUNCTION public.check_in_visit_to_queue(
  p_queue_id UUID,
  p_branch_id UUID,
  p_doctor_id UUID,
  p_visit_id UUID,
  p_booking_id UUID,
  p_patient_id UUID,
  p_arrival_at TIMESTAMPTZ,
  p_preferred_service_at TIMESTAMPTZ,
  p_estimated_duration_minutes INTEGER,
  p_booking_time_snapshot TEXT,
  p_patient_name_snapshot TEXT,
  p_doctor_name_snapshot TEXT
)
RETURNS SETOF public.queue_items
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  queue_day DATE;
  next_sequence INTEGER;
  doctor_prefix TEXT;
  queue_result public.queue_items%ROWTYPE;
BEGIN
  queue_day := (p_arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_branch_id::TEXT || ':' || p_doctor_id::TEXT || ':' || queue_day::TEXT, 0)
  );

  SELECT queue.*
  INTO queue_result
  FROM public.queue_items AS queue
  WHERE queue.visit_id = p_visit_id
    AND queue.status NOT IN ('SKIPPED', 'COMPLETED', 'CANCELLED')
  ORDER BY queue.created_at
  LIMIT 1;

  IF FOUND THEN
    RETURN NEXT queue_result;
    RETURN;
  END IF;

  SELECT COALESCE(
    NULLIF(
      LEFT(
        UPPER(TRIM(REGEXP_REPLACE(COALESCE(doctor.name, p_doctor_name_snapshot, ''), '^[[:space:]]*drg\.?[[:space:]]*', '', 'i'))),
        1
      ),
      ''
    ),
    'A'
  )
  INTO doctor_prefix
  FROM (SELECT 1) AS seed
  LEFT JOIN public.dental_doctors AS doctor ON doctor.id = p_doctor_id;

  SELECT COALESCE(MAX(queue.sequence_order), 0) + 1
  INTO next_sequence
  FROM public.queue_items AS queue
  WHERE queue.branch_id = p_branch_id
    AND queue.doctor_id = p_doctor_id
    AND (queue.arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE = queue_day;

  INSERT INTO public.queue_items (
    id,
    branch_id,
    doctor_id,
    visit_id,
    booking_id,
    patient_id,
    queue_number,
    status,
    sequence_order,
    arrival_at,
    preferred_service_at,
    estimated_duration_minutes,
    booking_time_snapshot,
    patient_name_snapshot,
    doctor_name_snapshot
  )
  VALUES (
    COALESCE(p_queue_id, gen_random_uuid()),
    p_branch_id,
    p_doctor_id,
    p_visit_id,
    p_booking_id,
    p_patient_id,
    doctor_prefix || '-' || LPAD(next_sequence::TEXT, 2, '0'),
    'WAITING',
    next_sequence,
    p_arrival_at,
    p_preferred_service_at,
    p_estimated_duration_minutes,
    p_booking_time_snapshot,
    p_patient_name_snapshot,
    COALESCE(p_doctor_name_snapshot, (SELECT doctor.name FROM public.dental_doctors AS doctor WHERE doctor.id = p_doctor_id))
  )
  RETURNING * INTO queue_result;

  RETURN NEXT queue_result;
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_visit_to_queue(UUID, UUID, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_in_visit_to_queue(UUID, UUID, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT) TO authenticated, service_role;
