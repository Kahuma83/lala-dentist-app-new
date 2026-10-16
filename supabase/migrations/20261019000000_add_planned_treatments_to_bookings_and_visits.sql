ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS planned_treatments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.patient_visits
  ADD COLUMN IF NOT EXISTS planned_treatments JSONB NOT NULL DEFAULT '[]'::jsonb;