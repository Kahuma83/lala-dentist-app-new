-- Chart of accounts is a global read-only master for authenticated users.
-- Only Super Admin may maintain account definitions.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chart_of_accounts TO authenticated;

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read chart of accounts"
  ON public.chart_of_accounts;
CREATE POLICY "Authenticated users can read chart of accounts"
  ON public.chart_of_accounts
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Super Admin can manage chart of accounts"
  ON public.chart_of_accounts;
CREATE POLICY "Super Admin can manage chart of accounts"
  ON public.chart_of_accounts
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'SUPER_ADMIN')
  WITH CHECK (public.get_user_role() = 'SUPER_ADMIN');
