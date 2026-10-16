-- Migration: 20261011000003_fix_super_admin_and_staff_rls.sql
-- CATATAN: File migrasi ini tidak perlu dijalankan ulang di database produksi karena perubahan sudah diterapkan secara manual.
-- Hardens staff table RLS policies and super admin recognition.

-- 1. Update is_super_admin fallback to superadmin@laladentist.id only
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Check if they have an active SUPER_ADMIN row in user_accounts
  IF EXISTS (
    SELECT 1 
    FROM public.user_accounts 
    WHERE auth_user_id = auth.uid() 
      AND role = 'SUPER_ADMIN' 
      AND active = true
  ) THEN
    RETURN TRUE;
  END IF;

  -- 2. Session check fallback: If current authenticated user email is the authorized superadmin email
  IF auth.uid() IS NOT NULL AND LOWER(TRIM(auth.jwt() ->> 'email')) = 'superadmin@laladentist.id' THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 2. Update get_user_role with self-healing fallback for superadmin@laladentist.id only
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role VARCHAR;
BEGIN
  -- Check user_accounts
  SELECT role INTO v_role
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;

  -- Self-healing fallback if not found but is the authorized superadmin email
  IF v_role IS NULL AND auth.uid() IS NOT NULL AND LOWER(TRIM(auth.jwt() ->> 'email')) = 'superadmin@laladentist.id' THEN
    v_role := 'SUPER_ADMIN';
  END IF;

  RETURN v_role;
END;
$$;

-- 3. Re-verify Staff table RLS policies
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- SELECT
DROP POLICY IF EXISTS "Staff read access" ON public.staff;
CREATE POLICY "Staff read access" ON public.staff
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::text = public.get_user_branch_id()::text
    )
    OR user_account_id IN (
      SELECT id FROM public.user_accounts WHERE auth_user_id = auth.uid()
    )
  );

-- INSERT
DROP POLICY IF EXISTS "Staff insert access" ON public.staff;
CREATE POLICY "Staff insert access" ON public.staff
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND (
        branch_id IS NULL
        OR branch_id::text = public.get_user_branch_id()::text
      )
    )
  );

-- UPDATE
DROP POLICY IF EXISTS "Staff update access" ON public.staff;
CREATE POLICY "Staff update access" ON public.staff
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::text = public.get_user_branch_id()::text
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::text = public.get_user_branch_id()::text
    )
  );

-- DELETE
DROP POLICY IF EXISTS "Staff delete access" ON public.staff;
CREATE POLICY "Staff delete access" ON public.staff
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
