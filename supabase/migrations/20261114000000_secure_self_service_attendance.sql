-- Self-service attendance with branch geofencing, private photo evidence, and server timestamps.

ALTER TABLE public.user_accounts
  DROP CONSTRAINT IF EXISTS chk_user_role;

ALTER TABLE public.user_accounts
  ADD CONSTRAINT chk_user_role
  CHECK (role IN ('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT', 'OB', 'PATIENT'));

ALTER TABLE public.dental_branches
  ADD COLUMN IF NOT EXISTS geofence_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geofence_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geofence_radius_meters INTEGER;

ALTER TABLE public.dental_branches
  DROP CONSTRAINT IF EXISTS dental_branches_geofence_valid;

ALTER TABLE public.dental_branches
  ADD CONSTRAINT dental_branches_geofence_valid
  CHECK (
    (geofence_latitude IS NULL AND geofence_longitude IS NULL AND geofence_radius_meters IS NULL)
    OR (
      geofence_latitude IS NOT NULL
      AND geofence_longitude IS NOT NULL
      AND geofence_radius_meters IS NOT NULL
      AND
      geofence_latitude BETWEEN -90 AND 90
      AND geofence_longitude BETWEEN -180 AND 180
      AND geofence_radius_meters BETWEEN 1 AND 1000
    )
  );

UPDATE public.dental_branches
SET geofence_latitude = -8.1654372,
    geofence_longitude = 113.68065317,
    geofence_radius_meters = 100
WHERE LOWER(TRIM(name)) = 'cabang gebang';

UPDATE public.dental_branches
SET geofence_latitude = -8.3418709,
    geofence_longitude = 113.6046025,
    geofence_radius_meters = 100
WHERE LOWER(TRIM(name)) = 'cabang ambulu';

UPDATE public.dental_branches
SET geofence_latitude = -8.2344676,
    geofence_longitude = 113.7053841,
    geofence_radius_meters = 100
WHERE LOWER(TRIM(name)) = 'cabang lengkong mumbul';

UPDATE public.dental_branches
SET geofence_latitude = -8.2849817,
    geofence_longitude = 113.3799038,
    geofence_radius_meters = 100
WHERE LOWER(TRIM(name)) = 'cabang kencong';

ALTER TABLE public.dental_branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Attendance users read assigned branch" ON public.dental_branches;
CREATE POLICY "Attendance users read assigned branch" ON public.dental_branches
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT', 'OB')
    AND (
      dental_branches.id::TEXT = public.get_user_branch_id()::TEXT
      OR (
        public.get_user_role() = 'DOCTOR'
        AND EXISTS (
          SELECT 1
          FROM public.dental_doctors dd
          JOIN public.doctor_schedules ds ON ds.doctor_id = dd.id
          WHERE dd.staff_id = public.get_user_staff_id()
            AND ds.branch_id = dental_branches.id
            AND ds.date = (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE
            AND ds.status = 'ACTIVE'
        )
      )
    )
  );

ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS check_in_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS check_in_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS check_in_accuracy_meters DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS check_out_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS check_out_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS check_out_accuracy_meters DOUBLE PRECISION;

ALTER TABLE public.attendances
  DROP CONSTRAINT IF EXISTS attendances_location_valid;

ALTER TABLE public.attendances
  DROP CONSTRAINT IF EXISTS attendances_checkout_location_valid;

