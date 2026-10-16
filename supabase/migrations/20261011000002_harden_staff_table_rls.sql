-- Migration: 20261011000002_harden_staff_table_rls.sql

-- 1. Helper function for Branch Admin check
CREATE OR REPLACE FUNCTION public.is_branch_admin_of(target_branch_id UUID)
RETURNS BOOLEAN SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_accounts 
    WHERE auth_user_id = auth.uid() 
      AND role = 'BRANCH_ADMIN' 
      AND branch_id::text = target_branch_id::text 
      AND active = true
  );
END;
$$;

-- Ensure public can execute this function
GRANT EXECUTE ON FUNCTION public.is_branch_admin_of(UUID) TO authenticated;

-- 2. Enable RLS
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- 3. Policies

-- SELECT: Super Admin can read all, Branch Admin can read own branch staff
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
  );

-- INSERT: Super Admin can insert anywhere, Branch Admin can insert into own branch
DROP POLICY IF EXISTS "Staff insert access" ON public.staff;
CREATE POLICY "Staff insert access" ON public.staff
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::text = public.get_user_branch_id()::text
    )
  );

-- UPDATE: Super Admin can update all, Branch Admin can update own branch
-- Branch Admin can only update staff in their branch and keep them in their branch
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

-- DELETE: Only Super Admin
DROP POLICY IF EXISTS "Staff delete access" ON public.staff;
CREATE POLICY "Staff delete access" ON public.staff
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
  );

-- Ensure explicit table privileges for authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
