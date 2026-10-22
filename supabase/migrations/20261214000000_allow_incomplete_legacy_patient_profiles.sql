ALTER TABLE public.patient_profiles
  ALTER COLUMN date_of_birth DROP NOT NULL,
  ALTER COLUMN gender DROP NOT NULL;

ALTER TABLE public.patient_profiles
  DROP CONSTRAINT IF EXISTS patient_profiles_gender_check;

ALTER TABLE public.patient_profiles
  ADD CONSTRAINT patient_profiles_gender_check
  CHECK (gender IS NULL OR gender IN ('L', 'P'));
