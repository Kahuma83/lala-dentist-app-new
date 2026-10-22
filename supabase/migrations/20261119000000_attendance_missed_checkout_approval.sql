ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS check_out_correction_status TEXT,
  ADD COLUMN IF NOT EXISTS check_out_correction_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_out_correction_requested_by UUID,
  ADD COLUMN IF NOT EXISTS check_out_correction_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_out_correction_approved_by UUID,
  ADD COLUMN IF NOT EXISTS check_out_correction_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.attendances'::regclass
      AND conname = 'attendances_checkout_correction_status_check'
  ) THEN
    ALTER TABLE public.attendances
      ADD CONSTRAINT attendances_checkout_correction_status_check
      CHECK (check_out_correction_status IS NULL OR check_out_correction_status IN ('PENDING', 'APPROVED', 'RESOLVED'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_staff_attendance_check_out(
  p_attendance_id UUID,
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
  v_record public.attendances;
  v_local_time TIME;
  v_early_minutes INTEGER;
BEGIN
  v_staff_id := public.assert_self_attendance_location(
    p_branch_id,
    p_latitude, p_longitude, p_accuracy_meters, p_photo_path
  );

  SELECT * INTO v_record
  FROM public.attendances
  WHERE id = p_attendance_id
    AND staff_id = v_staff_id
    AND branch_id = p_branch_id
    AND date = (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE
  FOR UPDATE;

  IF NOT FOUND OR v_record.actual_check_in_at IS NULL THEN
    RAISE EXCEPTION 'Check-in hari ini tidak ditemukan.';
  END IF;
  IF v_record.actual_check_out_at IS NOT NULL THEN
    RAISE EXCEPTION 'Check-out hari ini sudah tercatat.';
  END IF;

  v_local_time := (NOW() AT TIME ZONE 'Asia/Jakarta')::TIME;
  v_early_minutes := GREATEST(
    0,
    FLOOR(EXTRACT(EPOCH FROM (v_record.scheduled_end_at::TIME - v_local_time)) / 60)::INTEGER
  );

  UPDATE public.attendances
  SET actual_check_out_at = NOW(),
      early_checkout_minutes = v_early_minutes,
      check_out_photo_path = p_photo_path,
      check_out_latitude = p_latitude,
      check_out_longitude = p_longitude,
      check_out_accuracy_meters = p_accuracy_meters,
      check_out_method = 'MOBILE',
      check_out_correction_status = CASE
        WHEN check_out_correction_status = 'PENDING' THEN 'RESOLVED'
        ELSE check_out_correction_status
      END,
      updated_by = auth.uid()::TEXT,
      updated_at = NOW()
  WHERE id = p_attendance_id
  RETURNING * INTO v_record;

  RETURN v_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_self_attendance_location(
  p_branch_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_accuracy_meters DOUBLE PRECISION,
  p_photo_path TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
  v_role TEXT;
  v_branch RECORD;
  v_distance DOUBLE PRECISION;
  v_path_prefix TEXT;
  v_date DATE := (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi login tidak valid.';
  END IF;

  v_role := public.get_user_role();
  IF v_role IS NULL OR v_role NOT IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT', 'OB') THEN
    RAISE EXCEPTION 'Role akun ini tidak diizinkan melakukan absensi mandiri.';
  END IF;

  v_staff_id := public.get_user_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Akun belum terhubung ke data staf. Hubungi Super Admin.';
  END IF;
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'Cabang absensi wajib dipilih.';
  END IF;

  IF v_role = 'BRANCH_ADMIN' AND (
    public.get_user_branch_id() IS NULL
    OR p_branch_id::TEXT <> public.get_user_branch_id()::TEXT
  ) THEN
    RAISE EXCEPTION 'Absensi Branch Admin hanya dapat dilakukan pada cabang akun.';
  ELSIF v_role = 'DOCTOR' AND NOT EXISTS (
    SELECT 1
    FROM public.dental_doctors dd
    JOIN public.doctor_schedules ds ON ds.doctor_id = dd.id
    WHERE dd.staff_id = v_staff_id
      AND dd.active = true
      AND ds.branch_id = p_branch_id
      AND ds.date = v_date
      AND ds.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Tidak ada jadwal praktik aktif Anda di cabang ini hari ini.';
  ELSIF v_role IN ('DOCTOR_ASSISTANT', 'OB') AND NOT EXISTS (
    SELECT 1
    FROM public.staff_shift_assignments ssa
    WHERE ssa.staff_id = v_staff_id
      AND ssa.branch_id = p_branch_id
      AND ssa.date = v_date
      AND ssa.active = true
  ) THEN
    RAISE EXCEPTION 'Tidak ada penempatan shift aktif Anda di cabang ini hari ini.';
  END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude NOT BETWEEN -90 AND 90
     OR p_longitude NOT BETWEEN -180 AND 180
     OR p_accuracy_meters IS NULL OR p_accuracy_meters <= 0 THEN
    RAISE EXCEPTION 'Data GPS tidak valid. Aktifkan lokasi dan coba kembali.';
  END IF;

  SELECT id, is_active, geofence_latitude, geofence_longitude, geofence_radius_meters
  INTO v_branch
  FROM public.dental_branches
  WHERE id = p_branch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cabang tidak ditemukan.';
  END IF;
  IF NOT v_branch.is_active THEN
    RAISE EXCEPTION 'Cabang tidak aktif.';
  END IF;
  IF v_branch.geofence_latitude IS NULL
     OR v_branch.geofence_longitude IS NULL
     OR v_branch.geofence_radius_meters IS NULL THEN
    RAISE EXCEPTION 'Geofence cabang ini belum dikonfigurasi. Check-in mandiri belum tersedia.';
  END IF;
  IF p_accuracy_meters > v_branch.geofence_radius_meters THEN
    RAISE EXCEPTION 'Akurasi GPS terlalu rendah (% m). Tunggu lokasi lebih akurat lalu coba kembali.', ROUND(p_accuracy_meters::NUMERIC);
  END IF;

  v_distance := 2 * 6371000 * ASIN(SQRT(LEAST(1, GREATEST(0,
    POWER(SIN(RADIANS(p_latitude - v_branch.geofence_latitude) / 2), 2)
    + COS(RADIANS(v_branch.geofence_latitude)) * COS(RADIANS(p_latitude))
    * POWER(SIN(RADIANS(p_longitude - v_branch.geofence_longitude) / 2), 2)
  ))));

  IF v_distance > v_branch.geofence_radius_meters THEN
    RAISE EXCEPTION 'Anda berada di luar area absensi cabang (jarak sekitar % m; batas % m).',
      ROUND(v_distance::NUMERIC), v_branch.geofence_radius_meters;
  END IF;

  v_path_prefix := p_branch_id::TEXT || '/' || v_staff_id::TEXT || '/';
  IF p_photo_path IS NULL OR LEFT(p_photo_path, LENGTH(v_path_prefix)) <> v_path_prefix THEN
    RAISE EXCEPTION 'Path foto absensi tidak sesuai dengan akun dan cabang.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'attendance-evidence' AND name = p_photo_path
  ) THEN
    RAISE EXCEPTION 'Foto bukti absensi belum berhasil diunggah.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff
    WHERE id = v_staff_id
      AND active = true
      AND employment_status = 'ACTIVE'
      AND (
        (v_role = 'BRANCH_ADMIN' AND position = 'BRANCH_ADMIN')
        OR (v_role = 'DOCTOR' AND position = 'DOCTOR')
        OR (v_role = 'DOCTOR_ASSISTANT' AND position = 'ASSISTANT')
        OR (v_role = 'OB' AND position = 'OB')
      )
  ) THEN
    RAISE EXCEPTION 'Data staf tidak aktif atau tidak sesuai dengan role akun.';
  END IF;

  RETURN v_staff_id;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.approve_staff_attendance_checkout_correction(
  p_attendance_id UUID,
  p_check_out_at TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.attendances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record public.attendances;
BEGIN
  IF public.get_user_role() IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat menyetujui koreksi check-out.';
  END IF;

  IF p_check_out_at IS NULL THEN
    RAISE EXCEPTION 'Waktu pulang koreksi wajib diisi.';
  END IF;

  SELECT *
  INTO v_record
  FROM public.attendances
  WHERE id = p_attendance_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_record.check_out_correction_status IS DISTINCT FROM 'PENDING'
    OR v_record.actual_check_in_at IS NULL
    OR v_record.actual_check_out_at IS NOT NULL THEN
    RAISE EXCEPTION 'Permintaan koreksi check-out tidak ditemukan atau sudah diproses.';
  END IF;

  IF p_check_out_at < v_record.actual_check_in_at THEN
    RAISE EXCEPTION 'Waktu checkout tidak boleh sebelum waktu check-in.';
  END IF;
  IF (p_check_out_at AT TIME ZONE 'Asia/Jakarta')::DATE <> v_record.date OR p_check_out_at > NOW() THEN
    RAISE EXCEPTION 'Waktu pulang koreksi harus pada tanggal absensi dan tidak boleh di masa depan.';
  END IF;

  UPDATE public.attendances
  SET actual_check_out_at = p_check_out_at,
      early_checkout_minutes = GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM (
          (date + scheduled_end_at::TIME) AT TIME ZONE 'Asia/Jakarta' - p_check_out_at
        )) / 60)::INTEGER
      ),
      check_out_method = 'WEB',
      check_out_correction_status = 'APPROVED',
      check_out_correction_approved_at = NOW(),
      check_out_correction_approved_by = auth.uid(),
      check_out_correction_reason = CASE
        WHEN NULLIF(BTRIM(p_notes), '') IS NULL THEN check_out_correction_reason
        WHEN NULLIF(BTRIM(check_out_correction_reason), '') IS NULL THEN BTRIM(p_notes)
        ELSE check_out_correction_reason || ' Catatan Super Admin: ' || BTRIM(p_notes)
      END,
      updated_at = NOW(),
      updated_by = auth.uid()::TEXT
  WHERE id = p_attendance_id
  RETURNING * INTO v_record;

  RETURN v_record;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_staff_attendance_checkout_correction(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_staff_attendance_checkout_correction(UUID, TIMESTAMPTZ, TEXT) TO authenticated;
