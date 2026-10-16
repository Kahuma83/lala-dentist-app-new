-- Patient acquisition source is distinct from the booking channel.
-- Keep the fields nullable for compatibility with existing patient records.
ALTER TABLE public.patient_profiles
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT,
  ADD COLUMN IF NOT EXISTS referral_name TEXT;

ALTER TABLE public.patient_profiles
  ALTER COLUMN acquisition_source SET DEFAULT 'UNKNOWN';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'patients'
      AND c.relkind IN ('r', 'p')
  ) THEN
    ALTER TABLE public.patients
      ADD COLUMN IF NOT EXISTS acquisition_source TEXT,
      ADD COLUMN IF NOT EXISTS referral_name TEXT;

    ALTER TABLE public.patients
      ALTER COLUMN acquisition_source SET DEFAULT 'UNKNOWN';
  END IF;
END;
$$;
