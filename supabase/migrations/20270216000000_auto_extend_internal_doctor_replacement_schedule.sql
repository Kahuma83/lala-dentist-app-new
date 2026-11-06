DO $$
DECLARE
  v_definition TEXT;
  v_updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.review_doctor_absence_request(uuid,boolean,text,uuid,uuid)'::regprocedure
  ) INTO v_definition;

  v_updated_definition := replace(
    v_definition,
    $attendance_guard$
      IF EXISTS (
        SELECT 1
        FROM public.staff_replacement_assignments
        WHERE replacement_staff_id = v_replacement_staff.id
          AND covered_date = v_schedule.date
      ) OR EXISTS (
        SELECT 1
        FROM public.attendances
        WHERE staff_id = v_replacement_staff.id
          AND date = v_schedule.date
      ) THEN
        RAISE EXCEPTION 'Dokter internal sudah memiliki absensi atau penugasan pada tanggal %.', v_schedule.date;
      END IF;
$attendance_guard$,
    $assignment_guard$
      IF EXISTS (
        SELECT 1
        FROM public.staff_replacement_assignments
        WHERE replacement_staff_id = v_replacement_staff.id
          AND covered_date = v_schedule.date
      ) THEN
        RAISE EXCEPTION 'Dokter internal sudah memiliki penugasan pengganti pada tanggal %.', v_schedule.date;
      END IF;
$assignment_guard$
  );
  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'Tidak menemukan validasi absensi dokter pengganti pada fungsi review dokter.';
  END IF;

  v_definition := v_updated_definition;
  v_updated_definition := replace(
    v_definition,
    '  v_schedule RECORD;',
    '  v_schedule RECORD;' || E'\n' || '  v_replacement_schedule public.doctor_schedules;'
  );
  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'Tidak menemukan deklarasi jadwal pada fungsi review dokter.';
  END IF;

  v_definition := v_updated_definition;
  v_updated_definition := replace(
    v_definition,
    $schedule_marker$
      INSERT INTO public.staff_replacement_assignments (
$schedule_marker$,
    $schedule_extension$
      SELECT schedule.* INTO v_replacement_schedule
      FROM public.doctor_schedules schedule
      WHERE schedule.doctor_id = p_replacement_doctor_id
        AND schedule.branch_id = v_schedule.branch_id
        AND schedule.date = v_schedule.date
        AND schedule.status = 'ACTIVE'
      ORDER BY schedule.start_time::TIME
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.doctor_schedules
        SET start_time = to_char(
              LEAST(start_time::TIME, v_schedule.start_time::TIME),
              'HH24:MI'
            ),
            end_time = to_char(
              GREATEST(end_time::TIME, v_schedule.end_time::TIME),
              'HH24:MI'
            ),
            updated_at = timezone('utc'::TEXT, now())
        WHERE id = v_replacement_schedule.id;
      ELSE
        INSERT INTO public.doctor_schedules (
          doctor_id, branch_id, date, start_time, end_time, status, notes
        ) VALUES (
          p_replacement_doctor_id,
          v_schedule.branch_id,
          v_schedule.date,
          v_schedule.start_time,
          v_schedule.end_time,
          'ACTIVE',
          'Jadwal diperpanjang untuk penugasan dokter pengganti.'
        );
      END IF;

      INSERT INTO public.staff_replacement_assignments (
$schedule_extension$
  );
  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'Tidak menemukan titik penambahan jadwal pengganti pada fungsi review dokter.';
  END IF;

  EXECUTE v_updated_definition;
END;
$$;
