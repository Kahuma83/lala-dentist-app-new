CREATE OR REPLACE FUNCTION public.prevent_duplicate_doctor_booking_slot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  slot_lock_key BIGINT;
BEGIN
  IF NEW.status NOT IN ('PENDING', 'CONFIRMED') OR NEW.doctor_id IS NULL THEN
    RETURN NEW;
  END IF;

  slot_lock_key := hashtextextended(
    NEW.branch_id::TEXT || ':' || NEW.doctor_id::TEXT || ':' || NEW.booking_date_time::TEXT,
    0
  );
  PERFORM pg_advisory_xact_lock(slot_lock_key);

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.branch_id = NEW.branch_id
      AND b.doctor_id = NEW.doctor_id
      AND b.booking_date_time = NEW.booking_date_time
      AND b.status IN ('PENDING', 'CONFIRMED')
      AND b.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Dokter sudah memiliki booking aktif pada slot waktu tersebut di cabang ini'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prevent_duplicate_doctor_booking_slot() TO authenticated, service_role;

DROP TRIGGER IF EXISTS bookings_prevent_duplicate_doctor_slot ON public.bookings;
CREATE TRIGGER bookings_prevent_duplicate_doctor_slot
  BEFORE INSERT OR UPDATE OF branch_id, doctor_id, booking_date_time, status
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_doctor_booking_slot();
