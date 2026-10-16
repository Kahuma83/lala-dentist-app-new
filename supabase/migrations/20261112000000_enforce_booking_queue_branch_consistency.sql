UPDATE public.patient_visits AS visit
SET branch_id = booking.branch_id,
    updated_at = timezone('utc'::text, now())
FROM public.bookings AS booking
WHERE visit.booking_id = booking.id
  AND visit.patient_id = booking.patient_id
  AND visit.branch_id IS DISTINCT FROM booking.branch_id;

UPDATE public.queue_items AS queue
SET branch_id = visit.branch_id,
    booking_id = COALESCE(queue.booking_id, visit.booking_id),
    updated_at = timezone('utc'::text, now())
FROM public.patient_visits AS visit
WHERE queue.visit_id = visit.id
  AND (queue.booking_id IS NULL OR queue.booking_id = visit.booking_id)
  AND queue.branch_id IS DISTINCT FROM visit.branch_id
  AND (
    queue.status NOT IN ('WAITING', 'IN_PREPARATION', 'IN_CONSULTATION', 'CALLING')
    OR NOT EXISTS (
      SELECT 1
      FROM public.queue_items AS other_queue
      WHERE other_queue.id <> queue.id
        AND other_queue.patient_id = COALESCE(queue.patient_id, visit.patient_id)
        AND other_queue.branch_id = visit.branch_id
        AND other_queue.visit_id <> queue.visit_id
        AND (other_queue.arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE =
            (queue.arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE
        AND other_queue.status IN ('WAITING', 'IN_PREPARATION', 'IN_CONSULTATION', 'CALLING')
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.queue_items AS queue
    JOIN public.patient_visits AS visit ON visit.id = queue.visit_id
    WHERE queue.status IN ('WAITING', 'IN_PREPARATION', 'IN_CONSULTATION', 'CALLING')
      AND queue.branch_id IS DISTINCT FROM visit.branch_id
  ) THEN
    RAISE EXCEPTION 'Ada antrean aktif dengan cabang tidak sesuai booking/kunjungan. Periksa duplikasi antrean sebelum menjalankan migrasi kembali.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_queue_branch_matches_visit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  visit_patient_id UUID;
  visit_branch_id UUID;
  visit_booking_id UUID;
  booking_patient_id UUID;
  booking_branch_id UUID;
  canonical_branch_id UUID;
  linked_booking_id UUID;
BEGIN
  SELECT patient_id, branch_id, booking_id
  INTO visit_patient_id, visit_branch_id, visit_booking_id
  FROM public.patient_visits
  WHERE id = NEW.visit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kunjungan antrean tidak ditemukan';
  END IF;

  IF NEW.patient_id IS NOT NULL AND NEW.patient_id <> visit_patient_id THEN
    RAISE EXCEPTION 'Pasien antrean tidak sesuai dengan kunjungan';
  END IF;

  IF NEW.booking_id IS DISTINCT FROM visit_booking_id THEN
    RAISE EXCEPTION 'Booking antrean tidak sesuai dengan kunjungan';
  END IF;

  linked_booking_id := COALESCE(NEW.booking_id, visit_booking_id);
  canonical_branch_id := visit_branch_id;

  IF linked_booking_id IS NOT NULL THEN
    SELECT patient_id, branch_id
    INTO booking_patient_id, booking_branch_id
    FROM public.bookings
    WHERE id = linked_booking_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Booking untuk kunjungan antrean tidak ditemukan';
    END IF;

    IF booking_patient_id <> visit_patient_id THEN
      RAISE EXCEPTION 'Pasien booking tidak sesuai dengan kunjungan';
    END IF;

    canonical_branch_id := booking_branch_id;
  END IF;

  IF NEW.branch_id <> canonical_branch_id THEN
    RAISE EXCEPTION 'Cabang antrean harus sama dengan cabang booking atau kunjungan';
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_queue_branch_matches_visit() TO authenticated, service_role;

DROP TRIGGER IF EXISTS queue_items_validate_branch_matches_visit ON public.queue_items;
CREATE TRIGGER queue_items_validate_branch_matches_visit
  BEFORE INSERT OR UPDATE OF branch_id, visit_id, booking_id, patient_id
  ON public.queue_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_queue_branch_matches_visit();
