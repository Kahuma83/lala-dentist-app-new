BEGIN;

CREATE TABLE IF NOT EXISTS public.treatment_visit_assistant_assignments (
  visit_id UUID PRIMARY KEY REFERENCES public.patient_visits(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE CASCADE,
  assistant_staff_id UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
  confirmed_by UUID NULL REFERENCES public.user_accounts(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treatment_visit_assistant_branch
  ON public.treatment_visit_assistant_assignments(branch_id);

ALTER TABLE public.treatment_visit_assistant_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Treatment visit assistant read access"
  ON public.treatment_visit_assistant_assignments;
CREATE POLICY "Treatment visit assistant read access"
  ON public.treatment_visit_assistant_assignments
  FOR SELECT
  TO authenticated
  USING (public.user_can_manage_treatment_branch(branch_id));

REVOKE ALL ON public.treatment_visit_assistant_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.treatment_visit_assistant_assignments TO authenticated;

INSERT INTO public.treatment_visit_assistant_assignments (visit_id, branch_id, assistant_staff_id, confirmed_at)
SELECT DISTINCT ON (job.visit_id)
  job.visit_id,
  job.branch_id,
  job.pic_assistant_id,
  COALESCE(job.started_at, job.created_at, now())
FROM public.treatment_jobs job
WHERE job.started_at IS NOT NULL
   OR job.status NOT IN ('BELUM_DIMULAI', 'DIBATALKAN')
ORDER BY job.visit_id, COALESCE(job.started_at, job.created_at), job.created_at
ON CONFLICT (visit_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.assign_treatment_visit_assistant(
  p_visit_id UUID,
  p_assistant_staff_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visit public.patient_visits%ROWTYPE;
  v_user public.user_accounts%ROWTYPE;
  v_assignment public.treatment_visit_assistant_assignments%ROWTYPE;
  v_has_started_treatment BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Hanya dokter yang dapat menetapkan asisten kunjungan.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_user
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid() AND active = true;

  IF NOT FOUND OR v_user.role <> 'DOCTOR' THEN
    RAISE EXCEPTION 'Hanya dokter yang dapat menetapkan asisten kunjungan.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_visit
  FROM public.patient_visits
  WHERE id = p_visit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kunjungan tidak ditemukan.';
  END IF;
  IF NOT public.user_can_manage_treatment_branch(v_visit.branch_id) THEN
    RAISE EXCEPTION 'Dokter tidak memiliki akses ke cabang kunjungan ini.'
      USING ERRCODE = '42501';
  END IF;

  IF p_assistant_staff_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.staff assistant
    WHERE assistant.id = p_assistant_staff_id
      AND assistant.position = 'ASSISTANT'
      AND assistant.employment_status = 'ACTIVE'
      AND assistant.active = true
      AND (
        assistant.branch_id = v_visit.branch_id
        OR EXISTS (
          SELECT 1
          FROM public.staff_shift_assignments assignment
          WHERE assignment.staff_id = assistant.id
            AND assignment.branch_id = v_visit.branch_id
            AND assignment.date = (v_visit.visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE
            AND assignment.active = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'Asisten yang dipilih tidak aktif, bukan Asisten, atau tidak ditugaskan di cabang kunjungan.';
  END IF;

  SELECT * INTO v_assignment
  FROM public.treatment_visit_assistant_assignments
  WHERE visit_id = p_visit_id
  FOR UPDATE;

  SELECT EXISTS (
    SELECT 1 FROM public.treatment_jobs job
    WHERE job.visit_id = p_visit_id
      AND (
        job.started_at IS NOT NULL
        OR job.status NOT IN ('BELUM_DIMULAI', 'DIBATALKAN')
      )
  ) INTO v_has_started_treatment;

  IF v_has_started_treatment AND EXISTS (
    SELECT 1 FROM public.treatment_jobs job
    WHERE job.visit_id = p_visit_id
      AND (
        job.started_at IS NOT NULL
        OR job.status NOT IN ('BELUM_DIMULAI', 'DIBATALKAN')
      )
      AND job.pic_assistant_id IS DISTINCT FROM p_assistant_staff_id
  ) THEN
    RAISE EXCEPTION 'Asisten kunjungan sudah terkunci saat tindakan dimulai.';
  END IF;
  IF v_has_started_treatment THEN
    IF v_assignment.visit_id IS NOT NULL
       AND v_assignment.assistant_staff_id IS DISTINCT FROM p_assistant_staff_id THEN
      RAISE EXCEPTION 'Asisten kunjungan sudah terkunci saat tindakan dimulai.';
    END IF;
  END IF;

  INSERT INTO public.treatment_visit_assistant_assignments (
    visit_id, branch_id, assistant_staff_id, confirmed_by, confirmed_at, updated_at
  ) VALUES (
    p_visit_id, v_visit.branch_id, p_assistant_staff_id, v_user.id, now(), now()
  )
  ON CONFLICT (visit_id) DO UPDATE SET
    assistant_staff_id = EXCLUDED.assistant_staff_id,
    confirmed_by = EXCLUDED.confirmed_by,
    confirmed_at = EXCLUDED.confirmed_at,
    updated_at = EXCLUDED.updated_at;

  UPDATE public.treatment_jobs
  SET pic_assistant_id = p_assistant_staff_id,
      updated_at = now()
  WHERE visit_id = p_visit_id
    AND status <> 'DIBATALKAN';
END;
$$;

REVOKE ALL ON FUNCTION public.assign_treatment_visit_assistant(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_treatment_visit_assistant(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.inherit_queue_assistant_on_treatment_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
  v_assignment_exists BOOLEAN;
BEGIN
  SELECT assignment.assistant_staff_id, TRUE
  INTO v_staff_id, v_assignment_exists
  FROM public.treatment_visit_assistant_assignments assignment
  WHERE assignment.visit_id = NEW.visit_id;

  IF v_assignment_exists THEN
    NEW.pic_assistant_id := v_staff_id;
  ELSIF NEW.pic_assistant_id IS NULL THEN
    SELECT queue.assistant_staff_id
    INTO v_staff_id
    FROM public.queue_items queue
    WHERE queue.visit_id = NEW.visit_id
      AND queue.assistant_staff_id IS NOT NULL
    ORDER BY queue.assistant_claimed_at DESC NULLS LAST, queue.created_at DESC
    LIMIT 1;
    NEW.pic_assistant_id := v_staff_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS treatment_jobs_inherit_queue_assistant ON public.treatment_jobs;
CREATE TRIGGER treatment_jobs_inherit_queue_assistant
  BEFORE INSERT ON public.treatment_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_queue_assistant_on_treatment_job();

CREATE OR REPLACE FUNCTION public.prevent_queue_assistant_after_doctor_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.assistant_staff_id IS DISTINCT FROM OLD.assistant_staff_id
     AND NEW.assistant_staff_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.treatment_visit_assistant_assignments assignment
       WHERE assignment.visit_id = NEW.visit_id
     ) THEN
    RAISE EXCEPTION 'Asisten PIC kunjungan sudah dikonfirmasi oleh Dokter.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_items_respect_doctor_assistant_confirmation ON public.queue_items;
CREATE TRIGGER queue_items_respect_doctor_assistant_confirmation
  BEFORE UPDATE OF assistant_staff_id ON public.queue_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_queue_assistant_after_doctor_confirmation();

NOTIFY pgrst, 'reload schema';
COMMIT;
