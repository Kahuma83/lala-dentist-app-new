CREATE TABLE IF NOT EXISTS public.staff_absence_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  request_type TEXT NOT NULL CHECK (request_type IN ('SICK', 'LEAVE', 'PERMISSION')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 2000),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewer_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_absence_requests_staff_dates
  ON public.staff_absence_requests(staff_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_staff_absence_requests_status
  ON public.staff_absence_requests(status, created_at);

CREATE TABLE IF NOT EXISTS public.staff_replacement_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  absence_request_id UUID NOT NULL REFERENCES public.staff_absence_requests(id) ON DELETE RESTRICT,
  covered_date DATE NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  shift_id UUID REFERENCES public.work_shifts(id) ON DELETE RESTRICT,
  absent_staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  replacement_staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  absent_base_salary_snapshot BIGINT NOT NULL CHECK (absent_base_salary_snapshot >= 0),
  amount_snapshot BIGINT NOT NULL CHECK (amount_snapshot >= 0),
  work_confirmed_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  work_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CHECK (absent_staff_id <> replacement_staff_id),
  UNIQUE (absence_request_id, covered_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_replacement_payroll
  ON public.staff_replacement_assignments(replacement_staff_id, covered_date)
  WHERE work_confirmed_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_replacement_unique_worker_date
  ON public.staff_replacement_assignments(replacement_staff_id, covered_date);

ALTER TABLE public.staff_absence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_replacement_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.staff_absence_requests, public.staff_replacement_assignments FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.staff_absence_requests, public.staff_replacement_assignments TO authenticated;

DROP POLICY IF EXISTS "Employee absence request read" ON public.staff_absence_requests;
CREATE POLICY "Employee absence request read"
  ON public.staff_absence_requests FOR SELECT TO authenticated
  USING (staff_id = public.get_user_staff_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Employee replacement assignment read" ON public.staff_replacement_assignments;
CREATE POLICY "Employee replacement assignment read"
  ON public.staff_replacement_assignments FOR SELECT TO authenticated
  USING (
    absent_staff_id = public.get_user_staff_id()
    OR replacement_staff_id = public.get_user_staff_id()
    OR public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id = public.get_user_branch_id()
    )
  );

CREATE OR REPLACE FUNCTION public.submit_staff_absence_request(
  p_request_type TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_reason TEXT
)
RETURNS public.staff_absence_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
  v_staff public.staff;
  v_request public.staff_absence_requests;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesi login diperlukan.'; END IF;
  IF public.get_user_role() NOT IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT', 'OB') THEN
    RAISE EXCEPTION 'Hanya akun pegawai yang dapat mengajukan ketidakhadiran.';
  END IF;
  IF p_request_type NOT IN ('SICK', 'LEAVE', 'PERMISSION') THEN
    RAISE EXCEPTION 'Jenis pengajuan ketidakhadiran tidak valid.';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Rentang tanggal pengajuan tidak valid.';
  END IF;
  IF length(trim(COALESCE(p_reason, ''))) < 3 OR length(trim(p_reason)) > 2000 THEN
    RAISE EXCEPTION 'Alasan wajib diisi (3 sampai 2000 karakter).';
  END IF;

  v_staff_id := public.get_user_staff_id();
  SELECT * INTO v_staff FROM public.staff WHERE id = v_staff_id AND active AND employment_status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Data pegawai aktif tidak ditemukan.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.staff_absence_requests r
    WHERE r.staff_id = v_staff_id
      AND r.status IN ('PENDING', 'APPROVED')
      AND daterange(r.start_date, r.end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'Rentang tanggal bertumpang tindih dengan pengajuan yang masih menunggu atau sudah disetujui.';
  END IF;

  INSERT INTO public.staff_absence_requests (staff_id, request_type, start_date, end_date, reason)
  VALUES (v_staff_id, p_request_type, p_start_date, p_end_date, trim(p_reason))
  RETURNING * INTO v_request;
  RETURN v_request;
END;
$$;

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
  v_scheduled_days INT := 0;
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
      v_branch_id := NULL;
      v_shift_id := NULL;
      v_start_time := NULL;
      v_end_time := NULL;

      IF v_absent_staff.position = 'DOCTOR' THEN
        SELECT ds.branch_id, ds.start_time, ds.end_time
        INTO v_branch_id, v_start_time, v_end_time
        FROM public.dental_doctors dd
        JOIN public.doctor_schedules ds ON ds.doctor_id = dd.id
        WHERE dd.staff_id = v_absent_staff.id AND ds.date = v_day AND ds.status = 'ACTIVE'
        ORDER BY ds.start_time
        LIMIT 1;
      ELSE
        SELECT ssa.branch_id, ssa.shift_id, ws.start_time, ws.end_time
        INTO v_branch_id, v_shift_id, v_start_time, v_end_time
        FROM public.staff_shift_assignments ssa
        JOIN public.work_shifts ws ON ws.id = ssa.shift_id AND ws.active
        WHERE ssa.staff_id = v_absent_staff.id AND ssa.date = v_day AND ssa.active
        ORDER BY ws.start_time
        LIMIT 1;
      END IF;

      IF v_branch_id IS NULL THEN CONTINUE; END IF;
      v_scheduled_days := v_scheduled_days + 1;
      PERFORM pg_advisory_xact_lock(hashtext(v_absent_staff.id::TEXT), hashtext(v_day::TEXT));
      IF EXISTS (SELECT 1 FROM public.attendances WHERE staff_id = v_absent_staff.id AND date = v_day) THEN
        RAISE EXCEPTION 'Tanggal % sudah memiliki catatan absensi; pengajuan tidak dapat disetujui.', v_day;
      END IF;

      INSERT INTO public.attendances (
        staff_id, branch_id, date, attendance_status, scheduled_start_at,
        scheduled_end_at, notes, created_by, updated_by
      ) VALUES (
        v_absent_staff.id, v_branch_id, v_day, v_attendance_status,
        COALESCE(v_start_time, '-'), COALESCE(v_end_time, '-'),
        format('Pengajuan %s disetujui (%s)', v_request.request_type, v_request.id),
        auth.uid()::TEXT, auth.uid()::TEXT
      );

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

CREATE OR REPLACE FUNCTION public.confirm_staff_replacement_work(p_assignment_id UUID)
RETURNS public.staff_replacement_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignment public.staff_replacement_assignments;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat mengonfirmasi pekerjaan pengganti.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.staff_replacement_assignments assignment
    JOIN public.monthly_payrolls payroll
      ON payroll.staff_id = assignment.replacement_staff_id
     AND payroll.month = EXTRACT(MONTH FROM assignment.covered_date)::INT
     AND payroll.year = EXTRACT(YEAR FROM assignment.covered_date)::INT
    WHERE assignment.id = p_assignment_id
      AND payroll.status <> 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'Payroll periode tugas ini sudah dikunci. Koreksi payroll harus diselesaikan sebelum pekerjaan dikonfirmasi.';
  END IF;
  UPDATE public.staff_replacement_assignments
  SET work_confirmed_by = auth.uid(),
      work_confirmed_at = timezone('utc'::text, now())
  WHERE id = p_assignment_id AND work_confirmed_at IS NULL
  RETURNING * INTO v_assignment;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Penugasan tidak ditemukan atau sudah dikonfirmasi.';
  END IF;
  RETURN v_assignment;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_staff_absence_request(TEXT, DATE, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_staff_absence_request(UUID, BOOLEAN, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_staff_replacement_work(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_staff_absence_request(TEXT, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_staff_absence_request(UUID, BOOLEAN, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_staff_replacement_work(UUID) TO authenticated;
