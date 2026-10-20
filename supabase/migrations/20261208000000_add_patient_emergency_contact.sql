BEGIN;

ALTER TABLE public.patient_profiles
  ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(80);

COMMIT;
