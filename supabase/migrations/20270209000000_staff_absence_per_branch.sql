ALTER TABLE public.staff_absence_requests
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.dental_branches(id) ON DELETE RESTRICT;

WITH request_branches AS (
  SELECT request.id AS request_id, schedules.branch_id
  FROM public.staff_absence_requests request
  JOIN public.staff absent_staff ON absent_staff.id = request.staff_id
  JOIN public.dental_doctors doctor ON doctor.staff_id = absent_staff.id AND doctor.active
  JOIN public.doctor_schedules schedules
    ON schedules.doctor_id = doctor.id
   AND schedules.status = 'ACTIVE'
   AND schedules.date BETWEEN request.start_date AND request.end_date
  WHERE absent_staff.position = 'DOCTOR'
  UNION
  SELECT request.id, assignments.branch_id
  FROM public.staff_absence_requests request
  JOIN public.staff absent_staff ON absent_staff.id = request.staff_id
  JOIN public.staff_shift_assignments assignments
    ON assignments.staff_id = absent_staff.id
   AND assignments.active
   AND assignments.date BETWEEN request.start_date AND request.end_date
  WHERE absent_staff.position <> 'DOCTOR'
  UNION
  SELECT request.id, replacement_assignment.branch_id
  FROM public.staff_absence_requests request
  JOIN public.staff_replacement_assignments replacement_assignment
    ON replacement_assignment.absence_request_id = request.id
  UNION
  SELECT request.id, replacement_assignment.branch_id
  FROM public.staff_absence_requests request
  JOIN public.external_doctor_replacement_assignments replacement_assignment
    ON replacement_assignment.absence_request_id = request.id
  UNION
  SELECT request.id, attendance.branch_id
  FROM public.staff_absence_requests request
  JOIN public.attendances attendance
    ON attendance.staff_id = request.staff_id
   AND attendance.date BETWEEN request.start_date AND request.end_date
   AND attendance.notes = format(
     'Pengajuan %s disetujui (%s)',
     request.request_type,
     request.id
   )
),
unambiguous_branches AS (
  SELECT request_id, min(branch_id::TEXT)::UUID AS branch_id
  FROM request_branches
  GROUP BY request_id
  HAVING count(DISTINCT branch_id) = 1
)
UPDATE public.staff_absence_requests request
SET branch_id = unambiguous_branches.branch_id
FROM unambiguous_branches
WHERE request.id = unambiguous_branches.request_id
  AND request.branch_id IS NULL;

CREATE OR REPLACE FUNCTION public.require_absence_request_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'Cabang cuti/izin wajib ditentukan.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS require_absence_request_branch ON public.staff_absence_requests;
CREATE TRIGGER require_absence_request_branch
  BEFORE INSERT ON public.staff_absence_requests
  FOR EACH ROW EXECUTE FUNCTION public.require_absence_request_branch();

