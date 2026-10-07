-- =====================================================================
-- LALA DENTIST — FORENSIC RLS HARDENING & BRANCH ISOLATION V2
-- Migration: 20260928000001_patient_branch_isolation_and_security_hardening.sql
-- 
-- DESCRIPTION:
-- 1. Adds indexed 'registered_branch_id' to public.patient_profiles for explicit branch lineage.
-- 2. Enforces strict Patient Identity Isolation: PATIENT role binds strictly to public.get_user_patient_id().
-- 3. Enforces strict Branch Isolation on patient_profiles (Branch Staff can ONLY read/update patients of their branch).
-- 4. Branch Staff INSERT requires registered_branch_id = public.get_user_branch_id() (NO null injection by branch staff).
-- 5. Only Super Admin can insert with NULL / cross-branch registered_branch_id, or delete patient profiles.
-- 6. Adds tamper-proof trigger for patient_profiles preventing unauthorized modification of ownership/lineage columns.
-- 7. Strict least-privilege GRANTs: Revokes all routine & table execution/access from anon.
-- 8. Performance index creation on all foreign keys & columns evaluated by RLS.
-- 9. Preserves public Android read access ONLY to active promotion_media (is_active = true).
-- =====================================================================

-- 1. SCHEMA PERMISSIONS & LEAST PRIVILEGE GRANTS
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Revoke all table and routine access from anon and public by default
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, public;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, public;

-- Public / Android: Whitelist only public catalog & active promo data
GRANT SELECT ON public.promotion_media TO anon;
GRANT SELECT ON public.dental_branches TO anon;
GRANT SELECT ON public.master_services TO anon;
GRANT SELECT ON public.branch_service_tariffs TO anon;
GRANT SELECT ON public.dental_doctors TO anon;
GRANT SELECT ON public.doctor_branch_assignments TO anon;
GRANT SELECT ON public.doctor_schedules TO anon;

-- Authenticated: Restricted to RLS evaluation
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =====================================================================
-- 2. SCHEMA EXTENSIONS & PERFORMANCE INDEXES
-- =====================================================================

-- Add registered_branch_id to patient_profiles if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'patient_profiles' 
      AND column_name = 'registered_branch_id'
  ) THEN
    ALTER TABLE public.patient_profiles 
    ADD COLUMN registered_branch_id UUID REFERENCES public.dental_branches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- High-performance non-destructive composite & foreign key indexes for RLS evaluation
CREATE INDEX IF NOT EXISTS idx_patient_profiles_reg_branch ON public.patient_profiles(registered_branch_id);
CREATE INDEX IF NOT EXISTS idx_patient_visits_patient_branch ON public.patient_visits(patient_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_bookings_patient_branch ON public.bookings(patient_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_queue_items_patient_branch ON public.queue_items(patient_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_patient_branch ON public.invoices(patient_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_payment_trans_invoice_branch ON public.payment_transactions(invoice_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_patient_branch ON public.clinical_medical_records(patient_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_auth_lookup ON public.user_accounts(auth_user_id, role, active);

-- =====================================================================
-- 3. HARDENED SECURITY DEFINER FUNCTIONS (STRICT SEARCH PATH & GRANTS)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_accounts 
    WHERE auth_user_id = auth.uid() 
      AND role = 'SUPER_ADMIN' 
      AND active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role VARCHAR;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT role INTO v_role
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;
  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_branch_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT branch_id INTO v_branch_id
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;
  RETURN v_branch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_patient_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT patient_id INTO v_patient_id
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;
  RETURN v_patient_id;
END;
$$;

-- Grant EXECUTE exclusively to authenticated role for RLS policy evaluation
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_branch_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_patient_id() TO authenticated;

-- =====================================================================
-- 4. TAMPER-PROOF TRIGGER FOR PATIENT PROFILES
-- =====================================================================

CREATE OR REPLACE FUNCTION public.protect_patient_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Super admin can make any administrative modifications
  IF public.is_super_admin() THEN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
  END IF;

  -- 1. Prevent ID and Medical Record Number tampering
  IF (NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Identity tampering rejected: id is immutable.';
  END IF;

  IF (NEW.medical_record_number IS DISTINCT FROM OLD.medical_record_number) THEN
    RAISE EXCEPTION 'Medical record number tampering rejected: medical_record_number is immutable.';
  END IF;

  -- 2. Prevent Branch Lineage tampering by non-superadmin actors
  IF (NEW.registered_branch_id IS DISTINCT FROM OLD.registered_branch_id) THEN
    RAISE EXCEPTION 'Branch lineage tampering rejected: registered_branch_id modification is restricted to SUPER_ADMIN.';
  END IF;

  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_patient_profile ON public.patient_profiles;
CREATE TRIGGER trg_protect_patient_profile
BEFORE UPDATE ON public.patient_profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_patient_profile_fields();

-- =====================================================================
-- 5. HARDENED PATIENT PROFILES RLS (IDENTITY & BRANCH ISOLATION)
-- =====================================================================
ALTER TABLE IF EXISTS public.patient_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read patients" ON public.patient_profiles;
DROP POLICY IF EXISTS "Staff manage patients" ON public.patient_profiles;
DROP POLICY IF EXISTS "Branch staff read patient profiles" ON public.patient_profiles;
DROP POLICY IF EXISTS "Branch staff insert patient profiles" ON public.patient_profiles;
DROP POLICY IF EXISTS "Branch staff update patient profiles" ON public.patient_profiles;
DROP POLICY IF EXISTS "Super admin delete patient profiles" ON public.patient_profiles;

-- SELECT: Super Admin (ALL), Branch Staff (Only patients connected to their branch), Patient (Self only via get_user_patient_id)
CREATE POLICY "Branch staff read patient profiles"
  ON public.patient_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
      AND (
        (registered_branch_id IS NOT NULL AND registered_branch_id = public.get_user_branch_id())
        OR EXISTS (
          SELECT 1 FROM public.patient_visits pv
          WHERE pv.patient_id = patient_profiles.id 
            AND pv.branch_id = public.get_user_branch_id()
        )
        OR EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.patient_id = patient_profiles.id 
            AND b.branch_id = public.get_user_branch_id()
        )
        OR EXISTS (
          SELECT 1 FROM public.queue_items q
          WHERE q.patient_id = patient_profiles.id 
            AND q.branch_id = public.get_user_branch_id()
        )
      )
    )
    OR (public.get_user_role() = 'PATIENT' AND id = public.get_user_patient_id())
  );

-- INSERT: Super Admin (ALL), Branch Staff (MUST bind registered_branch_id strictly to their assigned branch)
CREATE POLICY "Branch staff insert patient profiles"
  ON public.patient_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
      AND registered_branch_id IS NOT NULL 
      AND registered_branch_id = public.get_user_branch_id()
    )
  );

-- UPDATE: Super Admin (ALL), Branch Staff (Only patients in their branch boundary), Patient (Self only via get_user_patient_id)
CREATE POLICY "Branch staff update patient profiles"
  ON public.patient_profiles
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
      AND (
        (registered_branch_id IS NOT NULL AND registered_branch_id = public.get_user_branch_id())
        OR EXISTS (
          SELECT 1 FROM public.patient_visits pv
          WHERE pv.patient_id = patient_profiles.id 
            AND pv.branch_id = public.get_user_branch_id()
        )
        OR EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.patient_id = patient_profiles.id 
            AND b.branch_id = public.get_user_branch_id()
        )
      )
    )
    OR (public.get_user_role() = 'PATIENT' AND id = public.get_user_patient_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
      AND (registered_branch_id IS NOT NULL AND registered_branch_id = public.get_user_branch_id())
    )
    OR (public.get_user_role() = 'PATIENT' AND id = public.get_user_patient_id())
  );

