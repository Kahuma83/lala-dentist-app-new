ALTER TABLE public.patient_profiles
  ADD COLUMN IF NOT EXISTS identity_document_type VARCHAR(10),
  ADD COLUMN IF NOT EXISTS identity_document_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS place_of_birth VARCHAR(100),
  ADD COLUMN IF NOT EXISTS occupation VARCHAR(100),
  ADD COLUMN IF NOT EXISTS religion VARCHAR(50),
  ADD COLUMN IF NOT EXISTS marital_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS education VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_profiles_identity_document
  ON public.patient_profiles (identity_document_type, LOWER(identity_document_number))
  WHERE identity_document_number IS NOT NULL;
