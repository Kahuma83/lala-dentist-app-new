CREATE OR REPLACE FUNCTION public.prevent_duplicate_doctor_booking_slot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  slot_lock_key BIGINT;
  normalized_slot TIMESTAMP;
BEGIN
  IF NEW.status NOT IN ('PENDING', 'CONFIRMED') OR NEW.doctor_id IS NULL THEN
    RETURN NEW;
  END IF;

  normalized_slot := date_trunc('minute', NEW.booking_date_time AT TIME ZONE 'UTC');
  slot_lock_key := hashtextextended(
    NEW.branch_id::TEXT || ':' || NEW.doctor_id::TEXT || ':' || normalized_slot::TEXT,
    0
  );
  PERFORM pg_advisory_xact_lock(slot_lock_key);

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.branch_id = NEW.branch_id
      AND b.doctor_id = NEW.doctor_id
      AND date_trunc('minute', b.booking_date_time AT TIME ZONE 'UTC') = normalized_slot
      AND b.status IN ('PENDING', 'CONFIRMED')
      AND b.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Dokter sudah memiliki booking aktif pada slot waktu tersebut di cabang ini'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;
