ALTER TABLE public.patient_profiles
  ADD COLUMN IF NOT EXISTS referring_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patient_profiles_referring_staff
  ON public.patient_profiles(referring_staff_id);

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS treatment_job_id UUID REFERENCES public.treatment_jobs(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_items_treatment_job
  ON public.invoice_items(treatment_job_id)
  WHERE treatment_job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_referral_accrual_per_patient
  ON public.compensation_accruals(source_id, rule_id_snapshot)
  WHERE rule_id_snapshot = 'ADMIN_REFERRAL_RP3000_V1';

COMMENT ON COLUMN public.patient_profiles.referring_staff_id IS
  'Staff admin recorded as the patient referrer; eligible for one referral incentive after completed treatment and fully paid invoice.';

COMMENT ON COLUMN public.invoice_items.treatment_job_id IS
  'Exact treatment job billed by this invoice line, used for paid-treatment compensation.';
