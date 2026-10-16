ALTER TABLE public.user_accounts
  ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.dental_doctors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_accounts_doctor_id
  ON public.user_accounts(doctor_id);
