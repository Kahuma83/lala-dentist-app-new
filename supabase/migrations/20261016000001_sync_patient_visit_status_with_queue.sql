CREATE OR REPLACE FUNCTION public.sync_patient_visit_status_from_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.patient_visits
  SET visit_status = CASE
        WHEN NEW.status IN ('WAITING', 'IN_PREPARATION', 'CALLING') THEN 'IN_TRIAGE'
        WHEN NEW.status = 'IN_CONSULTATION' THEN 'IN_TREATMENT'
        WHEN NEW.status = 'COMPLETED' THEN 'COMPLETED'
      END,
      updated_at = timezone('utc'::text, now())
  WHERE id = NEW.visit_id
    AND NEW.status IN ('WAITING', 'IN_PREPARATION', 'CALLING', 'IN_CONSULTATION', 'COMPLETED');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_items_sync_patient_visit_status ON public.queue_items;
CREATE TRIGGER queue_items_sync_patient_visit_status
  AFTER INSERT OR UPDATE OF status ON public.queue_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_patient_visit_status_from_queue();

WITH latest_queue_status AS (
  SELECT DISTINCT ON (visit_id)
    visit_id,
    status
  FROM public.queue_items
  WHERE status IN ('WAITING', 'IN_PREPARATION', 'CALLING', 'IN_CONSULTATION', 'COMPLETED')
  ORDER BY visit_id, updated_at DESC NULLS LAST, created_at DESC
)
UPDATE public.patient_visits AS visit
SET visit_status = CASE
      WHEN latest.status IN ('WAITING', 'IN_PREPARATION', 'CALLING') THEN 'IN_TRIAGE'
      WHEN latest.status = 'IN_CONSULTATION' THEN 'IN_TREATMENT'
      WHEN latest.status = 'COMPLETED' THEN 'COMPLETED'
    END,
    updated_at = timezone('utc'::text, now())
FROM latest_queue_status AS latest
WHERE visit.id = latest.visit_id;
