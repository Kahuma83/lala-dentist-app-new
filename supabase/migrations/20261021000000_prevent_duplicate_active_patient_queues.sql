CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_patient_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  queue_day DATE;
  queue_lock_key BIGINT;
BEGIN
  IF NEW.patient_id IS NULL OR NEW.status NOT IN ('WAITING', 'IN_PREPARATION', 'IN_CONSULTATION', 'CALLING') THEN
    RETURN NEW;
  END IF;

  queue_day := (NEW.arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE;
  queue_lock_key := hashtextextended(
    NEW.patient_id::TEXT || ':' || NEW.branch_id::TEXT || ':' || queue_day::TEXT,
    0
  );

  PERFORM pg_advisory_xact_lock(queue_lock_key);

  IF EXISTS (
    SELECT 1
    FROM public.queue_items q
    WHERE q.patient_id = NEW.patient_id
      AND q.branch_id = NEW.branch_id
      AND (q.arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE = queue_day
      AND q.status IN ('WAITING', 'IN_PREPARATION', 'IN_CONSULTATION', 'CALLING')
      AND q.id IS DISTINCT FROM NEW.id
      AND q.visit_id IS DISTINCT FROM NEW.visit_id
  ) THEN
    RAISE EXCEPTION 'Pasien ini sudah berada di antrean aktif hari ini melalui kunjungan lain'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prevent_duplicate_active_patient_queue() TO authenticated, service_role;

DROP TRIGGER IF EXISTS queue_items_prevent_duplicate_active_patient_day ON public.queue_items;
CREATE TRIGGER queue_items_prevent_duplicate_active_patient_day
  BEFORE INSERT OR UPDATE OF patient_id, branch_id, arrival_at, status, visit_id
  ON public.queue_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_active_patient_queue();