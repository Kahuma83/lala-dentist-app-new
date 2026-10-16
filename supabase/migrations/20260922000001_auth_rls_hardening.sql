-- =====================================================================
-- PHASE 9A.1 — SUPABASE AUTH & RLS SECURITY PATCH
-- MIGRATION: RLS HARDENING & PRIVILEGE ESCALATION PREVENTION
-- File: /supabase/migrations/20260922000001_auth_rls_hardening.sql
-- =====================================================================

-- 1. HARDEN SUPER_ADMIN CHECK FUNCTION
-- Ensure explicit search_path and strict non-tamperable checks
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_accounts 
    WHERE auth_user_id = auth.uid() 
      AND role = 'SUPER_ADMIN' 
      AND active = true
  );
END;
$$;

-- 2. CREATE DEFENSE-IN-DEPTH TRIGGER FUNCTION
-- Strictly disallows modification of authorization and identity fields by any non-SUPER_ADMIN
CREATE OR REPLACE FUNCTION public.protect_user_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If executing user is an active verified SUPER_ADMIN, allow administrative modifications
  IF public.is_super_admin() THEN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
  END IF;

  -- For all non-superadmin actors (PATIENT, DOCTOR, DOCTOR_ASSISTANT, BRANCH_ADMIN, or unauthenticated):
  -- Strictly reject any modification of authorization, status, and identity columns:

  -- 1. Role escalation protection
  IF (NEW.role IS DISTINCT FROM OLD.role) THEN
    RAISE EXCEPTION 'Privilege escalation rejected: role modification is restricted to SUPER_ADMIN.';
  END IF;

  -- 2. Identity immutability
  IF (NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id) THEN
    RAISE EXCEPTION 'Identity tampering rejected: auth_user_id is immutable.';
  END IF;

  IF (NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Identity tampering rejected: id is immutable.';
  END IF;

  -- 3. Staff assignment protection
  IF (NEW.staff_id IS DISTINCT FROM OLD.staff_id) THEN
    RAISE EXCEPTION 'Authorization tampering rejected: staff_id modification is restricted to SUPER_ADMIN.';
  END IF;

  -- 4. Patient identity protection
  IF (NEW.patient_id IS DISTINCT FROM OLD.patient_id) THEN
    RAISE EXCEPTION 'Authorization tampering rejected: patient_id modification is restricted to SUPER_ADMIN.';
  END IF;

  -- 5. Branch boundary protection
  IF (NEW.branch_id IS DISTINCT FROM OLD.branch_id) THEN
    RAISE EXCEPTION 'Authorization tampering rejected: branch_id modification is restricted to SUPER_ADMIN.';
  END IF;

  -- 6. Account status / active flag protection
  IF (NEW.active IS DISTINCT FROM OLD.active) THEN
    RAISE EXCEPTION 'Status tampering rejected: account active status modification is restricted to SUPER_ADMIN.';
  END IF;

  -- For allowed non-authorization updates (e.g. name), keep updated_at fresh
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

-- 3. BIND THE FIELD PROTECTION TRIGGER TO public.user_accounts
DROP TRIGGER IF EXISTS trg_protect_user_fields ON public.user_accounts;
CREATE TRIGGER trg_protect_user_fields
  BEFORE UPDATE ON public.user_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_fields();

-- 4. REMOVE VULNERABLE RLS UPDATE POLICY
DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.user_accounts;

-- 5. CREATE HARDENED SUPER_ADMIN UPDATE POLICY
CREATE POLICY "Super admin can update any user account"
  ON public.user_accounts
  FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 6. CREATE RESTRICTED REGULAR USER UPDATE POLICY
-- Users can only target their own row AND WITH CHECK verifies the auth_user_id cannot be changed.
-- Column modifications to authorization fields are completely blocked by trg_protect_user_fields.
CREATE POLICY "Users can update their own non-auth profile fields"
  ON public.user_accounts
  FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (
    auth.uid() = auth_user_id 
    AND auth_user_id = (SELECT a.auth_user_id FROM public.user_accounts a WHERE a.id = user_accounts.id)
  );
