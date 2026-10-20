BEGIN;

ALTER TABLE public.clinical_medical_records
  ADD COLUMN IF NOT EXISTS procedure_icd9cm_codes JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
