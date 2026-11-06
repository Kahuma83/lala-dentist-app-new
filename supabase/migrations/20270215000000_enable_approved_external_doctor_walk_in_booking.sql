CREATE OR REPLACE FUNCTION public.get_walkin_external_doctors(
  p_branch_id UUID,
  p_covered_date DATE
)
RETURNS TABLE (
  external_doctor_id UUID,
  full_name TEXT,
  doctor_id UUID,
  start_time TEXT,
  end_time TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR COALESCE(public.get_user_role(), '') NOT IN ('SUPER_ADMIN', 'BRANCH_ADMIN') THEN
    RAISE EXCEPTION 'Akses ditolak: hanya Admin Cabang atau Super Admin yang dapat memilih dokter eksternal.';
  END IF;

  IF NOT public.is_super_admin()
    AND NOT public.user_can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'Akses ditolak: pengguna tidak memiliki akses ke cabang ini.';
  END IF;

  IF p_covered_date IS DISTINCT FROM (timezone('Asia/Jakarta', now()))::DATE THEN
    RAISE EXCEPTION 'Dokter eksternal hanya dapat dipilih untuk Walk-In pada tanggal operasional hari ini.';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (assignment.id)
    recipient.id,
    recipient.full_name::TEXT,
    doctor.id,
    schedule.start_time::TEXT,
    schedule.end_time::TEXT
  FROM public.external_doctor_replacement_assignments assignment
  JOIN public.staff_absence_requests request
    ON request.id = assignment.absence_request_id
   AND request.status = 'APPROVED'
  JOIN public.external_doctor_recipients recipient
    ON recipient.id = assignment.external_doctor_id
   AND recipient.active
  JOIN public.dental_doctors doctor
    ON doctor.staff_id = request.staff_id
   AND doctor.active
  JOIN public.doctor_schedules schedule
    ON schedule.doctor_id = doctor.id
   AND schedule.branch_id = assignment.branch_id
   AND schedule.date = assignment.covered_date
  WHERE assignment.branch_id = p_branch_id
    AND assignment.covered_date = p_covered_date
  ORDER BY assignment.id, schedule.start_time;
END;
$$;

REVOKE ALL ON FUNCTION public.get_walkin_external_doctors(UUID, DATE)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_walkin_external_doctors(UUID, DATE)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_external_doctor_booking_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking_date DATE;
BEGIN
  IF auth.role() = 'service_role'
    OR NEW.external_doctor_id IS NULL
    OR (
      TG_OP = 'UPDATE'
      AND NEW.external_doctor_id IS NOT DISTINCT FROM OLD.external_doctor_id
    ) THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_super_admin()
    AND (
      COALESCE(public.get_user_role(), '') <> 'BRANCH_ADMIN'
      OR COALESCE(NEW.source, NEW.channel) <> 'WALK_IN'
    OR NOT public.user_can_access_branch(NEW.branch_id)
    ) THEN
    RAISE EXCEPTION 'Dokter eksternal hanya dapat dipilih oleh Admin Cabang untuk booking Walk-In.';
  END IF;

  IF TG_OP = 'INSERT'
    AND COALESCE(NEW.source, NEW.channel) <> 'WALK_IN' THEN
    RAISE EXCEPTION 'Booking dokter eksternal baru hanya dapat dibuat melalui sumber Walk-In.';
  END IF;

  v_booking_date := (NEW.booking_date_time AT TIME ZONE 'Asia/Jakarta')::DATE;
  IF (
      TG_OP = 'INSERT'
      AND v_booking_date IS DISTINCT FROM (timezone('Asia/Jakarta', now()))::DATE
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.external_doctor_replacement_assignments assignment
      JOIN public.staff_absence_requests request
        ON request.id = assignment.absence_request_id
       AND request.status = 'APPROVED'
      JOIN public.dental_doctors absent_doctor
        ON absent_doctor.staff_id = request.staff_id
       AND absent_doctor.id = NEW.doctor_id
      JOIN public.external_doctor_recipients recipient
        ON recipient.id = assignment.external_doctor_id
       AND recipient.active
      JOIN public.doctor_schedules schedule
        ON schedule.doctor_id = absent_doctor.id
       AND schedule.branch_id = assignment.branch_id
       AND schedule.date = assignment.covered_date
      WHERE assignment.external_doctor_id = NEW.external_doctor_id
        AND assignment.branch_id = NEW.branch_id
        AND assignment.covered_date = v_booking_date
        AND (
          TG_OP = 'UPDATE'
          OR (
            (NEW.booking_date_time AT TIME ZONE 'Asia/Jakarta')::TIME >= schedule.start_time::TIME
            AND (NEW.booking_date_time AT TIME ZONE 'Asia/Jakarta')::TIME < schedule.end_time::TIME
          )
        )
    ) THEN
    RAISE EXCEPTION 'Dokter eksternal tidak memiliki penugasan pengganti yang disetujui untuk cabang dan tanggal booking ini.';
  END IF;

  RETURN NEW;
END;
$$;
