ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW'));

CREATE OR REPLACE FUNCTION public.sync_patient_visit_status_from_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  linked_booking_id UUID;
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

  IF NEW.status = 'COMPLETED' THEN
    linked_booking_id := NEW.booking_id;
    IF linked_booking_id IS NULL THEN
      SELECT booking_id
      INTO linked_booking_id
      FROM public.patient_visits
      WHERE id = NEW.visit_id;
    END IF;

    UPDATE public.bookings
    SET status = 'COMPLETED',
        updated_at = timezone('utc'::text, now())
    WHERE id = linked_booking_id
      AND branch_id = NEW.branch_id
      AND status IN ('PENDING', 'CONFIRMED', 'RESCHEDULED');
  END IF;

  RETURN NEW;
END;
$$;

WITH latest_queue_status AS (
  SELECT DISTINCT ON (visit_id)
    visit_id,
    COALESCE(queue.booking_id, visit.booking_id) AS booking_id,
    queue.status
  FROM public.queue_items AS queue
  JOIN public.patient_visits AS visit ON visit.id = queue.visit_id
  WHERE queue.status IN ('WAITING', 'IN_PREPARATION', 'CALLING', 'IN_CONSULTATION', 'COMPLETED')
  ORDER BY visit_id, queue.updated_at DESC NULLS LAST, queue.created_at DESC
)
UPDATE public.bookings AS booking
SET status = 'COMPLETED',
    updated_at = timezone('utc'::text, now())
FROM latest_queue_status AS latest
WHERE latest.status = 'COMPLETED'
  AND latest.booking_id = booking.id
  AND booking.status IN ('PENDING', 'CONFIRMED', 'RESCHEDULED');
