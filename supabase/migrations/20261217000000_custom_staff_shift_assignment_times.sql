ALTER TABLE public.staff_shift_assignments
  ALTER COLUMN shift_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS custom_shift_name TEXT,
  ADD COLUMN IF NOT EXISTS custom_start_time VARCHAR(10),
  ADD COLUMN IF NOT EXISTS custom_end_time VARCHAR(10);

ALTER TABLE public.staff_shift_assignments
  DROP CONSTRAINT IF EXISTS staff_shift_assignments_schedule_override_check;

ALTER TABLE public.staff_shift_assignments
  ADD CONSTRAINT staff_shift_assignments_schedule_override_check
  CHECK (
    (
      shift_id IS NOT NULL
      AND custom_shift_name IS NULL
      AND custom_start_time IS NULL
      AND custom_end_time IS NULL
    )
    OR (
      shift_id IS NULL
      AND NULLIF(BTRIM(custom_shift_name), '') IS NOT NULL
      AND custom_start_time IS NOT NULL
      AND custom_end_time IS NOT NULL
      AND custom_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND custom_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND custom_end_time > custom_start_time
    )
  );

CREATE OR REPLACE FUNCTION public.save_staff_shift_monthly_roster(
  p_branch_id UUID,
  p_rotation_anchor_monday DATE,
  p_templates JSONB,
  p_assignments JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template RECORD;
  v_assignment RECORD;
  v_existing_count INTEGER;
  v_saved_count INTEGER := 0;
BEGIN
  IF NOT public.employee_portal_can_manage_branch(p_branch_id) THEN
    RAISE EXCEPTION 'Tidak memiliki akses untuk mengelola jadwal cabang ini.'
      USING ERRCODE = '42501';
  END IF;

  IF p_rotation_anchor_monday IS NULL
    OR EXTRACT(ISODOW FROM p_rotation_anchor_monday) <> 1
    OR p_templates IS NULL
    OR p_assignments IS NULL THEN
    RAISE EXCEPTION 'Data pola rotasi atau jadwal bulanan tidak valid.';
  END IF;

  IF jsonb_typeof(p_templates) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_assignments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Data pola rotasi atau jadwal bulanan tidak valid.';
  END IF;

  IF jsonb_array_length(p_templates) = 0 OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'Data pola rotasi atau jadwal bulanan tidak valid.';
  END IF;

  FOR v_template IN
    SELECT *
    FROM jsonb_to_recordset(p_templates) AS item(staff_id UUID, initial_shift_id UUID)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = v_template.staff_id
        AND s.branch_id = p_branch_id
        AND s.active = true
        AND s.employment_status = 'ACTIVE'
        AND s.position IN ('BRANCH_ADMIN', 'ASSISTANT')
    ) THEN
      RAISE EXCEPTION 'Pola rotasi berisi pegawai tidak aktif atau di luar cabang.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.work_shifts ws
      WHERE ws.id = v_template.initial_shift_id
        AND ws.branch_id = p_branch_id
        AND ws.active = true
        AND (
          (ws.start_time = '08:00' AND ws.end_time = '14:00')
          OR (ws.start_time = '14:00' AND ws.end_time = '21:00')
        )
    ) THEN
      RAISE EXCEPTION 'Pola rotasi menggunakan shift standar yang tidak aktif atau milik cabang lain.';
    END IF;

    INSERT INTO public.staff_shift_rotation_templates (
      branch_id, staff_id, initial_shift_id, rotation_anchor_monday, updated_at
    )
    VALUES (
      p_branch_id, v_template.staff_id, v_template.initial_shift_id,
      p_rotation_anchor_monday, timezone('utc'::text, now())
    )
    ON CONFLICT (branch_id, staff_id) DO UPDATE
      SET initial_shift_id = EXCLUDED.initial_shift_id,
          rotation_anchor_monday = EXCLUDED.rotation_anchor_monday,
          updated_at = EXCLUDED.updated_at;
  END LOOP;

  FOR v_assignment IN
    SELECT *
    FROM jsonb_to_recordset(p_assignments)
      AS item(staff_id UUID, shift_id UUID, date DATE, active BOOLEAN, notes TEXT)
  LOOP
    IF v_assignment.date IS NULL
      OR EXTRACT(ISODOW FROM v_assignment.date) = 7
      OR NOT EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id = v_assignment.staff_id
          AND s.branch_id = p_branch_id
          AND s.active = true
          AND s.employment_status = 'ACTIVE'
          AND s.position IN ('BRANCH_ADMIN', 'ASSISTANT')
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.work_shifts ws
        WHERE ws.id = v_assignment.shift_id
          AND ws.branch_id = p_branch_id
          AND ws.active = true
      ) THEN
      RAISE EXCEPTION 'Jadwal berisi tanggal, pegawai, atau shift yang tidak valid.';
    END IF;

    SELECT count(*) INTO v_existing_count
    FROM public.staff_shift_assignments ssa
    WHERE ssa.branch_id = p_branch_id
      AND ssa.staff_id = v_assignment.staff_id
      AND ssa.date = v_assignment.date;

    IF v_existing_count > 1 THEN
      RAISE EXCEPTION 'Ada jadwal duplikat untuk pegawai dan tanggal yang sama; periksa jadwal sebelum membuat roster.';
    ELSIF v_existing_count = 1 THEN
      UPDATE public.staff_shift_assignments AS existing
      SET shift_id = v_assignment.shift_id,
          custom_shift_name = NULL,
          custom_start_time = NULL,
          custom_end_time = NULL,
          active = COALESCE(v_assignment.active, true),
          notes = COALESCE(v_assignment.notes, existing.notes),
          updated_at = timezone('utc'::text, now())
      WHERE existing.branch_id = p_branch_id
        AND existing.staff_id = v_assignment.staff_id
        AND existing.date = v_assignment.date;
    ELSE
      INSERT INTO public.staff_shift_assignments (
        staff_id, branch_id, shift_id, date, active, notes
      )
      VALUES (
        v_assignment.staff_id, p_branch_id, v_assignment.shift_id,
        v_assignment.date, COALESCE(v_assignment.active, true), v_assignment.notes
      );
    END IF;
    v_saved_count := v_saved_count + 1;
  END LOOP;

  RETURN v_saved_count;
