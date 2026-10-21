BEGIN;

ALTER TABLE public.patient_medical_profiles
  ADD COLUMN IF NOT EXISTS medication_allergies TEXT,
  ADD COLUMN IF NOT EXISTS food_allergies TEXT,
  ADD COLUMN IF NOT EXISTS congenital_diseases TEXT;

ALTER TABLE public.clinical_medical_records
  ADD COLUMN IF NOT EXISTS clinic_form_data JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
