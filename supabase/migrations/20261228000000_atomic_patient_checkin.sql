DROP FUNCTION IF EXISTS public.check_in_visit_to_queue(
  UUID, UUID, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT
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
  p_doctor_name_snapshot TEXT,
  p_complaint TEXT DEFAULT NULL
)
RETURNS SETOF public.queue_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_booking public.bookings%ROWTYPE;
  v_visit public.patient_visits%ROWTYPE;
  v_queue public.queue_items%ROWTYPE;
  v_patient_name TEXT;
  v_doctor_name TEXT;
  v_branch_name TEXT;
  v_branch_id UUID;
  v_doctor_id UUID;
  v_patient_id UUID;
  v_visit_id UUID;
  v_arrival_at TIMESTAMPTZ := now();
  v_queue_day DATE;
  v_next_sequence INTEGER;
  v_doctor_prefix TEXT;
  v_active_visit_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: sesi pengguna tidak ditemukan';
  END IF;

  v_role := public.get_user_role();
  IF v_role IS NULL OR v_role NOT IN ('SUPER_ADMIN', 'BRANCH_ADMIN') THEN
    RAISE EXCEPTION 'Akses ditolak: check-in hanya dapat dilakukan Admin Cabang atau Super Admin';
  END IF;

  IF p_estimated_duration_minutes IS NOT NULL
    AND p_estimated_duration_minutes NOT BETWEEN 1 AND 1440 THEN
    RAISE EXCEPTION 'Estimasi durasi check-in harus antara 1 dan 1440 menit';
  END IF;

  IF p_booking_id IS NOT NULL THEN
    SELECT *
    INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Booking yang dipilih tidak ditemukan';
    END IF;
    IF v_booking.status NOT IN ('PENDING', 'CONFIRMED') THEN
      RAISE EXCEPTION 'Booking sudah tidak aktif dan tidak dapat di-check-in';
    END IF;
    IF p_branch_id IS NOT NULL AND p_branch_id <> v_booking.branch_id THEN
      RAISE EXCEPTION 'Cabang yang dipilih tidak sesuai dengan cabang booking';
    END IF;
    IF p_doctor_id IS NOT NULL AND p_doctor_id <> v_booking.doctor_id THEN
      RAISE EXCEPTION 'Dokter yang dipilih tidak sesuai dengan dokter booking';
    END IF;
    IF p_patient_id IS NOT NULL AND p_patient_id <> v_booking.patient_id THEN
      RAISE EXCEPTION 'Pasien yang dipilih tidak sesuai dengan pasien booking';
    END IF;

    v_branch_id := v_booking.branch_id;
    v_doctor_id := v_booking.doctor_id;
    v_patient_id := v_booking.patient_id;

    SELECT COUNT(*)
    INTO v_active_visit_count
    FROM public.patient_visits
    WHERE booking_id = v_booking.id
      AND visit_status NOT IN ('COMPLETED', 'CANCELLED');

    IF v_active_visit_count > 1 THEN
      RAISE EXCEPTION 'Booking memiliki lebih dari satu kunjungan aktif; periksa data sebelum check-in';
    END IF;

    SELECT *
    INTO v_visit
    FROM public.patient_visits
    WHERE booking_id = v_booking.id
      AND visit_status NOT IN ('COMPLETED', 'CANCELLED')
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM public.patient_visits WHERE booking_id = v_booking.id) THEN
        RAISE EXCEPTION 'Booking sudah memiliki kunjungan yang ditutup dan tidak dapat di-check-in ulang';
      END IF;

      INSERT INTO public.patient_visits (
        patient_id,
        branch_id,
        visit_date_time,
        visit_type,
        visit_status,
        booking_id,
        complaint,
        doctor_id,
        planned_treatments
      ) VALUES (
        v_patient_id,
        v_branch_id,
        v_arrival_at,
        'BOOKING',
        'WAITING',
        v_booking.id,
        COALESCE(NULLIF(BTRIM(p_complaint), ''), v_booking.complaint, v_booking.notes),
        v_doctor_id,
        COALESCE(v_booking.planned_treatments, '[]'::jsonb)
      )
      RETURNING * INTO v_visit;
    END IF;

    v_visit_id := v_visit.id;
    IF v_visit.patient_id <> v_patient_id
      OR v_visit.branch_id <> v_branch_id
      OR v_visit.booking_id <> v_booking.id
      OR (p_visit_id IS NOT NULL AND p_visit_id <> v_visit.id)
      OR (v_visit.doctor_id IS NOT NULL AND v_visit.doctor_id <> v_doctor_id) THEN
      RAISE EXCEPTION 'Relasi booking, pasien, dokter, cabang, dan kunjungan tidak sesuai';
    END IF;
  ELSE
    IF p_visit_id IS NULL THEN
      RAISE EXCEPTION 'Kunjungan wajib dipilih untuk check-in walk-in';
    END IF;

    SELECT *
    INTO v_visit
    FROM public.patient_visits
    WHERE id = p_visit_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kunjungan yang dipilih tidak ditemukan';
    END IF;
    IF v_visit.booking_id IS NOT NULL OR v_visit.visit_type <> 'WALK_IN' THEN
      RAISE EXCEPTION 'Kunjungan booking harus di-check-in melalui booking asalnya';
    END IF;
    IF v_visit.visit_status NOT IN ('WAITING', 'IN_TRIAGE') THEN
      RAISE EXCEPTION 'Status kunjungan tidak mengizinkan check-in';
    END IF;

    v_branch_id := v_visit.branch_id;
    v_doctor_id := COALESCE(v_visit.doctor_id, p_doctor_id);
    v_patient_id := v_visit.patient_id;
    v_visit_id := v_visit.id;

    IF v_doctor_id IS NULL THEN
      RAISE EXCEPTION 'Dokter untuk kunjungan ini belum ditentukan';
    END IF;
    IF (p_branch_id IS NOT NULL AND p_branch_id <> v_branch_id)
      OR (p_doctor_id IS NOT NULL AND p_doctor_id <> v_doctor_id)
      OR (p_patient_id IS NOT NULL AND p_patient_id <> v_patient_id) THEN
      RAISE EXCEPTION 'Data check-in tidak sesuai dengan kunjungan';
    END IF;
  END IF;

  IF NOT public.is_super_admin() AND NOT public.user_can_access_branch(v_branch_id) THEN
    RAISE EXCEPTION 'Akses ditolak: pengguna tidak memiliki akses ke cabang kunjungan';
  END IF;

  SELECT name INTO v_patient_name
  FROM public.patient_profiles
  WHERE id = v_patient_id;
  SELECT name INTO v_doctor_name
  FROM public.dental_doctors
  WHERE id = v_doctor_id;
  SELECT name INTO v_branch_name
  FROM public.dental_branches
  WHERE id = v_branch_id;

  SELECT *
  INTO v_queue
  FROM public.queue_items
  WHERE visit_id = v_visit_id
    AND status IN ('WAITING', 'IN_PREPARATION', 'IN_CONSULTATION', 'CALLING')
  ORDER BY created_at
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.bookings
    SET status = 'CONFIRMED',
        updated_at = v_arrival_at
    WHERE id = p_booking_id
      AND status = 'PENDING';
    RETURN NEXT v_queue;
    RETURN;
  END IF;

  IF p_booking_id IS NOT NULL
    AND (v_booking.booking_date_time AT TIME ZONE 'Asia/Jakarta')::DATE
      <> (v_arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE THEN
    RAISE EXCEPTION 'Booking hanya dapat di-check-in pada tanggal operasional yang sama';
  END IF;

  IF v_visit.visit_status NOT IN ('WAITING', 'IN_TRIAGE') THEN
    RAISE EXCEPTION 'Status kunjungan tidak mengizinkan check-in';
  END IF;

  UPDATE public.bookings
  SET status = 'CONFIRMED',
      updated_at = v_arrival_at
  WHERE id = p_booking_id
    AND status = 'PENDING';

  v_queue_day := (v_arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_patient_id::TEXT || ':' || v_branch_id::TEXT || ':' || v_queue_day::TEXT, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_branch_id::TEXT || ':' || v_doctor_id::TEXT || ':' || v_queue_day::TEXT, 0)
  );

  SELECT *
  INTO v_queue
  FROM public.queue_items
  WHERE visit_id = v_visit_id
    AND status IN ('WAITING', 'IN_PREPARATION', 'IN_CONSULTATION', 'CALLING')
  ORDER BY created_at
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.bookings
    SET status = 'CONFIRMED',
        updated_at = v_arrival_at
    WHERE id = p_booking_id
      AND status = 'PENDING';
    RETURN NEXT v_queue;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.queue_items
    WHERE patient_id = v_patient_id
      AND branch_id = v_branch_id
      AND (arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE = v_queue_day
      AND status IN ('WAITING', 'IN_PREPARATION', 'IN_CONSULTATION', 'CALLING')
      AND visit_id <> v_visit_id
  ) THEN
    RAISE EXCEPTION 'Pasien ini sudah berada di antrean aktif hari ini melalui kunjungan lain';
  END IF;

  SELECT COALESCE(MAX(sequence_order), 0) + 1
  INTO v_next_sequence
  FROM public.queue_items
  WHERE branch_id = v_branch_id
    AND doctor_id = v_doctor_id
    AND (arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE = v_queue_day;

  v_doctor_prefix := COALESCE(
    NULLIF(LEFT(UPPER(TRIM(REGEXP_REPLACE(
      COALESCE(v_doctor_name, p_doctor_name_snapshot, ''),
      '^[[:space:]]*drg\.?[[:space:]]*',
      '',
      'i'
    ))), 1), ''),
    'A'
  );

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
    doctor_name_snapshot,
    branch_name_snapshot,
    updated_at
  ) VALUES (
    COALESCE(p_queue_id, gen_random_uuid()),
    v_branch_id,
    v_doctor_id,
    v_visit_id,
    p_booking_id,
    v_patient_id,
    v_doctor_prefix || '-' || LPAD(v_next_sequence::TEXT, 2, '0'),
    'WAITING',
    v_next_sequence,
    v_arrival_at,
    p_preferred_service_at,
    COALESCE(p_estimated_duration_minutes, 30),
    CASE WHEN p_booking_id IS NOT NULL
      THEN COALESCE(p_booking_time_snapshot, v_booking.booking_date_time::TEXT)
      ELSE p_booking_time_snapshot
    END,
    COALESCE(v_patient_name, p_patient_name_snapshot),
    COALESCE(v_doctor_name, p_doctor_name_snapshot),
    v_branch_name,
    v_arrival_at
  )
  RETURNING * INTO v_queue;

  RETURN NEXT v_queue;
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_visit_to_queue(
  UUID, UUID, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in_visit_to_queue(
  UUID, UUID, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_visit_to_queue(
  UUID, UUID, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT, TEXT
) TO service_role;
