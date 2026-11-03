ALTER TABLE public.staff_absence_requests
  ADD COLUMN IF NOT EXISTS proposed_replacement_staff_id UUID
    REFERENCES public.staff(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS replacement_response_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK (replacement_response_status IN ('NOT_REQUIRED', 'PENDING', 'ACCEPTED', 'DECLINED')),
  ADD COLUMN IF NOT EXISTS replacement_responded_by UUID
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS replacement_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replacement_selection_finalized BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Employee absence request read" ON public.staff_absence_requests;
CREATE POLICY "Employee absence request read"
  ON public.staff_absence_requests FOR SELECT TO authenticated
  USING (
    staff_id = public.get_user_staff_id()
    OR proposed_replacement_staff_id = public.get_user_staff_id()
    OR public.is_super_admin()
  );

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
  v_requester public.staff;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesi login diperlukan.'; END IF;
  IF public.get_user_role() NOT IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT') THEN
    RAISE EXCEPTION 'Role akun ini tidak dapat memilih pengganti.';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Rentang tanggal pengajuan tidak valid.';
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
          FROM public.dental_doctors absent_doctor
          JOIN public.doctor_schedules absent_schedule
            ON absent_schedule.doctor_id = absent_doctor.id
           AND absent_schedule.status = 'ACTIVE'
           AND absent_schedule.date BETWEEN p_start_date AND p_end_date
          WHERE absent_doctor.staff_id = v_requester.id
            AND absent_doctor.active
        )
        AND EXISTS (
          SELECT 1
          FROM public.dental_doctors candidate_doctor
          WHERE candidate_doctor.staff_id = candidate.id
            AND candidate_doctor.active
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.dental_doctors absent_doctor
          JOIN public.doctor_schedules absent_schedule
            ON absent_schedule.doctor_id = absent_doctor.id
           AND absent_schedule.status = 'ACTIVE'
           AND absent_schedule.date BETWEEN p_start_date AND p_end_date
          JOIN public.dental_doctors candidate_doctor
            ON candidate_doctor.staff_id = candidate.id
           AND candidate_doctor.active
          JOIN public.doctor_schedules candidate_schedule
            ON candidate_schedule.doctor_id = candidate_doctor.id
           AND candidate_schedule.date = absent_schedule.date
           AND candidate_schedule.status = 'ACTIVE'
          WHERE absent_doctor.staff_id = v_requester.id
            AND absent_doctor.active
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.dental_doctors absent_doctor
          JOIN public.doctor_schedules absent_schedule
            ON absent_schedule.doctor_id = absent_doctor.id
           AND absent_schedule.status = 'ACTIVE'
           AND absent_schedule.date BETWEEN p_start_date AND p_end_date
          WHERE absent_doctor.staff_id = v_requester.id
            AND absent_doctor.active
            AND (
              EXISTS (
                SELECT 1 FROM public.attendances attendance
                WHERE attendance.staff_id = candidate.id
                  AND attendance.date = absent_schedule.date
              )
              OR EXISTS (
                SELECT 1 FROM public.staff_replacement_assignments assignment
                WHERE assignment.replacement_staff_id = candidate.id
                  AND assignment.covered_date = absent_schedule.date
              )
            )
        )
      )
      OR
      (
        v_requester.position IN ('BRANCH_ADMIN', 'ASSISTANT')
        AND candidate.branch_id = v_requester.branch_id
        AND EXISTS (
          SELECT 1
          FROM public.staff_shift_assignments absent_assignment
          WHERE absent_assignment.staff_id = v_requester.id
            AND absent_assignment.active
            AND absent_assignment.date BETWEEN p_start_date AND p_end_date
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.staff_shift_assignments absent_assignment
          JOIN public.staff_shift_assignments candidate_assignment
            ON candidate_assignment.staff_id = candidate.id
           AND candidate_assignment.date = absent_assignment.date
           AND candidate_assignment.active
          WHERE absent_assignment.staff_id = v_requester.id
            AND absent_assignment.active
            AND absent_assignment.date BETWEEN p_start_date AND p_end_date
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.staff_shift_assignments absent_assignment
          WHERE absent_assignment.staff_id = v_requester.id
            AND absent_assignment.active
            AND absent_assignment.date BETWEEN p_start_date AND p_end_date
            AND (
              EXISTS (
                SELECT 1 FROM public.attendances attendance
                WHERE attendance.staff_id = candidate.id
                  AND attendance.date = absent_assignment.date
              )
              OR EXISTS (
                SELECT 1 FROM public.staff_replacement_assignments assignment
                WHERE assignment.replacement_staff_id = candidate.id
                  AND assignment.covered_date = absent_assignment.date
              )
            )
        )
      )
    )
  ORDER BY candidate.full_name;
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
  SELECT * INTO v_staff
  FROM public.staff
  WHERE id = v_staff_id AND active AND employment_status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Data pegawai aktif tidak ditemukan.'; END IF;

  IF p_replacement_staff_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.get_absence_replacement_candidates(p_start_date, p_end_date) candidate
    WHERE candidate.staff_id = p_replacement_staff_id
  ) THEN
    RAISE EXCEPTION 'Pengganti harus pegawai aktif dengan jabatan dan ketersediaan yang sesuai.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.staff_absence_requests request
    WHERE request.staff_id = v_staff_id
      AND request.status IN ('PENDING', 'APPROVED')
      AND daterange(request.start_date, request.end_date, '[]')
        && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'Rentang tanggal bertumpang tindih dengan pengajuan yang masih menunggu atau sudah disetujui.';
  END IF;

  INSERT INTO public.staff_absence_requests (
    staff_id, request_type, start_date, end_date, reason,
    proposed_replacement_staff_id, replacement_response_status, replacement_selection_finalized
  ) VALUES (
    v_staff_id, p_request_type, p_start_date, p_end_date, trim(p_reason),
    p_replacement_staff_id,
    CASE WHEN p_replacement_staff_id IS NULL THEN 'NOT_REQUIRED' ELSE 'PENDING' END,
    true
  )
  RETURNING * INTO v_request;
  RETURN v_request;
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
BEGIN
  RETURN public.submit_staff_absence_request_with_replacement(
    p_request_type, p_start_date, p_end_date, p_reason, NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_staff_absence_replacement_inbox()
RETURNS TABLE(
  request_id UUID,
  requester_name TEXT,
  request_type TEXT,
  start_date DATE,
  end_date DATE,
  reason TEXT,
  replacement_response_status TEXT,
  replacement_responded_at TIMESTAMPTZ
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
    request.replacement_response_status, request.replacement_responded_at
  FROM public.staff_absence_requests request
  JOIN public.staff requester ON requester.id = request.staff_id
  WHERE request.proposed_replacement_staff_id = v_staff_id
    AND request.status = 'PENDING'
  ORDER BY request.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_staff_absence_replacement(
  p_request_id UUID,
  p_accept BOOLEAN
)
RETURNS public.staff_absence_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.staff_absence_requests;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesi login diperlukan.'; END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Pilihan persetujuan tidak valid.'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff recipient
    WHERE recipient.id = public.get_user_staff_id()
      AND recipient.active
      AND recipient.employment_status = 'ACTIVE'
      AND recipient.position IN ('DOCTOR', 'BRANCH_ADMIN', 'ASSISTANT')
  ) THEN
    RAISE EXCEPTION 'Data pegawai penerima tidak aktif atau tidak ditemukan.';
  END IF;

  UPDATE public.staff_absence_requests
  SET replacement_response_status = CASE WHEN p_accept THEN 'ACCEPTED' ELSE 'DECLINED' END,
      replacement_responded_by = auth.uid(),
      replacement_responded_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE id = p_request_id
    AND status = 'PENDING'
    AND proposed_replacement_staff_id = public.get_user_staff_id()
    AND replacement_response_status = 'PENDING'
  RETURNING * INTO v_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permintaan pengganti tidak ditemukan atau sudah ditanggapi.';
  END IF;
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_absence_replacement_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.staff_absence_requests;
BEGIN
  SELECT * INTO v_request
  FROM public.staff_absence_requests
  WHERE id = NEW.absence_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pengajuan ketidakhadiran tidak ditemukan.'; END IF;

  IF v_request.replacement_selection_finalized THEN
    IF v_request.proposed_replacement_staff_id IS NULL THEN
      RAISE EXCEPTION 'Pemohon tidak memilih pengganti pada pengajuan ini.';
    END IF;
    IF NEW.replacement_staff_id IS DISTINCT FROM v_request.proposed_replacement_staff_id THEN
      RAISE EXCEPTION 'Penugasan harus menggunakan pengganti yang dipilih pemohon.';
    END IF;
    IF v_request.replacement_response_status <> 'ACCEPTED' THEN
      RAISE EXCEPTION 'Pengganti belum menyetujui penugasan.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_staff_replacement_consent ON public.staff_replacement_assignments;
CREATE TRIGGER guard_staff_replacement_consent
  BEFORE INSERT OR UPDATE OF absence_request_id, replacement_staff_id
  ON public.staff_replacement_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_absence_replacement_consent();

CREATE OR REPLACE FUNCTION public.guard_absence_external_replacement_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.staff_absence_requests;
BEGIN
  SELECT * INTO v_request
  FROM public.staff_absence_requests
  WHERE id = NEW.absence_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pengajuan ketidakhadiran tidak ditemukan.'; END IF;
  IF v_request.replacement_selection_finalized THEN
    RAISE EXCEPTION 'Pengajuan baru hanya dapat menggunakan pengganti yang dipilih dan menyetujui melalui portal.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_external_replacement_consent ON public.external_doctor_replacement_assignments;
CREATE TRIGGER guard_external_replacement_consent
  BEFORE INSERT OR UPDATE OF absence_request_id
  ON public.external_doctor_replacement_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_absence_external_replacement_consent();

CREATE OR REPLACE FUNCTION public.verify_absence_replacement_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'APPROVED'
    AND NEW.replacement_selection_finalized
    AND NEW.proposed_replacement_staff_id IS NOT NULL
  THEN
    IF NEW.replacement_response_status <> 'ACCEPTED' THEN
      RAISE EXCEPTION 'Pengganti harus menyetujui sebelum pengajuan dapat disetujui.';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.staff_replacement_assignments assignment
      WHERE assignment.absence_request_id = NEW.id
        AND assignment.replacement_staff_id = NEW.proposed_replacement_staff_id
    ) THEN
      RAISE EXCEPTION 'Penugasan pengganti yang dipilih tidak tercatat.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS verify_absence_replacement_consent ON public.staff_absence_requests;
CREATE CONSTRAINT TRIGGER verify_absence_replacement_consent
  AFTER UPDATE ON public.staff_absence_requests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.status = 'APPROVED' AND NEW.replacement_selection_finalized
    AND NEW.proposed_replacement_staff_id IS NOT NULL)
  EXECUTE FUNCTION public.verify_absence_replacement_consent();

REVOKE ALL ON FUNCTION public.get_absence_replacement_candidates(DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_staff_absence_request_with_replacement(TEXT, DATE, DATE, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_staff_absence_replacement_inbox() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_to_staff_absence_replacement(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_absence_replacement_candidates(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_staff_absence_request_with_replacement(TEXT, DATE, DATE, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_absence_replacement_inbox() TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_staff_absence_replacement(UUID, BOOLEAN) TO authenticated;
