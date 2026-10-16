CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_patient_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  booking_lock_key BIGINT;
BEGIN
  IF NEW.source IS DISTINCT FROM 'PATIENT_PORTAL'
     OR NEW.status NOT IN ('PENDING', 'CONFIRMED', 'RESCHEDULED') THEN
    RETURN NEW;
  END IF;

  booking_lock_key := hashtextextended(NEW.patient_id::TEXT, 0);
  PERFORM pg_advisory_xact_lock(booking_lock_key);

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.patient_id = NEW.patient_id
      AND b.status IN ('PENDING', 'CONFIRMED', 'RESCHEDULED')
      AND b.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Pasien masih memiliki janji temu aktif yang belum selesai'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_prevent_duplicate_active_patient_day ON public.bookings;
DROP TRIGGER IF EXISTS bookings_prevent_multiple_active_patient_portal ON public.bookings;
CREATE TRIGGER bookings_prevent_multiple_active_patient_portal
  BEFORE INSERT OR UPDATE OF patient_id, branch_id, booking_date_time, status, source
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_active_patient_booking();