-- DELETE: Super Admin ONLY
CREATE POLICY "Super admin delete patient profiles"
  ON public.patient_profiles
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

-- =====================================================================
-- 6. HARDENED PROMOTION MEDIA RLS (ANON WRITE PREVENTION & ISOLATION)
-- =====================================================================
ALTER TABLE IF EXISTS public.promotion_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active promotions read" ON public.promotion_media;
DROP POLICY IF EXISTS "Admin manage promotions" ON public.promotion_media;
DROP POLICY IF EXISTS "Public select active promotions" ON public.promotion_media;
DROP POLICY IF EXISTS "Branch admin manage branch promotions" ON public.promotion_media;
DROP POLICY IF EXISTS "Super admin manage all promotions" ON public.promotion_media;

-- Public / Android App: Can ONLY SELECT is_active = true
CREATE POLICY "Public select active promotions"
  ON public.promotion_media
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    OR public.is_super_admin()
    OR (auth.role() = 'authenticated' AND public.get_user_role() = 'BRANCH_ADMIN' AND branch_id = public.get_user_branch_id())
  );

-- Branch Admin: Manage promotions strictly within their branch
CREATE POLICY "Branch admin manage branch promotions"
  ON public.promotion_media
  FOR ALL
  TO authenticated
  USING (
    public.get_user_role() = 'BRANCH_ADMIN' AND branch_id IS NOT NULL AND branch_id = public.get_user_branch_id()
  )
  WITH CHECK (
    public.get_user_role() = 'BRANCH_ADMIN' AND branch_id IS NOT NULL AND branch_id = public.get_user_branch_id()
  );

-- Super Admin: Full management
CREATE POLICY "Super admin manage all promotions"
  ON public.promotion_media
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- =====================================================================
-- 7. HARDENED INVOICES & PAYMENTS RLS
-- =====================================================================
ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoice branch isolation select" ON public.invoices;
DROP POLICY IF EXISTS "Invoice branch isolation manage" ON public.invoices;
DROP POLICY IF EXISTS "Invoice items isolation" ON public.invoice_items;
DROP POLICY IF EXISTS "Payment branch isolation" ON public.payment_transactions;

-- Invoices
CREATE POLICY "Invoice branch isolation select"
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR branch_id = public.get_user_branch_id()
    OR (public.get_user_role() = 'PATIENT' AND patient_id = public.get_user_patient_id())
  );

CREATE POLICY "Invoice branch isolation manage"
  ON public.invoices
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.get_user_role() = 'BRANCH_ADMIN' AND branch_id = public.get_user_branch_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.get_user_role() = 'BRANCH_ADMIN' AND branch_id = public.get_user_branch_id())
  );

-- Invoice Items
CREATE POLICY "Invoice items isolation"
  ON public.invoice_items
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.invoices i 
      WHERE i.id = invoice_items.invoice_id 
        AND (i.branch_id = public.get_user_branch_id() OR (public.get_user_role() = 'PATIENT' AND i.patient_id = public.get_user_patient_id()))
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.invoices i 
      WHERE i.id = invoice_items.invoice_id 
        AND i.branch_id = public.get_user_branch_id()
        AND public.get_user_role() = 'BRANCH_ADMIN'
    )
  );

-- Payment Transactions: ONLY Branch Admin of that branch or Super Admin (DOCTOR, ASSISTANT, PATIENT, ANON DENIED)
CREATE POLICY "Payment branch isolation"
  ON public.payment_transactions
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.get_user_role() = 'BRANCH_ADMIN' AND branch_id = public.get_user_branch_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.get_user_role() = 'BRANCH_ADMIN' AND branch_id = public.get_user_branch_id())
  );

-- End of migration
