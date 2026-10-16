CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_patient_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  booking_day DATE;
  booking_lock_key BIGINT;
BEGIN
  IF NEW.status NOT IN ('PENDING', 'CONFIRMED') THEN
    RETURN NEW;
  END IF;

  booking_day := (NEW.booking_date_time AT TIME ZONE 'UTC')::DATE;
  booking_lock_key := hashtextextended(
    NEW.patient_id::TEXT || ':' || NEW.branch_id::TEXT || ':' || booking_day::TEXT,
    0
  );

  PERFORM pg_advisory_xact_lock(booking_lock_key);

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.patient_id = NEW.patient_id
      AND b.branch_id = NEW.branch_id
      AND (b.booking_date_time AT TIME ZONE 'UTC')::DATE = booking_day
      AND b.status IN ('PENDING', 'CONFIRMED')
      AND b.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Pasien sudah memiliki booking aktif di cabang ini pada tanggal tersebut'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prevent_duplicate_active_patient_booking() TO authenticated, service_role;

DROP TRIGGER IF EXISTS bookings_prevent_duplicate_active_patient_day ON public.bookings;
CREATE TRIGGER bookings_prevent_duplicate_active_patient_day
  BEFORE INSERT OR UPDATE OF patient_id, branch_id, booking_date_time, status
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_active_patient_booking();