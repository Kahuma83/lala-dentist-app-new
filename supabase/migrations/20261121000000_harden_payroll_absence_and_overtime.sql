ALTER TABLE public.overtime_records
  ADD COLUMN IF NOT EXISTS approved_overtime_minutes INT
    CHECK (approved_overtime_minutes IS NULL OR approved_overtime_minutes >= 0),
  ADD COLUMN IF NOT EXISTS is_national_holiday BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Employee portal overtime management" ON public.overtime_records;
DROP POLICY IF EXISTS "Employee portal overtime insert" ON public.overtime_records;
CREATE POLICY "Employee portal overtime insert"
  ON public.overtime_records
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Employee portal overtime submission" ON public.overtime_records;
CREATE POLICY "Employee portal overtime submission"
  ON public.overtime_records
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
      AND status = 'DETECTED'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
      AND status = 'SUBMITTED'
      AND approved_overtime_minutes IS NULL
      AND overtime_amount_snapshot IS NULL
      AND hourly_rate_snapshot IS NULL
      AND calculation_method IS NULL
      AND is_national_holiday = false
      AND approved_by IS NULL
      AND approved_at IS NULL
      AND rejected_by IS NULL
      AND rejected_at IS NULL
      AND rejection_reason IS NULL
    )
  );

DROP POLICY IF EXISTS "Employee portal overtime deletion" ON public.overtime_records;
CREATE POLICY "Employee portal overtime deletion"
  ON public.overtime_records
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.guard_overtime_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF public.get_user_role() IS DISTINCT FROM 'BRANCH_ADMIN'
    OR OLD.status <> 'DETECTED'
    OR NEW.status <> 'SUBMITTED'
    OR (to_jsonb(NEW) - ARRAY['status', 'updated_at', 'updated_by'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'updated_at', 'updated_by']) THEN
    RAISE EXCEPTION 'Branch Admin hanya dapat mengajukan lembur tanpa mengubah data atau tarif.';
  END IF;

  NEW.updated_by := auth.uid()::TEXT;
  NEW.updated_at := timezone('utc'::TEXT, now());
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_overtime_submission() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_overtime_submission ON public.overtime_records;
CREATE TRIGGER guard_overtime_submission
  BEFORE UPDATE ON public.overtime_records
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_overtime_submission();

