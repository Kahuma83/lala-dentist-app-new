-- =====================================================================
-- FIX INVOICE, PAYMENT & QUEUE PERMISSIONS AND ROW LEVEL SECURITY
-- Resolves: 'permission denied for table invoices' / 'queue_items'
-- =====================================================================

-- 1. Ensure table grants for authenticated and anon roles
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoices TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoice_items TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_transactions TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.queue_items TO authenticated, anon;

-- 2. Permissive fallback RLS policies for invoices
ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoices full access policy" ON public.invoices;
CREATE POLICY "Invoices full access policy"
  ON public.invoices
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- 3. Permissive fallback RLS policies for invoice items
ALTER TABLE IF EXISTS public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoice items full access policy" ON public.invoice_items;
CREATE POLICY "Invoice items full access policy"
  ON public.invoice_items
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- 4. Permissive fallback RLS policies for payment transactions
ALTER TABLE IF EXISTS public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payment transactions full access policy" ON public.payment_transactions;
CREATE POLICY "Payment transactions full access policy"
  ON public.payment_transactions
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- 5. Permissive fallback RLS policies for queue items
ALTER TABLE IF EXISTS public.queue_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Queue items full access policy" ON public.queue_items;
CREATE POLICY "Queue items full access policy"
  ON public.queue_items
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- 6. Ensure dental_doctors permissions and columns for doctor photos
ALTER TABLE IF EXISTS public.dental_doctors ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE IF EXISTS public.dental_doctors ADD COLUMN IF NOT EXISTS photo_url TEXT;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dental_doctors TO authenticated, anon;

DROP POLICY IF EXISTS "Dental doctors full access policy" ON public.dental_doctors;
CREATE POLICY "Dental doctors full access policy"
  ON public.dental_doctors
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

