ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS en_route_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS late_checkin_requested_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.patient_confirm_booking_en_route(p_booking_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  booking_row public.bookings%ROWTYPE;
  confirmation_time TIMESTAMPTZ;
  estimated_service_time TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role() IS DISTINCT FROM 'PATIENT' THEN
    RAISE EXCEPTION 'Hanya akun pasien yang dapat mengirim konfirmasi perjalanan'
      USING ERRCODE = '42501';
  END IF;

  SELECT booking.*
  INTO booking_row
  FROM public.bookings AS booking
  WHERE booking.id = p_booking_id
    AND booking.patient_id::TEXT = public.get_user_patient_id()::TEXT
    AND COALESCE(booking.source, booking.channel) IN ('PATIENT_PORTAL', 'ANDROID')
    AND booking.status IN ('PENDING', 'CONFIRMED')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Janji temu aktif tidak ditemukan atau bukan milik akun ini'
      USING ERRCODE = 'P0002';
  END IF;

  IF now() < booking_row.booking_date_time - INTERVAL '60 minutes' THEN
    RAISE EXCEPTION 'Konfirmasi menuju klinik tersedia mulai 60 menit sebelum jadwal'
      USING ERRCODE = '22023';
  END IF;

  SELECT estimate.estimated_service_at
  INTO estimated_service_time
  FROM public.get_patient_booking_queue_estimate(p_booking_id) AS estimate;

  IF now() > GREATEST(
    booking_row.booking_date_time + INTERVAL '15 minutes',
    estimated_service_time + INTERVAL '15 minutes'
  ) THEN
    RAISE EXCEPTION 'Batas check-in sudah lewat; hubungi petugas untuk konfirmasi'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.bookings
  SET en_route_confirmed_at = COALESCE(en_route_confirmed_at, now()),
      updated_at = now()
  WHERE id = p_booking_id
  RETURNING en_route_confirmed_at INTO confirmation_time;

  RETURN confirmation_time;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_patient_booking_queue_estimate(p_booking_id UUID)
RETURNS TABLE (
  patients_ahead INTEGER,
  estimated_service_at TIMESTAMPTZ,
  refreshed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  booking_row public.bookings%ROWTYPE;
  active_queue_count INTEGER;
  active_queue_finish TIMESTAMPTZ;
  earlier_booking_count INTEGER;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role() IS DISTINCT FROM 'PATIENT' THEN
    RAISE EXCEPTION 'Hanya akun pasien yang dapat melihat estimasi antrean'
      USING ERRCODE = '42501';
  END IF;

  SELECT booking.*
  INTO booking_row
  FROM public.bookings AS booking
  WHERE booking.id = p_booking_id
    AND booking.patient_id::TEXT = public.get_user_patient_id()::TEXT
    AND COALESCE(booking.source, booking.channel) IN ('PATIENT_PORTAL', 'ANDROID')
    AND booking.status IN ('PENDING', 'CONFIRMED');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Janji temu aktif tidak ditemukan atau bukan milik akun ini'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    MAX(
      COALESCE(queue.estimated_service_at, queue.arrival_at)
      + make_interval(mins => GREATEST(queue.estimated_duration_minutes, 0))
    )
  INTO active_queue_count, active_queue_finish
  FROM public.queue_items AS queue
  WHERE queue.branch_id = booking_row.branch_id
    AND queue.doctor_id = booking_row.doctor_id
    AND queue.booking_id IS DISTINCT FROM booking_row.id
    AND (queue.arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE =
      (booking_row.booking_date_time AT TIME ZONE 'Asia/Jakarta')::DATE
    AND queue.arrival_at <= booking_row.booking_date_time
    AND queue.status IN ('WAITING', 'IN_PREPARATION', 'IN_CONSULTATION', 'CALLING');

  SELECT COUNT(*)::INTEGER
  INTO earlier_booking_count
  FROM public.bookings AS earlier
  WHERE earlier.id <> booking_row.id
    AND earlier.branch_id = booking_row.branch_id
    AND earlier.doctor_id = booking_row.doctor_id
    AND earlier.status IN ('PENDING', 'CONFIRMED')
    AND earlier.booking_date_time < booking_row.booking_date_time
    AND (earlier.booking_date_time AT TIME ZONE 'Asia/Jakarta')::DATE =
      (booking_row.booking_date_time AT TIME ZONE 'Asia/Jakarta')::DATE
    AND NOT EXISTS (
      SELECT 1
      FROM public.queue_items AS queue
      WHERE queue.booking_id = earlier.id
        AND queue.status IN ('WAITING', 'IN_PREPARATION', 'IN_CONSULTATION', 'CALLING')
    );

  RETURN QUERY
  SELECT
    active_queue_count + earlier_booking_count,
    GREATEST(
      booking_row.booking_date_time,
      COALESCE(active_queue_finish, now())
        + make_interval(mins => earlier_booking_count * 30)
    ),
    now();
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_request_late_checkin_confirmation(p_booking_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  booking_row public.bookings%ROWTYPE;
  estimated_service_time TIMESTAMPTZ;
  request_time TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role() IS DISTINCT FROM 'PATIENT' THEN
    RAISE EXCEPTION 'Hanya akun pasien yang dapat meminta konfirmasi petugas'
      USING ERRCODE = '42501';
  END IF;

  SELECT booking.*
  INTO booking_row
  FROM public.bookings AS booking
  WHERE booking.id = p_booking_id
    AND booking.patient_id::TEXT = public.get_user_patient_id()::TEXT
    AND COALESCE(booking.source, booking.channel) IN ('PATIENT_PORTAL', 'ANDROID')
    AND booking.status IN ('PENDING', 'CONFIRMED')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Janji temu aktif tidak ditemukan atau bukan milik akun ini'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT estimate.estimated_service_at
  INTO estimated_service_time
  FROM public.get_patient_booking_queue_estimate(p_booking_id) AS estimate;

  IF now() <= GREATEST(
    booking_row.booking_date_time + INTERVAL '15 minutes',
    estimated_service_time + INTERVAL '15 minutes'
  ) THEN
    RAISE EXCEPTION 'Batas check-in belum lewat; silakan check-in di klinik dalam jendela waktu yang tersedia'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.bookings
  SET late_checkin_requested_at = COALESCE(late_checkin_requested_at, now()),
      updated_at = now()
  WHERE id = p_booking_id
  RETURNING late_checkin_requested_at INTO request_time;

  RETURN request_time;
END;
$$;

REVOKE ALL ON FUNCTION public.patient_confirm_booking_en_route(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_patient_booking_queue_estimate(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.patient_request_late_checkin_confirmation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_confirm_booking_en_route(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_booking_queue_estimate(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_request_late_checkin_confirmation(UUID) TO authenticated;