CREATE OR REPLACE FUNCTION public.detect_overtime_from_attendance(p_attendance_id UUID)
RETURNS SETOF public.overtime_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attendance public.attendances;
  v_staff_position TEXT;
  v_existing public.overtime_records;
  v_scheduled_end TIMESTAMPTZ;
  v_overtime_minutes INT;
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.is_super_admin()
    AND public.get_user_role() IS DISTINCT FROM 'BRANCH_ADMIN'
  ) THEN
    RAISE EXCEPTION 'Hanya Admin Cabang atau Super Admin yang dapat mendeteksi lembur.';
  END IF;

  SELECT * INTO v_attendance
  FROM public.attendances
  WHERE id = p_attendance_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan absensi tidak ditemukan.'; END IF;

  IF NOT public.is_super_admin()
    AND (
      public.get_user_branch_id() IS NULL
      OR v_attendance.branch_id::TEXT <> public.get_user_branch_id()::TEXT
    ) THEN
    RAISE EXCEPTION 'Branch Admin hanya dapat mendeteksi lembur cabang sendiri.';
  END IF;
  IF v_attendance.attendance_status NOT IN ('PRESENT', 'LATE')
    OR v_attendance.actual_check_out_at IS NULL
    OR v_attendance.scheduled_end_at IS NULL
    OR v_attendance.scheduled_end_at IN ('', '-') THEN
    RETURN;
  END IF;

  SELECT position INTO v_staff_position
  FROM public.staff
  WHERE id = v_attendance.staff_id;
  IF v_staff_position IS NULL OR v_staff_position NOT IN ('BRANCH_ADMIN', 'ASSISTANT') THEN RETURN; END IF;

  SELECT * INTO v_existing
  FROM public.overtime_records
  WHERE attendance_id = v_attendance.id
  LIMIT 1;
  IF FOUND THEN
    RETURN NEXT v_existing;
    RETURN;
  END IF;

  v_scheduled_end := (v_attendance.date + v_attendance.scheduled_end_at::TIME)
    AT TIME ZONE 'Asia/Jakarta';
  v_overtime_minutes := GREATEST(
    0,
    FLOOR(EXTRACT(EPOCH FROM (v_attendance.actual_check_out_at - v_scheduled_end)) / 60)::INT
  );
  IF v_overtime_minutes <= 0 THEN RETURN; END IF;

  RETURN QUERY
  INSERT INTO public.overtime_records (
    staff_id, branch_id, attendance_id, date, scheduled_end_at, actual_end_at,
    overtime_minutes, overtime_hours, overtime_type, status, created_by, updated_by
  ) VALUES (
    v_attendance.staff_id,
    v_attendance.branch_id,
    v_attendance.id,
    v_attendance.date,
    LEFT(v_attendance.scheduled_end_at, 5),
    TO_CHAR(v_attendance.actual_check_out_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI'),
    v_overtime_minutes,
    ROUND(v_overtime_minutes::NUMERIC / 60, 2),
    'AFTER_SHIFT',
    'DETECTED',
    auth.uid()::TEXT,
    auth.uid()::TEXT
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_overtime_from_attendance(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detect_overtime_from_attendance(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_staff_absence_request(
  p_request_id UUID,
  p_approve BOOLEAN,
  p_reviewer_note TEXT DEFAULT NULL,
  p_replacement_staff_id UUID DEFAULT NULL
)
RETURNS public.staff_absence_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.staff_absence_requests;
  v_absent_staff public.staff;
  v_replacement public.staff;
  v_day DATE;
  v_branch_id UUID;
  v_shift_id UUID;
  v_start_time VARCHAR(10);
  v_end_time VARCHAR(10);
  v_base_salary NUMERIC;
  v_daily_amount BIGINT;
  v_attendance_status TEXT;
  v_existing_attendance_status TEXT;
  v_scheduled_days INT := 0;
  v_schedule RECORD;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat memproses pengajuan ketidakhadiran.';
  END IF;
  IF NOT p_approve AND length(trim(COALESCE(p_reviewer_note, ''))) < 3 THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi.';
  END IF;

  SELECT * INTO v_request
  FROM public.staff_absence_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Pengajuan tidak ditemukan atau sudah diproses.';
  END IF;
  SELECT * INTO v_absent_staff FROM public.staff WHERE id = v_request.staff_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Data pegawai pemohon tidak ditemukan.'; END IF;

  IF p_approve THEN
    IF p_replacement_staff_id IS NOT NULL THEN
      SELECT * INTO v_replacement
      FROM public.staff
      WHERE id = p_replacement_staff_id
        AND active
        AND employment_status = 'ACTIVE'
        AND position = v_absent_staff.position
        AND position IN ('BRANCH_ADMIN', 'ASSISTANT');
      IF NOT FOUND OR p_replacement_staff_id = v_absent_staff.id THEN
        RAISE EXCEPTION 'Pengganti harus pegawai aktif dengan jabatan yang sama (Admin Cabang atau Asisten).';
      END IF;
    END IF;

    v_attendance_status := CASE WHEN v_request.request_type = 'SICK' THEN 'SICK' ELSE 'LEAVE' END;
    FOR v_day IN SELECT generate_series(v_request.start_date, v_request.end_date, interval '1 day')::date LOOP
      PERFORM pg_advisory_xact_lock(hashtext(v_absent_staff.id::TEXT), hashtext(v_day::TEXT));

      FOR v_schedule IN
        SELECT ds.branch_id, NULL::UUID AS shift_id, ds.start_time, ds.end_time
        FROM public.dental_doctors dd
        JOIN public.doctor_schedules ds ON ds.doctor_id = dd.id
        WHERE v_absent_staff.position = 'DOCTOR'
          AND dd.staff_id = v_absent_staff.id
          AND ds.date = v_day
          AND ds.status = 'ACTIVE'
        UNION ALL
        (
          SELECT ssa.branch_id, ssa.shift_id, ws.start_time, ws.end_time
          FROM public.staff_shift_assignments ssa
          JOIN public.work_shifts ws ON ws.id = ssa.shift_id AND ws.active
          WHERE v_absent_staff.position <> 'DOCTOR'
            AND ssa.staff_id = v_absent_staff.id
            AND ssa.date = v_day
            AND ssa.active
          ORDER BY ws.start_time
          LIMIT 1
        )
      LOOP
        v_scheduled_days := v_scheduled_days + 1;
        v_branch_id := v_schedule.branch_id;
        v_shift_id := v_schedule.shift_id;
        v_start_time := v_schedule.start_time;
        v_end_time := v_schedule.end_time;

        IF EXISTS (
          SELECT 1 FROM public.monthly_payrolls
          WHERE staff_id = v_absent_staff.id
            AND month = EXTRACT(MONTH FROM v_day)::INT
            AND year = EXTRACT(YEAR FROM v_day)::INT
            AND status <> 'DRAFT'
        ) THEN
          RAISE EXCEPTION 'Payroll pegawai untuk periode tanggal % sudah dikunci; pengajuan tidak dapat disetujui.', v_day;
        END IF;

        SELECT attendance_status INTO v_existing_attendance_status
        FROM public.attendances
        WHERE staff_id = v_absent_staff.id
          AND branch_id = v_branch_id
          AND date = v_day
        FOR UPDATE;
        IF FOUND THEN
          IF v_existing_attendance_status IS DISTINCT FROM v_attendance_status THEN
            RAISE EXCEPTION 'Tanggal % di cabang % sudah memiliki status absensi yang berbeda.', v_day, v_branch_id;
          END IF;
        ELSE
          INSERT INTO public.attendances (
            staff_id, branch_id, date, attendance_status, scheduled_start_at,
            scheduled_end_at, notes, created_by, updated_by
          ) VALUES (
            v_absent_staff.id, v_branch_id, v_day, v_attendance_status,
            COALESCE(v_start_time, '-'), COALESCE(v_end_time, '-'),
            format('Pengajuan %s disetujui (%s)', v_request.request_type, v_request.id),
            auth.uid()::TEXT, auth.uid()::TEXT
          );
        END IF;

        IF p_replacement_staff_id IS NOT NULL THEN
          IF v_branch_id <> v_replacement.branch_id THEN
            RAISE EXCEPTION 'Pengganti harus terdaftar di cabang yang sama pada tanggal %.', v_day;
          END IF;
          IF EXISTS (
            SELECT 1 FROM public.attendances
            WHERE staff_id = v_replacement.id AND date = v_day
          ) OR EXISTS (
            SELECT 1 FROM public.staff_shift_assignments
            WHERE staff_id = v_replacement.id AND date = v_day AND active
          ) OR EXISTS (
            SELECT 1 FROM public.staff_replacement_assignments
            WHERE replacement_staff_id = v_replacement.id AND covered_date = v_day
          ) THEN
            RAISE EXCEPTION 'Pengganti sudah memiliki jadwal atau penugasan pada tanggal %.', v_day;
          END IF;
          IF EXISTS (
            SELECT 1 FROM public.monthly_payrolls
            WHERE staff_id = v_replacement.id
              AND month = EXTRACT(MONTH FROM v_day)::INT
              AND year = EXTRACT(YEAR FROM v_day)::INT
              AND status <> 'DRAFT'
          ) THEN
            RAISE EXCEPTION 'Payroll pengganti untuk periode tanggal % sudah dikunci; penugasan berbayar tidak dapat ditambahkan.', v_day;
          END IF;

          SELECT value_snapshot INTO v_base_salary
          FROM public.staff_compensation_rules
          WHERE staff_id = v_absent_staff.id
            AND rule_type_snapshot = 'BASE_SALARY'
            AND is_active
            AND (effective_start_date IS NULL OR effective_start_date <= v_day)
            AND (effective_end_date IS NULL OR effective_end_date >= v_day)
            AND (branch_id IS NULL OR branch_id = v_branch_id)
          ORDER BY (branch_id IS NOT NULL) DESC, effective_start_date DESC NULLS LAST, updated_at DESC
          LIMIT 1;
          IF v_base_salary IS NULL THEN
            RAISE EXCEPTION 'Gaji pokok pegawai yang digantikan belum ditetapkan untuk tanggal %.', v_day;
          END IF;
          v_daily_amount := round(v_base_salary / 25)::BIGINT;

          INSERT INTO public.staff_replacement_assignments (
            absence_request_id, covered_date, branch_id, shift_id, absent_staff_id,
            replacement_staff_id, absent_base_salary_snapshot, amount_snapshot
          ) VALUES (
            v_request.id, v_day, v_branch_id, v_shift_id, v_absent_staff.id,
            v_replacement.id, round(v_base_salary)::BIGINT, v_daily_amount
          );
        END IF;
      END LOOP;
    END LOOP;

    IF v_scheduled_days = 0 THEN
      RAISE EXCEPTION 'Tidak ditemukan jadwal kerja aktif pada rentang tanggal pengajuan.';
    END IF;
  END IF;

  UPDATE public.staff_absence_requests
  SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
      reviewer_note = NULLIF(trim(COALESCE(p_reviewer_note, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE id = v_request.id
  RETURNING * INTO v_request;
  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.review_staff_absence_request(UUID, BOOLEAN, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_staff_absence_request(UUID, BOOLEAN, TEXT, UUID) TO authenticated;