CREATE OR REPLACE FUNCTION public.resolve_own_absence_request_branch(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
  v_position TEXT;
  v_branch_id UUID;
  v_branch_count INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesi login diperlukan.'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Rentang tanggal pengajuan tidak valid.';
  END IF;
  v_staff_id := public.get_user_staff_id();
  SELECT position INTO v_position
  FROM public.staff
  WHERE id = v_staff_id AND active AND employment_status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Data pegawai aktif tidak ditemukan.'; END IF;

  IF v_position = 'DOCTOR' THEN
    SELECT count(DISTINCT schedules.branch_id), min(schedules.branch_id::TEXT)::UUID
    INTO v_branch_count, v_branch_id
    FROM public.dental_doctors doctor
    JOIN public.doctor_schedules schedules
      ON schedules.doctor_id = doctor.id
     AND schedules.status = 'ACTIVE'
     AND schedules.date BETWEEN p_start_date AND p_end_date
    WHERE doctor.staff_id = v_staff_id AND doctor.active;
  ELSE
    SELECT count(DISTINCT assignments.branch_id), min(assignments.branch_id::TEXT)::UUID
    INTO v_branch_count, v_branch_id
    FROM public.staff_shift_assignments assignments
    WHERE assignments.staff_id = v_staff_id
      AND assignments.active
      AND assignments.date BETWEEN p_start_date AND p_end_date;
  END IF;

  IF v_branch_count = 0 THEN
    RAISE EXCEPTION 'Tidak ditemukan jadwal aktif pada rentang tanggal pengajuan.';
  ELSIF v_branch_count > 1 THEN
    RAISE EXCEPTION 'Pilih satu cabang untuk pengajuan cuti/izin ini.';
  END IF;
  RETURN v_branch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_absence_request_branches(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(branch_id UUID, branch_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
  v_position TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesi login diperlukan.'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Rentang tanggal pengajuan tidak valid.';
  END IF;

  v_staff_id := public.get_user_staff_id();
  SELECT staff.position INTO v_position
  FROM public.staff
  WHERE staff.id = v_staff_id
    AND staff.active
    AND staff.employment_status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Data pegawai aktif tidak ditemukan.'; END IF;
  IF public.get_user_role() NOT IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT', 'OB') THEN
    RAISE EXCEPTION 'Role akun ini tidak dapat mengajukan ketidakhadiran.';
  END IF;
  IF (v_position = 'DOCTOR' AND public.get_user_role() <> 'DOCTOR')
    OR (v_position = 'BRANCH_ADMIN' AND public.get_user_role() <> 'BRANCH_ADMIN')
    OR (v_position = 'ASSISTANT' AND public.get_user_role() <> 'DOCTOR_ASSISTANT')
  THEN
    RAISE EXCEPTION 'Role akun tidak sesuai dengan jabatan pegawai.';
  END IF;

  RETURN QUERY
  SELECT branches.id, branches.name::TEXT
  FROM public.dental_branches branches
  WHERE (
    v_position = 'DOCTOR'
    AND EXISTS (
      SELECT 1
      FROM public.dental_doctors doctor
      JOIN public.doctor_schedules schedules
        ON schedules.doctor_id = doctor.id
       AND schedules.branch_id = branches.id
       AND schedules.status = 'ACTIVE'
       AND schedules.date BETWEEN p_start_date AND p_end_date
      WHERE doctor.staff_id = v_staff_id AND doctor.active
    )
  ) OR (
    v_position <> 'DOCTOR'
    AND EXISTS (
      SELECT 1
      FROM public.staff_shift_assignments assignments
      WHERE assignments.staff_id = v_staff_id
        AND assignments.branch_id = branches.id
        AND assignments.active
        AND assignments.date BETWEEN p_start_date AND p_end_date
    )
  )
  ORDER BY branches.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_absence_replacement_candidates(
  p_branch_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(staff_id UUID, full_name TEXT, staff_position TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_requester public.staff;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesi login diperlukan.'; END IF;
  IF public.get_user_role() NOT IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT') THEN
    RAISE EXCEPTION 'Role akun ini tidak dapat memilih pengganti.';
  END IF;
  IF p_branch_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Cabang atau rentang tanggal pengajuan tidak valid.';
  END IF;

  SELECT * INTO v_requester
  FROM public.staff
  WHERE id = public.get_user_staff_id()
    AND active
    AND employment_status = 'ACTIVE';
  IF NOT FOUND
    OR v_requester.position NOT IN ('DOCTOR', 'BRANCH_ADMIN', 'ASSISTANT')
    OR (v_requester.position = 'DOCTOR' AND public.get_user_role() <> 'DOCTOR')
    OR (v_requester.position = 'BRANCH_ADMIN' AND public.get_user_role() <> 'BRANCH_ADMIN')
    OR (v_requester.position = 'ASSISTANT' AND public.get_user_role() <> 'DOCTOR_ASSISTANT')
  THEN
    RAISE EXCEPTION 'Data pegawai aktif atau jabatan yang didukung tidak ditemukan.';
  END IF;

  IF v_requester.position = 'DOCTOR' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.dental_doctors doctor
      JOIN public.doctor_schedules schedules
        ON schedules.doctor_id = doctor.id
       AND schedules.branch_id = p_branch_id
       AND schedules.status = 'ACTIVE'
       AND schedules.date BETWEEN p_start_date AND p_end_date
      WHERE doctor.staff_id = v_requester.id AND doctor.active
    ) THEN
      RAISE EXCEPTION 'Tidak ada jadwal aktif dokter di cabang yang dipilih pada rentang tanggal tersebut.';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.staff_shift_assignments assignments
    WHERE assignments.staff_id = v_requester.id
      AND assignments.branch_id = p_branch_id
      AND assignments.active
      AND assignments.date BETWEEN p_start_date AND p_end_date
  ) THEN
    RAISE EXCEPTION 'Tidak ada jadwal aktif pegawai di cabang yang dipilih pada rentang tanggal tersebut.';
  END IF;

  RETURN QUERY
  SELECT candidate.id, candidate.full_name::TEXT, candidate.position::TEXT
  FROM public.staff candidate
  WHERE candidate.id <> v_requester.id
    AND candidate.active
    AND candidate.employment_status = 'ACTIVE'
    AND candidate.position = v_requester.position
    AND EXISTS (
      SELECT 1
      FROM public.user_accounts candidate_account
      WHERE candidate_account.id = candidate.user_account_id
        AND candidate_account.active
        AND candidate_account.auth_user_id IS NOT NULL
        AND (
          (candidate.position = 'DOCTOR' AND candidate_account.role = 'DOCTOR')
          OR (candidate.position = 'BRANCH_ADMIN' AND candidate_account.role = 'BRANCH_ADMIN')
          OR (candidate.position = 'ASSISTANT' AND candidate_account.role = 'DOCTOR_ASSISTANT')
        )
    )
    AND (
      (
        v_requester.position = 'DOCTOR'
        AND EXISTS (
          SELECT 1
          FROM public.dental_doctors candidate_doctor
          WHERE candidate_doctor.staff_id = candidate.id
            AND candidate_doctor.active
            AND (
              candidate_doctor.assigned_branch_id = p_branch_id
              OR EXISTS (
                SELECT 1 FROM public.doctor_branch_assignments branch_assignment
                WHERE branch_assignment.doctor_id = candidate_doctor.id
                  AND branch_assignment.branch_id = p_branch_id
                  AND branch_assignment.active
                  AND branch_assignment.start_date <= p_end_date
                  AND (branch_assignment.end_date IS NULL OR branch_assignment.end_date >= p_start_date)
              )
              OR EXISTS (
                SELECT 1 FROM public.doctor_schedules candidate_schedule
                WHERE candidate_schedule.doctor_id = candidate_doctor.id
                  AND candidate_schedule.branch_id = p_branch_id
                  AND candidate_schedule.status = 'ACTIVE'
                  AND candidate_schedule.date BETWEEN p_start_date AND p_end_date
              )
            )
        )
      )
      OR
      (
        v_requester.position IN ('BRANCH_ADMIN', 'ASSISTANT')
        AND candidate.branch_id = p_branch_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.staff_shift_assignments absent_assignment
          JOIN public.staff_shift_assignments candidate_assignment
            ON candidate_assignment.staff_id = candidate.id
           AND candidate_assignment.branch_id = p_branch_id
           AND candidate_assignment.date = absent_assignment.date
           AND candidate_assignment.active
          WHERE absent_assignment.staff_id = v_requester.id
            AND absent_assignment.branch_id = p_branch_id
            AND absent_assignment.active
            AND absent_assignment.date BETWEEN p_start_date AND p_end_date
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.staff_shift_assignments absent_assignment
          WHERE absent_assignment.staff_id = v_requester.id
            AND absent_assignment.branch_id = p_branch_id
            AND absent_assignment.active
            AND absent_assignment.date BETWEEN p_start_date AND p_end_date
            AND (
              EXISTS (
                SELECT 1 FROM public.attendances attendance
                WHERE attendance.staff_id = candidate.id
                  AND attendance.branch_id = p_branch_id
                  AND attendance.date = absent_assignment.date
              )
              OR EXISTS (
                SELECT 1 FROM public.staff_replacement_assignments assignment
                WHERE assignment.replacement_staff_id = candidate.id
                  AND assignment.branch_id = p_branch_id
                  AND assignment.covered_date = absent_assignment.date
              )
            )
        )
      )
    )
  ORDER BY candidate.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_absence_replacement_candidates(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(staff_id UUID, full_name TEXT, staff_position TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_branch_id UUID;
BEGIN
  v_branch_id := public.resolve_own_absence_request_branch(p_start_date, p_end_date);
  RETURN QUERY
  SELECT candidates.staff_id, candidates.full_name, candidates.staff_position
  FROM public.get_absence_replacement_candidates(v_branch_id, p_start_date, p_end_date) candidates;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_staff_absence_request_with_replacement(
  p_request_type TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_reason TEXT,
  p_replacement_staff_id UUID,
  p_branch_id UUID
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
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'Cabang cuti/izin wajib dipilih.'; END IF;
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
  SELECT * INTO v_staff
  FROM public.staff
  WHERE id = v_staff_id AND active AND employment_status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Data pegawai aktif tidak ditemukan.'; END IF;

  IF (v_staff.position = 'DOCTOR' AND public.get_user_role() <> 'DOCTOR')
    OR (v_staff.position = 'BRANCH_ADMIN' AND public.get_user_role() <> 'BRANCH_ADMIN')
    OR (v_staff.position = 'ASSISTANT' AND public.get_user_role() <> 'DOCTOR_ASSISTANT')
  THEN
    RAISE EXCEPTION 'Role akun tidak sesuai dengan jabatan pegawai.';
  END IF;

  IF v_staff.position = 'DOCTOR' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.dental_doctors doctor
      JOIN public.doctor_schedules schedules
        ON schedules.doctor_id = doctor.id
       AND schedules.branch_id = p_branch_id
       AND schedules.status = 'ACTIVE'
       AND schedules.date BETWEEN p_start_date AND p_end_date
      WHERE doctor.staff_id = v_staff_id AND doctor.active
    ) THEN
      RAISE EXCEPTION 'Tidak ada jadwal aktif dokter di cabang yang dipilih pada rentang tanggal tersebut.';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.staff_shift_assignments assignments
    WHERE assignments.staff_id = v_staff_id
      AND assignments.branch_id = p_branch_id
      AND assignments.active
      AND assignments.date BETWEEN p_start_date AND p_end_date
  ) THEN
    RAISE EXCEPTION 'Tidak ada jadwal aktif pegawai di cabang yang dipilih pada rentang tanggal tersebut.';
  END IF;

  IF p_replacement_staff_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.get_absence_replacement_candidates(p_branch_id, p_start_date, p_end_date) candidate
    WHERE candidate.staff_id = p_replacement_staff_id
  ) THEN
    RAISE EXCEPTION 'Pengganti harus pegawai aktif dengan jabatan, cabang, dan ketersediaan yang sesuai.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff_absence_requests request
    WHERE request.staff_id = v_staff_id
      AND (request.branch_id = p_branch_id OR request.branch_id IS NULL)
      AND request.status IN ('PENDING', 'APPROVED')
      AND daterange(request.start_date, request.end_date, '[]')
        && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'Rentang tanggal bertumpang tindih dengan pengajuan di cabang ini atau pengajuan lama yang cabangnya belum dapat dipastikan.';
  END IF;

  INSERT INTO public.staff_absence_requests (
    staff_id, branch_id, request_type, start_date, end_date, reason,
    proposed_replacement_staff_id, replacement_response_status, replacement_selection_finalized
  ) VALUES (
    v_staff_id, p_branch_id, p_request_type, p_start_date, p_end_date, trim(p_reason),
    p_replacement_staff_id,
    CASE WHEN p_replacement_staff_id IS NULL THEN 'NOT_REQUIRED' ELSE 'PENDING' END,
    true
  )
  RETURNING * INTO v_request;
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_staff_absence_request_with_replacement(
  p_request_type TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_reason TEXT,
  p_replacement_staff_id UUID DEFAULT NULL
)
RETURNS public.staff_absence_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_branch_id UUID;
BEGIN
  v_branch_id := public.resolve_own_absence_request_branch(p_start_date, p_end_date);
  RETURN public.submit_staff_absence_request_with_replacement(
    p_request_type, p_start_date, p_end_date, p_reason, p_replacement_staff_id, v_branch_id
  );
END;
$$;

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
  v_branch_id UUID;
BEGIN
  v_branch_id := public.resolve_own_absence_request_branch(p_start_date, p_end_date);
  RETURN public.submit_staff_absence_request_with_replacement(
    p_request_type, p_start_date, p_end_date, p_reason, NULL, v_branch_id
  );
END;
$$;

DROP FUNCTION IF EXISTS public.get_staff_absence_replacement_inbox();
CREATE FUNCTION public.get_staff_absence_replacement_inbox()
RETURNS TABLE(
  request_id UUID,
  requester_name TEXT,
  request_type TEXT,
  start_date DATE,
  end_date DATE,
  reason TEXT,
  replacement_response_status TEXT,
  replacement_responded_at TIMESTAMPTZ,
  branch_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesi login diperlukan.'; END IF;
  v_staff_id := public.get_user_staff_id();
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'Akun belum terhubung ke data staf.'; END IF;

  RETURN QUERY
  SELECT request.id, requester.full_name::TEXT, request.request_type,
    request.start_date, request.end_date, request.reason,
    request.replacement_response_status, request.replacement_responded_at, request.branch_id
  FROM public.staff_absence_requests request
  JOIN public.staff requester ON requester.id = request.staff_id
  WHERE request.proposed_replacement_staff_id = v_staff_id
    AND request.status = 'PENDING'
  ORDER BY request.created_at DESC;
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
  IF p_approve AND v_request.branch_id IS NULL THEN
    RAISE EXCEPTION 'Cabang pengajuan lama belum dapat dipastikan; tentukan cabang sebelum menyetujui.';
  END IF;

  IF p_approve THEN
    IF p_replacement_staff_id IS NOT NULL THEN
      SELECT * INTO v_replacement
      FROM public.staff
      WHERE id = p_replacement_staff_id
        AND active
        AND employment_status = 'ACTIVE'
        AND position = v_absent_staff.position
        AND position IN ('BRANCH_ADMIN', 'ASSISTANT')
        AND branch_id = v_request.branch_id;
      IF NOT FOUND OR p_replacement_staff_id = v_absent_staff.id THEN
        RAISE EXCEPTION 'Pengganti harus pegawai aktif dengan jabatan dan cabang yang sama.';
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
          AND ds.branch_id = v_request.branch_id
          AND ds.date = v_day
          AND ds.status = 'ACTIVE'
        UNION ALL
        (
          SELECT ssa.branch_id, ssa.shift_id, ws.start_time, ws.end_time
          FROM public.staff_shift_assignments ssa
          JOIN public.work_shifts ws ON ws.id = ssa.shift_id AND ws.active
          WHERE v_absent_staff.position <> 'DOCTOR'
            AND ssa.staff_id = v_absent_staff.id
            AND ssa.branch_id = v_request.branch_id
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
            WHERE staff_id = v_replacement.id AND branch_id = v_branch_id AND date = v_day
          ) OR EXISTS (
            SELECT 1 FROM public.staff_shift_assignments
            WHERE staff_id = v_replacement.id AND branch_id = v_branch_id AND date = v_day AND active
          ) OR EXISTS (
            SELECT 1 FROM public.staff_replacement_assignments
            WHERE replacement_staff_id = v_replacement.id AND branch_id = v_branch_id AND covered_date = v_day
          ) THEN
            RAISE EXCEPTION 'Pengganti sudah memiliki jadwal atau penugasan di cabang ini pada tanggal %.', v_day;
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
      RAISE EXCEPTION 'Tidak ditemukan jadwal kerja aktif di cabang pengajuan pada rentang tanggal tersebut.';
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

CREATE OR REPLACE FUNCTION public.assign_staff_absence_request_branch(
  p_request_id UUID,
  p_branch_id UUID
)
RETURNS public.staff_absence_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.staff_absence_requests;
  v_staff public.staff;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat menetapkan cabang pengajuan lama.';
  END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'Cabang pengajuan wajib dipilih.'; END IF;

  SELECT * INTO v_request
  FROM public.staff_absence_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Pengajuan tidak ditemukan atau sudah diproses.';
  END IF;
  IF v_request.branch_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cabang pengajuan sudah ditetapkan.';
  END IF;

  SELECT * INTO v_staff FROM public.staff WHERE id = v_request.staff_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Data pegawai pemohon tidak ditemukan.'; END IF;

  IF v_staff.position = 'DOCTOR' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.dental_doctors doctor
      JOIN public.doctor_schedules schedules
        ON schedules.doctor_id = doctor.id
       AND schedules.branch_id = p_branch_id
       AND schedules.status = 'ACTIVE'
       AND schedules.date BETWEEN v_request.start_date AND v_request.end_date
      WHERE doctor.staff_id = v_staff.id AND doctor.active
    ) THEN
      RAISE EXCEPTION 'Tidak ditemukan jadwal dokter di cabang pilihan pada rentang pengajuan.';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.staff_shift_assignments assignments
    WHERE assignments.staff_id = v_staff.id
      AND assignments.branch_id = p_branch_id
      AND assignments.active
      AND assignments.date BETWEEN v_request.start_date AND v_request.end_date
  ) THEN
    RAISE EXCEPTION 'Tidak ditemukan jadwal pegawai di cabang pilihan pada rentang pengajuan.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.staff_absence_requests existing
    WHERE existing.id <> v_request.id
      AND existing.staff_id = v_staff.id
      AND (existing.branch_id = p_branch_id OR existing.branch_id IS NULL)
      AND existing.status IN ('PENDING', 'APPROVED')
      AND daterange(existing.start_date, existing.end_date, '[]')
        && daterange(v_request.start_date, v_request.end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'Pengajuan bertumpang tindih dengan permintaan lain di cabang pilihan.';
  END IF;

  IF v_request.proposed_replacement_staff_id IS NOT NULL THEN
    IF v_staff.position = 'DOCTOR' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.dental_doctors replacement_doctor
        WHERE replacement_doctor.staff_id = v_request.proposed_replacement_staff_id
          AND replacement_doctor.active
          AND (
            replacement_doctor.assigned_branch_id = p_branch_id
            OR EXISTS (
              SELECT 1 FROM public.doctor_branch_assignments branch_assignment
              WHERE branch_assignment.doctor_id = replacement_doctor.id
                AND branch_assignment.branch_id = p_branch_id
                AND branch_assignment.active
                AND branch_assignment.start_date <= v_request.end_date
                AND (branch_assignment.end_date IS NULL OR branch_assignment.end_date >= v_request.start_date)
            )
            OR EXISTS (
              SELECT 1 FROM public.doctor_schedules replacement_schedule
              WHERE replacement_schedule.doctor_id = replacement_doctor.id
                AND replacement_schedule.branch_id = p_branch_id
                AND replacement_schedule.status = 'ACTIVE'
                AND replacement_schedule.date BETWEEN v_request.start_date AND v_request.end_date
            )
          )
      ) THEN
        RAISE EXCEPTION 'Calon pengganti yang sudah dipilih tidak sesuai dengan cabang pilihan.';
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.staff replacement_staff
      WHERE replacement_staff.id = v_request.proposed_replacement_staff_id
        AND replacement_staff.branch_id = p_branch_id
        AND replacement_staff.position = v_staff.position
        AND replacement_staff.active
        AND replacement_staff.employment_status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'Calon pengganti yang sudah dipilih tidak sesuai dengan cabang pilihan.';
    END IF;
  END IF;

  UPDATE public.staff_absence_requests
  SET branch_id = p_branch_id,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_request.id
  RETURNING * INTO v_request;
  RETURN v_request;
END;
$$;

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
    'AND absent_schedule.date BETWEEN v_request.start_date AND v_request.end_date',
    'AND absent_schedule.date BETWEEN v_request.start_date AND v_request.end_date' || E'\n            AND (v_request.branch_id IS NULL OR absent_schedule.branch_id = v_request.branch_id)'
  );
  v_updated_definition := replace(
    v_updated_definition,
    'AND ds.date BETWEEN v_request.start_date AND v_request.end_date',
    'AND ds.date BETWEEN v_request.start_date AND v_request.end_date' || E'\n      AND (v_request.branch_id IS NULL OR ds.branch_id = v_request.branch_id)'
  );
  v_updated_definition := replace(
    v_updated_definition,
    'ON candidate_schedule.date = absent_schedule.date',
    'ON candidate_schedule.date = absent_schedule.date' || E'\n           AND candidate_schedule.branch_id = absent_schedule.branch_id'
  );
  v_updated_definition := replace(
    v_updated_definition,
    '  IF p_external_doctor_id IS NOT NULL THEN' || E'\n    SELECT * INTO v_external_doctor',
    '  IF p_replacement_doctor_id IS NOT NULL AND v_request.branch_id IS NOT NULL AND NOT EXISTS (' || E'\n    SELECT 1 FROM public.dental_doctors replacement_doctor' || E'\n    WHERE replacement_doctor.id = p_replacement_doctor_id' || E'\n      AND (' || E'\n        replacement_doctor.assigned_branch_id = v_request.branch_id' || E'\n        OR EXISTS (' || E'\n          SELECT 1 FROM public.doctor_branch_assignments branch_assignment' || E'\n          WHERE branch_assignment.doctor_id = replacement_doctor.id' || E'\n            AND branch_assignment.branch_id = v_request.branch_id' || E'\n            AND branch_assignment.active' || E'\n            AND branch_assignment.start_date <= v_request.end_date' || E'\n            AND (branch_assignment.end_date IS NULL OR branch_assignment.end_date >= v_request.start_date)' || E'\n        )' || E'\n        OR EXISTS (' || E'\n          SELECT 1 FROM public.doctor_schedules replacement_schedule' || E'\n          WHERE replacement_schedule.doctor_id = replacement_doctor.id' || E'\n            AND replacement_schedule.branch_id = v_request.branch_id' || E'\n            AND replacement_schedule.status = ''ACTIVE''' || E'\n            AND replacement_schedule.date BETWEEN v_request.start_date AND v_request.end_date' || E'\n        )' || E'\n      )' || E'\n  ) THEN' || E'\n    RAISE EXCEPTION ''Dokter pengganti tidak terdaftar untuk cabang pengajuan.'';' || E'\n  END IF;' || E'\n' ||
    '  IF p_external_doctor_id IS NOT NULL THEN' || E'\n    SELECT * INTO v_external_doctor'
  );

  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'Tidak dapat menerapkan filter cabang pada review_doctor_absence_request.';
  END IF;
  EXECUTE v_updated_definition;