END;
$$;

REVOKE ALL ON FUNCTION public.save_staff_shift_monthly_roster(UUID, DATE, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_staff_shift_monthly_roster(UUID, DATE, JSONB, JSONB) TO authenticated;

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
      AND branch_id = p_branch_id
  ) THEN
    RAISE EXCEPTION 'Absensi di cabang ini sudah tercatat hari ini.';
  END IF;

  UPDATE public.attendances previous
  SET check_out_correction_status = 'PENDING',
      check_out_correction_requested_at = COALESCE(previous.check_out_correction_requested_at, NOW()),
      check_out_correction_requested_by = COALESCE(previous.check_out_correction_requested_by, auth.uid()),
      check_out_correction_reason = COALESCE(
        previous.check_out_correction_reason,
        format(
          'Check-out terlupa sebelum check-in di cabang %s.',
          (SELECT branch.name FROM public.dental_branches branch WHERE branch.id = p_branch_id)
        )
      ),
      updated_at = NOW(),
      updated_by = auth.uid()::TEXT
  WHERE previous.staff_id = v_staff_id
    AND previous.date = v_date
    AND previous.branch_id <> p_branch_id
    AND previous.actual_check_in_at IS NOT NULL
    AND previous.actual_check_out_at IS NULL
    AND previous.check_out_correction_status IS DISTINCT FROM 'APPROVED';

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
    SELECT
      COALESCE(ssa.custom_start_time, ws.start_time),
      COALESCE(ssa.custom_end_time, ws.end_time)
    INTO v_start_time, v_end_time
    FROM public.staff_shift_assignments ssa
    LEFT JOIN public.work_shifts ws ON ws.id = ssa.shift_id AND ws.active = true
    WHERE ssa.staff_id = v_staff_id
      AND ssa.branch_id = p_branch_id
      AND ssa.date = v_date
      AND ssa.active = true
      AND (ssa.custom_start_time IS NOT NULL OR ws.id IS NOT NULL)
    ORDER BY COALESCE(ssa.custom_start_time, ws.start_time)
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
