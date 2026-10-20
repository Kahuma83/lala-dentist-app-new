BEGIN;

ALTER TABLE public.clinical_medical_records
  ADD COLUMN IF NOT EXISTS chief_complaint TEXT,
  ADD COLUMN IF NOT EXISTS clinical_examination TEXT,
  ADD COLUMN IF NOT EXISTS diagnosis TEXT,
  ADD COLUMN IF NOT EXISTS treatment_plan TEXT,
  ADD COLUMN IF NOT EXISTS doctor_notes TEXT;

UPDATE public.clinical_medical_records
SET chief_complaint = COALESCE(NULLIF(chief_complaint, ''), anamnesis, ''),
    clinical_examination = COALESCE(NULLIF(clinical_examination, ''), physical_examination, ''),
    treatment_plan = COALESCE(treatment_plan, treatment_notes),
    doctor_notes = COALESCE(doctor_notes, treatment_notes),
    diagnosis = COALESCE(diagnosis, '')
WHERE chief_complaint IS NULL
   OR clinical_examination IS NULL
   OR diagnosis IS NULL;

ALTER TABLE public.clinical_medical_records
  ALTER COLUMN anamnesis SET DEFAULT '',
  ALTER COLUMN physical_examination SET DEFAULT '';

COMMIT;

NOTIFY pgrst, 'reload schema';