END;
$$;

DO $$
DECLARE
  v_definition TEXT;
  v_updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.guard_absence_replacement_consent()'::regprocedure
  ) INTO v_definition;
  v_updated_definition := replace(
    v_definition,
    '  IF v_request.replacement_selection_finalized THEN',
    '  IF v_request.branch_id IS NOT NULL AND NEW.branch_id IS DISTINCT FROM v_request.branch_id THEN' || E'\n    RAISE EXCEPTION ''Penugasan pengganti harus berada di cabang yang sama dengan pengajuan.'';' || E'\n  END IF;' || E'\n  IF v_request.replacement_selection_finalized THEN'
  );
  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'Tidak dapat menerapkan validasi cabang pada guard_absence_replacement_consent.';
  END IF;
  EXECUTE v_updated_definition;
END;
$$;

DO $$
DECLARE
  v_definition TEXT;
  v_updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.guard_absence_external_replacement_consent()'::regprocedure
  ) INTO v_definition;
  v_updated_definition := replace(
    v_definition,
    '  IF v_request.replacement_selection_finalized THEN',
    '  IF v_request.branch_id IS NOT NULL AND NEW.branch_id IS DISTINCT FROM v_request.branch_id THEN' || E'\n    RAISE EXCEPTION ''Penugasan dokter eksternal harus berada di cabang yang sama dengan pengajuan.'';' || E'\n  END IF;' || E'\n  IF v_request.replacement_selection_finalized THEN'
  );
  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'Tidak dapat menerapkan validasi cabang pada guard_absence_external_replacement_consent.';
  END IF;
  EXECUTE v_updated_definition;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_own_absence_request_branch(DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.require_absence_request_branch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_absence_request_branches(DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_absence_replacement_candidates(UUID, DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_absence_replacement_candidates(DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_staff_absence_request_with_replacement(TEXT, DATE, DATE, TEXT, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_staff_absence_request_with_replacement(TEXT, DATE, DATE, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_staff_absence_request(TEXT, DATE, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_staff_absence_request_branch(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_staff_absence_replacement_inbox() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_absence_request_branches(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_absence_replacement_candidates(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_absence_replacement_candidates(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_staff_absence_request_with_replacement(TEXT, DATE, DATE, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_staff_absence_request_with_replacement(TEXT, DATE, DATE, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_staff_absence_request(TEXT, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_staff_absence_request_branch(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_absence_replacement_inbox() TO authenticated;
