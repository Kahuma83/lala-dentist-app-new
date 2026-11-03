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
          FROM public.dental_doctors candidate_doctor
          WHERE candidate_doctor.staff_id = candidate.id
            AND candidate_doctor.active
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
    $conflict_check$
  IF p_approve AND p_replacement_doctor_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.doctor_schedules absent_schedule
    JOIN public.doctor_schedules replacement_schedule
      ON replacement_schedule.date = absent_schedule.date
     AND replacement_schedule.status = 'ACTIVE'
    WHERE absent_schedule.doctor_id = v_absent_doctor.id
      AND absent_schedule.status = 'ACTIVE'
      AND absent_schedule.date BETWEEN v_request.start_date AND v_request.end_date
      AND replacement_schedule.doctor_id = p_replacement_doctor_id
  ) THEN
    RAISE EXCEPTION 'Dokter internal yang dipilih sudah memiliki jadwal aktif pada salah satu tanggal penggantian.';
  END IF;
$conflict_check$,
    ''
  );

  IF v_updated_definition = v_definition THEN
    IF strpos(v_definition, 'Dokter internal yang dipilih sudah memiliki jadwal aktif') > 0 THEN
      RAISE EXCEPTION 'Tidak menemukan validasi bentrok jadwal dokter pada fungsi review.';
    END IF;
  ELSE
    EXECUTE v_updated_definition;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_absence_replacement_candidates(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_absence_replacement_candidates(DATE, DATE) TO authenticated;