ALTER TABLE public.attendances
  ADD CONSTRAINT attendances_location_valid
  CHECK (
    (check_in_latitude IS NULL AND check_in_longitude IS NULL AND check_in_accuracy_meters IS NULL)
    OR (
      check_in_latitude IS NOT NULL
      AND check_in_longitude IS NOT NULL
      AND check_in_accuracy_meters IS NOT NULL
      AND
      check_in_latitude BETWEEN -90 AND 90
      AND check_in_longitude BETWEEN -180 AND 180
      AND check_in_accuracy_meters >= 0
    )
  ),
  ADD CONSTRAINT attendances_checkout_location_valid
  CHECK (
    (check_out_latitude IS NULL AND check_out_longitude IS NULL AND check_out_accuracy_meters IS NULL)
    OR (
      check_out_latitude IS NOT NULL
      AND check_out_longitude IS NOT NULL
      AND check_out_accuracy_meters IS NOT NULL
      AND
      check_out_latitude BETWEEN -90 AND 90
      AND check_out_longitude BETWEEN -180 AND 180
      AND check_out_accuracy_meters >= 0
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('attendance-evidence', 'attendance-evidence', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Attendance read access" ON public.attendances;
CREATE POLICY "Attendance read access" ON public.attendances
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR staff_id = public.get_user_staff_id()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
    )
  );

REVOKE INSERT, UPDATE, DELETE ON TABLE public.attendances FROM anon, authenticated;
GRANT SELECT ON TABLE public.attendances TO authenticated;

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
  IF v_role <> 'DOCTOR' AND (
    public.get_user_branch_id() IS NULL
    OR p_branch_id::TEXT <> public.get_user_branch_id()::TEXT
  ) THEN
    RAISE EXCEPTION 'Absensi hanya dapat dilakukan pada cabang akun Anda.';
  END IF;
  IF v_role = 'DOCTOR' AND NOT EXISTS (
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
    RAISE EXCEPTION 'Akurasi GPS terlalu rendah (% m). Tunggu lokasi lebih akurat lalu coba lagi.', ROUND(p_accuracy_meters::NUMERIC);
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
    SELECT 1 FROM public.attendances
    WHERE staff_id = v_staff_id AND date = v_date
  ) THEN
    RAISE EXCEPTION 'Absensi hari ini sudah tercatat.';
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
      updated_by = auth.uid()::TEXT,
      updated_at = NOW()
  WHERE id = p_attendance_id
  RETURNING * INTO v_record;

  RETURN v_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_staff_absence(
  p_staff_id UUID,
  p_branch_id UUID,
  p_date DATE,
  p_attendance_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.attendances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_staff public.staff;
  v_start_time VARCHAR(10) := '-';
  v_end_time VARCHAR(10) := '-';
  v_record public.attendances;
BEGIN
  v_role := public.get_user_role();
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('SUPER_ADMIN', 'BRANCH_ADMIN') THEN
    RAISE EXCEPTION 'Hanya Admin Cabang atau Super Admin yang dapat mencatat izin/sakit.';
  END IF;
  IF p_attendance_status IS NULL OR p_attendance_status NOT IN ('ABSENT', 'SICK', 'LEAVE', 'OFF') THEN
    RAISE EXCEPTION 'Status ketidakhadiran tidak valid.';
  END IF;
  IF p_branch_id IS NULL OR (
    v_role = 'BRANCH_ADMIN'
    AND (
      public.get_user_branch_id() IS NULL
      OR p_branch_id::TEXT <> public.get_user_branch_id()::TEXT
    )
  ) THEN
    RAISE EXCEPTION 'Tidak memiliki akses ke cabang yang dipilih.';
  END IF;

  SELECT * INTO v_staff FROM public.staff WHERE id = p_staff_id;
  IF NOT FOUND OR NOT v_staff.active OR v_staff.employment_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Data staf tidak aktif atau tidak ditemukan.';
  END IF;
  IF v_role = 'BRANCH_ADMIN' AND v_staff.position <> 'DOCTOR'
     AND v_staff.branch_id::TEXT <> p_branch_id::TEXT THEN
    RAISE EXCEPTION 'Staf tidak terdaftar pada cabang ini.';
  END IF;

  IF v_staff.position = 'DOCTOR' THEN
    SELECT ds.start_time, ds.end_time INTO v_start_time, v_end_time
    FROM public.dental_doctors dd
    JOIN public.doctor_schedules ds ON ds.doctor_id = dd.id
    WHERE dd.staff_id = p_staff_id
      AND ds.branch_id = p_branch_id
      AND ds.date = p_date
      AND ds.status = 'ACTIVE'
    ORDER BY ds.start_time
    LIMIT 1;
  ELSE
    SELECT ws.start_time, ws.end_time INTO v_start_time, v_end_time
    FROM public.staff_shift_assignments ssa
    JOIN public.work_shifts ws ON ws.id = ssa.shift_id AND ws.active = true
    WHERE ssa.staff_id = p_staff_id
      AND ssa.branch_id = p_branch_id
      AND ssa.date = p_date
      AND ssa.active = true
    ORDER BY ws.start_time
    LIMIT 1;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_staff_id::TEXT), hashtext(p_date::TEXT));
  IF EXISTS (
    SELECT 1 FROM public.attendances WHERE staff_id = p_staff_id AND date = p_date
  ) THEN
    RAISE EXCEPTION 'Staf sudah memiliki catatan absensi pada tanggal ini.';
  END IF;

  INSERT INTO public.attendances (
    staff_id, branch_id, date, attendance_status,
    scheduled_start_at, scheduled_end_at, notes, created_by, updated_by
  )
  VALUES (
    p_staff_id, p_branch_id, p_date, p_attendance_status,
    COALESCE(v_start_time, '-'), COALESCE(v_end_time, '-'),
    NULLIF(TRIM(p_notes), ''), auth.uid()::TEXT, auth.uid()::TEXT
  )
  RETURNING * INTO v_record;

  RETURN v_record;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_self_attendance_location(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_staff_attendance_check_in(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_staff_attendance_check_out(UUID, UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_staff_absence(UUID, UUID, DATE, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_staff_attendance_check_in(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_staff_attendance_check_out(UUID, UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_staff_absence(UUID, UUID, DATE, TEXT, TEXT) TO authenticated;

DROP POLICY IF EXISTS "Attendance evidence upload own staff" ON storage.objects;
CREATE POLICY "Attendance evidence upload own staff" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attendance-evidence'
    AND (storage.foldername(name))[2] = public.get_user_staff_id()::TEXT
    AND (
      (storage.foldername(name))[1] = public.get_user_branch_id()::TEXT
      OR (
        public.get_user_role() = 'DOCTOR'
        AND EXISTS (
          SELECT 1
          FROM public.dental_doctors dd
          JOIN public.doctor_schedules ds ON ds.doctor_id = dd.id
          WHERE dd.staff_id = public.get_user_staff_id()
            AND ds.branch_id::TEXT = (storage.foldername(name))[1]
            AND ds.date = (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE
            AND ds.status = 'ACTIVE'
        )
      )
    )
  );

DROP POLICY IF EXISTS "Attendance evidence read own or branch" ON storage.objects;
CREATE POLICY "Attendance evidence read own or branch" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attendance-evidence'
    AND (
      public.is_super_admin()
      OR (
        (storage.foldername(name))[2] = public.get_user_staff_id()::TEXT
        AND (
          (storage.foldername(name))[1] = public.get_user_branch_id()::TEXT
          OR (
            public.get_user_role() = 'DOCTOR'
            AND EXISTS (
              SELECT 1
              FROM public.dental_doctors dd
              JOIN public.doctor_schedules ds ON ds.doctor_id = dd.id
              WHERE dd.staff_id = public.get_user_staff_id()
                AND ds.branch_id::TEXT = (storage.foldername(name))[1]
                AND ds.date = (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE
                AND ds.status = 'ACTIVE'
            )
          )
        )
      )
      OR (
        public.get_user_role() = 'BRANCH_ADMIN'
        AND (storage.foldername(name))[1] = public.get_user_branch_id()::TEXT
      )
    )
  );

DROP POLICY IF EXISTS "Attendance evidence delete own staff" ON storage.objects;
CREATE POLICY "Attendance evidence delete own staff" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'attendance-evidence'
    AND (storage.foldername(name))[2] = public.get_user_staff_id()::TEXT
    AND (
      (storage.foldername(name))[1] = public.get_user_branch_id()::TEXT
      OR (
        public.get_user_role() = 'DOCTOR'
        AND EXISTS (
          SELECT 1
          FROM public.dental_doctors dd
          JOIN public.doctor_schedules ds ON ds.doctor_id = dd.id
          WHERE dd.staff_id = public.get_user_staff_id()
            AND ds.branch_id::TEXT = (storage.foldername(name))[1]
            AND ds.date = (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE
            AND ds.status = 'ACTIVE'
        )
      )
    )
  );
