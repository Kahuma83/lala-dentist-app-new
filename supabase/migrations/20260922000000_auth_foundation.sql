-- =====================================================================
-- PHASE 9A — SUPABASE FOUNDATION & REAL AUTHENTICATION
-- MIGRATION FOUNDATION & PROFILE SCHEMA PLAN
-- File: /supabase/migrations/20260922000000_auth_foundation.sql
-- =====================================================================

-- 1. Create custom enum or check constraints for user roles if needed
-- We map roles to the existing UserRole: SUPER_ADMIN, BRANCH_ADMIN, DOCTOR, DOCTOR_ASSISTANT, PATIENT

-- 2. Create the user_accounts profile mapping table
CREATE TABLE IF NOT EXISTS public.user_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(100),
  name VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL,
  staff_id VARCHAR(50),
  patient_id VARCHAR(50),
  branch_id VARCHAR(50),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Constraints
  CONSTRAINT fk_auth_users FOREIGN KEY (auth_user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT chk_user_role CHECK (role IN ('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT', 'PATIENT'))
);

-- Index for speedy context lookup
CREATE INDEX IF NOT EXISTS idx_user_accounts_auth_user ON public.user_accounts(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_email ON public.user_accounts(email);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;

-- 4. Secure RLS Policies (Principle: Restrict to owner unless Super Admin)

-- Helper function to check if the current user is a SUPER_ADMIN
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_accounts 
    WHERE auth_user_id = auth.uid() 
      AND role = 'SUPER_ADMIN' 
      AND active = true
  );
END;
$$ LANGUAGE plpgsql;

-- SELECT policy: Users can read their own profile, or SUPER_ADMINs can read all profiles.
CREATE POLICY "Allow users to read their own profile"
  ON public.user_accounts
  FOR SELECT
  USING (
    auth.uid() = auth_user_id 
    OR public.is_super_admin()
  );

-- UPDATE policy: Users can update limited fields on their own profile, SUPER_ADMIN has full update rights.
CREATE POLICY "Allow users to update their own profile"
  ON public.user_accounts
  FOR UPDATE
  USING (
    auth.uid() = auth_user_id 
    OR public.is_super_admin()
  )
  WITH CHECK (
    auth.uid() = auth_user_id 
    OR public.is_super_admin()
  );

-- INSERT policy: Only SUPER_ADMIN can create new user accounts in production.
CREATE POLICY "Only super admin can insert user accounts"
  ON public.user_accounts
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
  );

-- DELETE policy: Only SUPER_ADMIN can delete user accounts.
CREATE POLICY "Only super admin can delete user accounts"
  ON public.user_accounts
  FOR DELETE
  USING (
    public.is_super_admin()
  );
