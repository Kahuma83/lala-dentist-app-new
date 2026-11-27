BEGIN;

CREATE TABLE IF NOT EXISTS public.treatment_pic_correction_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  previous_assistant_staff_id UUID REFERENCES public.staff(id) ON DELETE RESTRICT,
  new_assistant_staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  corrected_by UUID NOT NULL REFERENCES public.user_accounts(id) ON DELETE RESTRICT,
  auth_user_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 500),
  affected_treatment_count INTEGER NOT NULL CHECK (affected_treatment_count > 0),
  removed_accrual_count INTEGER NOT NULL CHECK (removed_accrual_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now())
);

ALTER TABLE public.treatment_pic_correction_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.treatment_pic_correction_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.treatment_pic_correction_audit TO authenticated;

DROP POLICY IF EXISTS "Super Admin reads treatment PIC correction audit"
  ON public.treatment_pic_correction_audit;
CREATE POLICY "Super Admin reads treatment PIC correction audit"
  ON public.treatment_pic_correction_audit
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.get_treatment_pic_staff_candidates()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  staff_position TEXT,
  employment_status TEXT,
  active BOOLEAN,
  branch_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR (NOT public.is_super_admin() AND public.get_user_role() IS DISTINCT FROM 'DOCTOR') THEN
    RAISE EXCEPTION 'Hanya Dokter atau Super Admin yang dapat memuat kandidat PIC tindakan.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    staff.id,
    staff.full_name::TEXT,
    staff.position::TEXT,
    staff.employment_status::TEXT,
    staff.active,
    staff.branch_id
  FROM public.staff staff
  WHERE staff.active = true
    AND staff.employment_status = 'ACTIVE'
    AND staff.position IN ('ASSISTANT', 'BRANCH_ADMIN')
    AND (
      public.is_super_admin()
      OR (
        (
          staff.branch_id IS NOT NULL
          AND public.user_can_manage_treatment_branch(staff.branch_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.staff_shift_assignments assignment
          WHERE assignment.staff_id = staff.id
            AND assignment.active = true
            AND public.user_can_manage_treatment_branch(assignment.branch_id)
        )
      )
    )
  ORDER BY staff.full_name, staff.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_treatment_pic_staff_candidates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_treatment_pic_staff_candidates() TO authenticated;

CREATE OR REPLACE FUNCTION public.correct_treatment_visit_assistant_pic(
  p_visit_id UUID,
  p_assistant_staff_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visit public.patient_visits%ROWTYPE;
  v_user public.user_accounts%ROWTYPE;
  v_assignment public.treatment_visit_assistant_assignments%ROWTYPE;
  v_previous_assistant_id UUID;
  v_job_ids UUID[];
  v_treatment_count INTEGER;
  v_distinct_pic_count INTEGER;
  v_removed_accrual_count INTEGER := 0;
  v_reason TEXT := btrim(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat mengoreksi PIC tindakan.'
      USING ERRCODE = '42501';
  END IF;
  IF p_visit_id IS NULL OR p_assistant_staff_id IS NULL THEN
    RAISE EXCEPTION 'Kunjungan dan PIC pengganti wajib dipilih.';
  END IF;
  IF char_length(v_reason) < 5 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Alasan koreksi PIC wajib diisi 5 sampai 500 karakter.';
  END IF;

  SELECT *
  INTO v_user
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid()
    AND active = true
    AND role = 'SUPER_ADMIN';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun Super Admin aktif tidak ditemukan.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_visit
  FROM public.patient_visits
  WHERE id = p_visit_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kunjungan tidak ditemukan.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.staff assistant
    WHERE assistant.id = p_assistant_staff_id
      AND assistant.position IN ('ASSISTANT', 'BRANCH_ADMIN')
      AND assistant.employment_status = 'ACTIVE'
      AND assistant.active = true
      AND (
        assistant.branch_id = v_visit.branch_id
        OR EXISTS (
          SELECT 1
          FROM public.staff_shift_assignments shift
          WHERE shift.staff_id = assistant.id
            AND shift.branch_id = v_visit.branch_id
            AND shift.date = (v_visit.visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE
            AND shift.active = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'PIC pengganti harus Asisten atau Admin Cabang aktif yang bertugas di cabang pada tanggal kunjungan.';
  END IF;

  PERFORM 1
  FROM public.treatment_visit_assistant_assignments assignment
  WHERE assignment.visit_id = p_visit_id
  FOR UPDATE;

  PERFORM 1
  FROM public.treatment_jobs job
  WHERE job.visit_id = p_visit_id
    AND job.status <> 'DIBATALKAN'
  FOR UPDATE;

  SELECT array_agg(job.id), COUNT(*)
  INTO v_job_ids, v_treatment_count
  FROM public.treatment_jobs job
  WHERE job.visit_id = p_visit_id
    AND job.status <> 'DIBATALKAN';
  IF COALESCE(v_treatment_count, 0) = 0 THEN
    RAISE EXCEPTION 'Tidak ada tindakan aktif pada kunjungan ini.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.treatment_jobs job
    WHERE job.visit_id = p_visit_id
      AND job.status IN ('SELESAI', 'DISERAHKAN')
  ) THEN
    RAISE EXCEPTION 'Koreksi PIC hanya tersedia setelah tindakan selesai atau diserahkan.';
  END IF;

  SELECT COUNT(DISTINCT job.pic_assistant_id)
  INTO v_distinct_pic_count
  FROM public.treatment_jobs job
  WHERE job.visit_id = p_visit_id
    AND job.status <> 'DIBATALKAN'
    AND job.pic_assistant_id IS NOT NULL;
  IF v_distinct_pic_count > 1 THEN
    RAISE EXCEPTION 'PIC tindakan pada kunjungan ini tidak konsisten; periksa data sebelum mengoreksi.';
  END IF;

  SELECT *
  INTO v_assignment
  FROM public.treatment_visit_assistant_assignments
  WHERE visit_id = p_visit_id;
  v_previous_assistant_id := v_assignment.assistant_staff_id;
  IF v_previous_assistant_id IS NULL THEN
    SELECT job.pic_assistant_id
    INTO v_previous_assistant_id
    FROM public.treatment_jobs job
    WHERE job.visit_id = p_visit_id
      AND job.status <> 'DIBATALKAN'
      AND job.pic_assistant_id IS NOT NULL
    ORDER BY job.created_at, job.id
    LIMIT 1;
  ELSIF EXISTS (
    SELECT 1
    FROM public.treatment_jobs job
    WHERE job.visit_id = p_visit_id
      AND job.status <> 'DIBATALKAN'
      AND job.pic_assistant_id IS NOT NULL
      AND job.pic_assistant_id <> v_previous_assistant_id
  ) THEN
    RAISE EXCEPTION 'PIC penugasan dan PIC tindakan tidak konsisten; periksa data sebelum mengoreksi.';
  END IF;

  IF v_previous_assistant_id = p_assistant_staff_id THEN
    RETURN jsonb_build_object(
      'visit_id', p_visit_id,
      'previous_assistant_staff_id', v_previous_assistant_id,
      'assistant_staff_id', p_assistant_staff_id,
      'updated_treatment_count', 0,
      'removed_accrual_count', 0
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.compensation_accruals accrual
    JOIN public.treatment_jobs job
      ON job.id::TEXT = accrual.source_id
    JOIN public.staff assistant
      ON assistant.id = accrual.staff_id
     AND assistant.position IN ('ASSISTANT', 'BRANCH_ADMIN')
    WHERE job.id = ANY(v_job_ids)
      AND accrual.rule_id_snapshot <> 'STAFF_VISIT_REFERRAL_RP3000_V1'
      AND (
        EXISTS (
          SELECT 1
          FROM public.payroll_items item
          WHERE item.source_id = accrual.id::TEXT
        )
        OR EXISTS (
          SELECT 1
          FROM public.journal_entries journal
          WHERE journal.source_type = 'COMPENSATION'
            AND journal.source_id = accrual.id::TEXT
        )
      )
  ) THEN
    RAISE EXCEPTION 'PIC tidak dapat dikoreksi karena insentif sudah masuk rincian payroll atau memiliki jurnal.';
  END IF;

  PERFORM 1
  FROM public.compensation_accruals accrual
  JOIN public.treatment_jobs job
    ON job.id::TEXT = accrual.source_id
  JOIN public.staff assistant
    ON assistant.id = accrual.staff_id
   AND assistant.position IN ('ASSISTANT', 'BRANCH_ADMIN')
  WHERE job.id = ANY(v_job_ids)
    AND accrual.rule_id_snapshot <> 'STAFF_VISIT_REFERRAL_RP3000_V1'
  FOR UPDATE OF accrual;

  DELETE FROM public.compensation_accruals accrual
  USING public.treatment_jobs job, public.staff assistant
  WHERE job.id::TEXT = accrual.source_id
    AND job.id = ANY(v_job_ids)
    AND assistant.id = accrual.staff_id
    AND assistant.position IN ('ASSISTANT', 'BRANCH_ADMIN')
    AND accrual.rule_id_snapshot <> 'STAFF_VISIT_REFERRAL_RP3000_V1';
  GET DIAGNOSTICS v_removed_accrual_count = ROW_COUNT;

  INSERT INTO public.treatment_visit_assistant_assignments (
    visit_id, branch_id, assistant_staff_id, confirmed_by, confirmed_at, updated_at
  ) VALUES (
    p_visit_id, v_visit.branch_id, p_assistant_staff_id, v_user.id, now(), now()
  )
  ON CONFLICT (visit_id) DO UPDATE SET
    branch_id = EXCLUDED.branch_id,
    assistant_staff_id = EXCLUDED.assistant_staff_id,
    confirmed_by = EXCLUDED.confirmed_by,
    confirmed_at = EXCLUDED.confirmed_at,
    updated_at = EXCLUDED.updated_at;

  UPDATE public.treatment_jobs
  SET pic_assistant_id = p_assistant_staff_id,
      updated_at = timezone('utc'::TEXT, now())
  WHERE visit_id = p_visit_id
    AND status <> 'DIBATALKAN';

  INSERT INTO public.treatment_pic_correction_audit (
    visit_id, branch_id, previous_assistant_staff_id, new_assistant_staff_id,
    corrected_by, auth_user_id, reason, affected_treatment_count, removed_accrual_count
  ) VALUES (
    p_visit_id, v_visit.branch_id, v_previous_assistant_id, p_assistant_staff_id,
    v_user.id, auth.uid(), v_reason, v_treatment_count, v_removed_accrual_count
  );

  RETURN jsonb_build_object(
    'visit_id', p_visit_id,
    'previous_assistant_staff_id', v_previous_assistant_id,
    'assistant_staff_id', p_assistant_staff_id,
    'updated_treatment_count', v_treatment_count,
    'removed_accrual_count', v_removed_accrual_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.correct_treatment_visit_assistant_pic(UUID, UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_treatment_visit_assistant_pic(UUID, UUID, TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.correct_treatment_visit_assistant_pic(UUID, UUID, TEXT) IS
  'Super Admin only: corrects a visit PIC before its treatment incentives are linked to payroll or journals, removes unposted assistant treatment accruals, and records an immutable audit row.';

NOTIFY pgrst, 'reload schema';

COMMIT;
