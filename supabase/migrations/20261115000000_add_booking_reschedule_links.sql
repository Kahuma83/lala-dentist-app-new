ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS rescheduled_from_booking_id UUID
    REFERENCES public.bookings(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reschedule_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_rescheduled_from
  ON public.bookings(rescheduled_from_booking_id)
  WHERE rescheduled_from_booking_id IS NOT NULL;

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
     OR NEW.status NOT IN ('PENDING', 'CONFIRMED') THEN
    RETURN NEW;
  END IF;

  booking_lock_key := hashtextextended(NEW.patient_id::TEXT, 0);
  PERFORM pg_advisory_xact_lock(booking_lock_key);

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.patient_id = NEW.patient_id
      AND b.status IN ('PENDING', 'CONFIRMED')
      AND b.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Pasien masih memiliki janji temu aktif yang belum selesai'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;
