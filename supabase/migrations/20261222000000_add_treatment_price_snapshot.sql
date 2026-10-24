ALTER TABLE public.treatment_jobs
  ADD COLUMN IF NOT EXISTS price_snapshot BIGINT
  CHECK (price_snapshot >= 0);
