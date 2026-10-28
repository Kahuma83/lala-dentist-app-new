CREATE OR REPLACE FUNCTION public.booking_planned_duration_minutes(p_planned_treatments JSONB)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT COALESCE(
    LEAST(NULLIF(SUM(
      CASE
        WHEN treatment.value ->> 'estimatedDurationMinutes' ~ '^[0-9]{1,6}$'
          THEN (treatment.value ->> 'estimatedDurationMinutes')::INTEGER
        ELSE 0
      END
    ), 0), 1440),
    30
  )::INTEGER
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(p_planned_treatments) = 'array' THEN p_planned_treatments
      ELSE '[]'::JSONB
    END
  ) AS treatment(value);
$$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_doctor_booking_slot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  doctor_lock_key BIGINT;
  new_duration_minutes INTEGER;
  new_end_at TIMESTAMPTZ;
  has_conflict BOOLEAN;
BEGIN
  IF NEW.status NOT IN ('PENDING', 'CONFIRMED') OR NEW.doctor_id IS NULL THEN
    RETURN NEW;
  END IF;

  new_duration_minutes := public.booking_planned_duration_minutes(NEW.planned_treatments);

  new_end_at := NEW.booking_date_time + make_interval(mins => new_duration_minutes);

  doctor_lock_key := hashtextextended(
    NEW.branch_id::TEXT || ':' || NEW.doctor_id::TEXT,
    0
  );
  PERFORM pg_advisory_xact_lock(doctor_lock_key);

  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.branch_id = NEW.branch_id
      AND b.doctor_id = NEW.doctor_id
      AND b.status IN ('PENDING', 'CONFIRMED')
      AND b.id IS DISTINCT FROM NEW.id
      AND NEW.booking_date_time < b.booking_date_time + make_interval(mins => public.booking_planned_duration_minutes(b.planned_treatments))
      AND b.booking_date_time < new_end_at
  )
  INTO has_conflict;

  IF has_conflict THEN
    RAISE EXCEPTION 'Dokter sudah memiliki booking aktif yang bertabrakan dengan durasi tindakan ini di cabang tersebut'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_prevent_duplicate_doctor_slot ON public.bookings;
CREATE TRIGGER bookings_prevent_duplicate_doctor_slot
  BEFORE INSERT OR UPDATE OF branch_id, doctor_id, booking_date_time, status, planned_treatments
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_doctor_booking_slot();

CREATE OR REPLACE FUNCTION public.get_patient_available_booking_slots(
  p_branch_id UUID,
  p_doctor_id UUID,
  p_operational_date DATE
)
RETURNS TABLE(slot_time TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  doctor_schedule RECORD;
  first_slot_minute INTEGER;
  schedule_end_minute INTEGER;
  slot_minute INTEGER;
  slot_start_at TIMESTAMPTZ;
  slot_end_at TIMESTAMPTZ;
  returned_slots TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role() IS DISTINCT FROM 'PATIENT' THEN
    RAISE EXCEPTION 'Hanya akun pasien yang dapat memeriksa ketersediaan booking'
      USING ERRCODE = '42501';
  END IF;

  IF p_branch_id IS NULL OR p_doctor_id IS NULL OR p_operational_date IS NULL
    OR p_operational_date < (now() AT TIME ZONE 'Asia/Jakarta')::DATE
    OR NOT public.is_valid_doctor_schedule(p_doctor_id, p_branch_id) THEN
    RETURN;
  END IF;

  FOR doctor_schedule IN
    SELECT schedule.start_time::TIME AS start_time,
           schedule.end_time::TIME AS end_time
    FROM public.doctor_schedules schedule
    WHERE schedule.branch_id = p_branch_id
      AND schedule.doctor_id = p_doctor_id
      AND schedule.date = p_operational_date
      AND schedule.status = 'ACTIVE'
    ORDER BY schedule.start_time
  LOOP
    first_slot_minute := CEIL(EXTRACT(EPOCH FROM doctor_schedule.start_time) / 60 / 30)::INTEGER * 30;
    schedule_end_minute := FLOOR(EXTRACT(EPOCH FROM doctor_schedule.end_time) / 60)::INTEGER;

    FOR slot_minute IN
      SELECT generate_series(first_slot_minute, schedule_end_minute - 30, 30)
    LOOP
      slot_start_at := (p_operational_date::TIMESTAMP + make_interval(mins => slot_minute)) AT TIME ZONE 'Asia/Jakarta';
      slot_end_at := slot_start_at + INTERVAL '30 minutes';

      IF slot_start_at <= now() THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.bookings booking
        WHERE booking.branch_id = p_branch_id
          AND booking.doctor_id = p_doctor_id
          AND booking.status IN ('PENDING', 'CONFIRMED')
          AND booking.booking_date_time < slot_end_at
          AND booking.booking_date_time + make_interval(
            mins => public.booking_planned_duration_minutes(booking.planned_treatments)
          ) > slot_start_at
      ) THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.queue_items queue
        WHERE queue.branch_id = p_branch_id
          AND queue.doctor_id = p_doctor_id
          AND (queue.arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE = p_operational_date
          AND queue.status IN ('WAITING', 'IN_PREPARATION', 'IN_CONSULTATION', 'CALLING')
          AND CASE
            WHEN queue.status = 'WAITING'
              THEN GREATEST(COALESCE(queue.estimated_service_at, queue.arrival_at), now())
            ELSE COALESCE(
              queue.actual_service_start_at,
              queue.estimated_service_at,
              GREATEST(queue.arrival_at, now())
            )
          END < slot_end_at
          AND slot_start_at < CASE
            WHEN queue.status = 'WAITING'
              THEN GREATEST(COALESCE(queue.estimated_service_at, queue.arrival_at), now())
            ELSE COALESCE(
              queue.actual_service_start_at,
              queue.estimated_service_at,
              GREATEST(queue.arrival_at, now())
            )
          END + make_interval(mins => GREATEST(queue.estimated_duration_minutes, 1))
      ) THEN
        CONTINUE;
      END IF;

      slot_time := TO_CHAR(p_operational_date::TIMESTAMP + make_interval(mins => slot_minute), 'HH24:MI');
      IF NOT slot_time = ANY(returned_slots) THEN
        returned_slots := array_append(returned_slots, slot_time);
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_patient_available_booking_slots(UUID, UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_available_booking_slots(UUID, UUID, DATE) TO authenticated;