CREATE OR REPLACE FUNCTION public.record_staff_attendance_check_in(
  p_branch_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_accuracy_meters DOUBLE PRECISION,
  p_photo_path TEXT
)
RETURNS public.attendances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
  v_role TEXT;
  v_date DATE;
  v_local_time TIME;
  v_start_time VARCHAR(10);
  v_end_time VARCHAR(10);
  v_doctor_id UUID;
  v_late_minutes INTEGER;
  v_record public.attendances;
BEGIN
  v_staff_id := public.assert_self_attendance_location(
    p_branch_id, p_latitude, p_longitude, p_accuracy_meters, p_photo_path
  );
  v_role := public.get_user_role();
  v_date := (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE;
  v_local_time := (NOW() AT TIME ZONE 'Asia/Jakarta')::TIME;

  PERFORM pg_advisory_xact_lock(hashtext(v_staff_id::TEXT), hashtext(v_date::TEXT));

  IF EXISTS (
    SELECT 1
    FROM public.attendances
    WHERE staff_id = v_staff_id
      AND date = v_date
      AND (
        branch_id = p_branch_id
        OR (actual_check_in_at IS NOT NULL AND actual_check_out_at IS NULL)
      )
  ) THEN
    RAISE EXCEPTION 'Absensi di cabang ini sudah tercatat atau absensi cabang sebelumnya belum check-out.';
  END IF;

  IF v_role = 'DOCTOR' THEN
    SELECT dd.id INTO v_doctor_id
    FROM public.dental_doctors dd
    WHERE dd.staff_id = v_staff_id AND dd.active = true
    LIMIT 1;

    SELECT ds.start_time, ds.end_time INTO v_start_time, v_end_time
    FROM public.doctor_schedules ds
    WHERE ds.doctor_id = v_doctor_id
      AND ds.branch_id = p_branch_id
      AND ds.date = v_date
      AND ds.status = 'ACTIVE'
    ORDER BY ds.start_time
    LIMIT 1;
  ELSE
    SELECT ws.start_time, ws.end_time INTO v_start_time, v_end_time
    FROM public.staff_shift_assignments ssa
    JOIN public.work_shifts ws ON ws.id = ssa.shift_id AND ws.active = true
    WHERE ssa.staff_id = v_staff_id
      AND ssa.branch_id = p_branch_id
      AND ssa.date = v_date
      AND ssa.active = true
    ORDER BY ws.start_time
    LIMIT 1;
  END IF;

  IF v_start_time IS NULL OR v_end_time IS NULL THEN
    RAISE EXCEPTION 'Jadwal kerja aktif hari ini belum tersedia untuk cabang ini.';
  END IF;

  v_late_minutes := GREATEST(
    0,
    FLOOR(EXTRACT(EPOCH FROM (v_local_time - v_start_time::TIME)) / 60)::INTEGER
  );

  INSERT INTO public.attendances (
    staff_id, branch_id, date, attendance_status,
    scheduled_start_at, scheduled_end_at, actual_check_in_at,
    late_minutes, check_in_photo_path, check_in_latitude,
    check_in_longitude, check_in_accuracy_meters, check_in_method,
    created_by, updated_by
  )
  VALUES (
    v_staff_id, p_branch_id, v_date,
    CASE WHEN v_late_minutes > 0 THEN 'LATE' ELSE 'PRESENT' END,
    v_start_time, v_end_time, NOW(), v_late_minutes,
    p_photo_path, p_latitude, p_longitude, p_accuracy_meters,
    'MOBILE', auth.uid()::TEXT, auth.uid()::TEXT
  )
  RETURNING * INTO v_record;

  RETURN v_record;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_staff_attendance_check_in(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated;
