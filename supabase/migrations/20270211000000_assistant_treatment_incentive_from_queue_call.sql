BEGIN;

ALTER TABLE public.queue_items
  ADD COLUMN IF NOT EXISTS assistant_staff_id UUID REFERENCES public.staff(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS assistant_claimed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_queue_visit_as_assistant(p_queue_id UUID)
RETURNS public.queue_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_queue public.queue_items%ROWTYPE;
  v_staff_id UUID;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role() IS DISTINCT FROM 'DOCTOR_ASSISTANT' THEN
    RAISE EXCEPTION 'Hanya asisten yang dapat mencatat diri sebagai pendamping kunjungan.'
      USING ERRCODE = '42501';
  END IF;

  v_staff_id := public.get_user_staff_id();
  IF v_staff_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.staff assistant
    WHERE assistant.id = v_staff_id
      AND assistant.position = 'ASSISTANT'
      AND assistant.active = true
      AND assistant.employment_status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Akun ini belum terhubung dengan data asisten aktif.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_queue
  FROM public.queue_items
  WHERE id = p_queue_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Antrean tidak ditemukan.';
  END IF;

  IF NOT public.user_can_manage_treatment_branch(v_queue.branch_id) THEN
    RAISE EXCEPTION 'Asisten tidak memiliki akses ke cabang kunjungan ini.'
      USING ERRCODE = '42501';
  END IF;

  IF v_queue.status NOT IN ('WAITING', 'CALLING', 'IN_PREPARATION', 'IN_CONSULTATION') THEN
    RAISE EXCEPTION 'Asisten pendamping hanya dapat dicatat selama kunjungan masih berlangsung.';
  END IF;

  IF v_queue.assistant_staff_id IS NOT NULL AND v_queue.assistant_staff_id <> v_staff_id THEN
    RAISE EXCEPTION 'Asisten pendamping kunjungan sudah tercatat.';
  END IF;

  IF v_queue.assistant_staff_id = v_staff_id THEN
    RETURN v_queue;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.queue_items queue
    WHERE queue.visit_id = v_queue.visit_id
      AND queue.id <> v_queue.id
      AND queue.assistant_staff_id IS NOT NULL
      AND queue.assistant_staff_id <> v_staff_id
  ) THEN
    RAISE EXCEPTION 'Kunjungan ini sudah memiliki asisten pendamping lain.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.treatment_jobs job
    WHERE job.visit_id = v_queue.visit_id
      AND job.status <> 'DIBATALKAN'
      AND job.pic_assistant_id IS NOT NULL
      AND job.pic_assistant_id <> v_staff_id
  ) THEN
    RAISE EXCEPTION 'Kunjungan memiliki tindakan dengan PIC asisten berbeda; hubungi Admin Cabang.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.treatment_jobs job
    JOIN public.invoices invoice
      ON invoice.visit_id = job.visit_id
     AND invoice.status = 'PAID'
    JOIN public.invoice_items item
      ON item.invoice_id = invoice.id
     AND item.treatment_job_id = job.id
    WHERE job.visit_id = v_queue.visit_id
      AND job.status <> 'DIBATALKAN'
  ) THEN
    RAISE EXCEPTION 'Invoice kunjungan sudah lunas; asisten pendamping tidak dapat ditetapkan secara retroaktif.';
  END IF;

  UPDATE public.treatment_jobs
  SET pic_assistant_id = v_staff_id,
      updated_at = timezone('utc'::TEXT, now())
  WHERE visit_id = v_queue.visit_id
    AND status <> 'DIBATALKAN'
    AND pic_assistant_id IS NULL;

  UPDATE public.queue_items
  SET assistant_staff_id = v_staff_id,
      assistant_claimed_at = COALESCE(assistant_claimed_at, timezone('utc'::TEXT, now())),
      status = CASE
        WHEN status IN ('WAITING', 'CALLING') THEN 'IN_PREPARATION'
        ELSE status
      END,
      updated_at = timezone('utc'::TEXT, now())
  WHERE id = p_queue_id
  RETURNING * INTO v_queue;

  RETURN v_queue;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_queue_visit_as_assistant(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_queue_visit_as_assistant(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.inherit_queue_assistant_on_treatment_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  IF NEW.pic_assistant_id IS NULL THEN
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

NOTIFY pgrst, 'reload schema';

COMMIT;
