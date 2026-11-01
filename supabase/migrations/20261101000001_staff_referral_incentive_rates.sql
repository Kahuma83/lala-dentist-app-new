CREATE TABLE IF NOT EXISTS public.staff_referral_incentive_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_position VARCHAR(30) NOT NULL
    CHECK (staff_position IN ('BRANCH_ADMIN', 'ASSISTANT')),
  service_name VARCHAR(120),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_referral_rate_default
  ON public.staff_referral_incentive_rates(staff_position)
  WHERE service_name IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_referral_rate_service
  ON public.staff_referral_incentive_rates(
    staff_position,
    lower(regexp_replace(trim(service_name), '[^a-zA-Z0-9]', '', 'g'))
  )
  WHERE service_name IS NOT NULL;

ALTER TABLE public.staff_referral_incentive_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_referral_incentive_rates FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_referral_incentive_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_referral_incentive_rates TO service_role;

DROP POLICY IF EXISTS "Authenticated users read referral incentive rates"
  ON public.staff_referral_incentive_rates;
CREATE POLICY "Authenticated users read referral incentive rates"
  ON public.staff_referral_incentive_rates
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Super admin manages referral incentive rates"
  ON public.staff_referral_incentive_rates;
CREATE POLICY "Super admin manages referral incentive rates"
  ON public.staff_referral_incentive_rates
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

INSERT INTO public.staff_referral_incentive_rates (staff_position, service_name, amount)
VALUES
  ('BRANCH_ADMIN', NULL, 3000.00),
  ('ASSISTANT', NULL, 3000.00)
ON CONFLICT DO NOTHING;
