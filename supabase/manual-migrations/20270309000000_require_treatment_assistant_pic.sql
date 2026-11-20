BEGIN;

CREATE OR REPLACE FUNCTION public.require_treatment_assistant_pic()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.assistant_staff_id IS NULL THEN
    RAISE EXCEPTION 'PIC kunjungan wajib diisi sebelum disimpan.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS treatment_visit_assistant_pic_required
  ON public.treatment_visit_assistant_assignments;
CREATE TRIGGER treatment_visit_assistant_pic_required
  BEFORE INSERT OR UPDATE OF assistant_staff_id
  ON public.treatment_visit_assistant_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.require_treatment_assistant_pic();

CREATE OR REPLACE FUNCTION public.require_treatment_pic_before_start()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.pic_assistant_id IS NOT NULL AND NEW.pic_assistant_id IS NULL THEN
    RAISE EXCEPTION 'PIC tindakan yang sudah ditetapkan tidak dapat dikosongkan.';
  END IF;

  IF (
    (NEW.status = 'DALAM_PROSES' AND OLD.status IS DISTINCT FROM NEW.status)
    OR (NEW.started_at IS NOT NULL AND OLD.started_at IS NULL)
  ) AND NEW.pic_assistant_id IS NULL THEN
    RAISE EXCEPTION 'PIC wajib ditetapkan sebelum tindakan dimulai.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS treatment_job_pic_required_before_start
  ON public.treatment_jobs;
CREATE TRIGGER treatment_job_pic_required_before_start
  BEFORE UPDATE OF status, started_at, pic_assistant_id
  ON public.treatment_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.require_treatment_pic_before_start();

COMMIT;
