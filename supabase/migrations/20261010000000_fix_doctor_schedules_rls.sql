-- =====================================================================
-- AUDIT & HARDENING: DOCTOR SCHEDULES, ASSIGNMENTS & PAIRINGS RLS
-- Lala Dentist Security Architecture (Multi-Branch Isolation)
-- =====================================================================

-- 1. REVOKE all write privileges from anon (Least Privilege Principle)
-- anon role MUST NEVER have INSERT, UPDATE, or DELETE on doctor schedules or assignments
REVOKE ALL ON TABLE public.doctor_schedules FROM anon;
REVOKE ALL ON TABLE public.doctor_branch_assignments FROM anon;
REVOKE ALL ON TABLE public.doctor_assistant_pairings FROM anon;

-- Grant column-restricted SELECT to anon for public doctor schedule catalog lookup
GRANT SELECT (
  id,
  doctor_id,
  branch_id,
  date,
  start_time,
  end_time,
  status,
  created_at,
  updated_at
) ON TABLE public.doctor_schedules TO anon;

GRANT SELECT (
  id,
  doctor_id,
  branch_id,
  start_date,
  end_date,
  active,
  created_at,
  updated_at
) ON TABLE public.doctor_branch_assignments TO anon;

-- 2. Authenticated role permissions (Full CRUD granted, governed strictly by RLS policies below)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.doctor_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.doctor_branch_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.doctor_assistant_pairings TO authenticated;

-- ---------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY: DOCTOR SCHEDULES
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.doctor_schedules ENABLE ROW LEVEL SECURITY;

-- Clean up any previous policies
DROP POLICY IF EXISTS "Doctor schedules full access policy" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Doctor schedules manage" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Doctor schedules anon read" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Doctor schedules authenticated read" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Doctor schedules public read" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Doctor schedules insert policy" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Doctor schedules update policy" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Doctor schedules delete policy" ON public.doctor_schedules;

-- 3.1 Anon read: Only ACTIVE schedules of active doctors and active branches
CREATE POLICY "Doctor schedules anon read"
  ON public.doctor_schedules
  FOR SELECT
  TO anon
  USING (
    status = 'ACTIVE'
    AND public.is_valid_doctor_schedule(doctor_id, branch_id)
  );

-- 3.2 Authenticated read: Strict role & branch scoping
CREATE POLICY "Doctor schedules authenticated read"
  ON public.doctor_schedules
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR_ASSISTANT')
      AND branch_id::text = public.get_user_branch_id()::text
      AND public.is_active_branch(branch_id)
    )
    OR (
      public.get_user_role() = 'DOCTOR'
      AND (
        branch_id::text = public.get_user_branch_id()::text
        OR doctor_id IN (
          SELECT d.id FROM public.dental_doctors d
          JOIN public.user_accounts ua ON (ua.staff_id = d.id::text OR ua.id::text = d.id::text)
          WHERE ua.auth_user_id = auth.uid() AND ua.active = true
        )
      )
    )
    OR (
      public.get_user_role() = 'PATIENT'
      AND status = 'ACTIVE'
      AND public.is_valid_doctor_schedule(doctor_id, branch_id)
    )
  );

-- 3.3 Authenticated insert: Super Admin (any active branch) or Branch Admin (own branch only)
CREATE POLICY "Doctor schedules insert policy"
  ON public.doctor_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::text = public.get_user_branch_id()::text
      AND public.is_active_branch(branch_id)
      AND public.is_active_doctor(doctor_id)
    )
  );

-- 3.4 Authenticated update: Super Admin or Branch Admin (own branch only)
CREATE POLICY "Doctor schedules update policy"
  ON public.doctor_schedules
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
      AND public.is_active_branch(branch_id)
      AND public.is_active_doctor(doctor_id)
    )
  );

-- 3.5 Authenticated delete: Super Admin or Branch Admin (own branch only)
CREATE POLICY "Doctor schedules delete policy"
  ON public.doctor_schedules
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::text = public.get_user_branch_id()::text
    )
  );

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY: DOCTOR BRANCH ASSIGNMENTS
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.doctor_branch_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor assignments full access policy" ON public.doctor_branch_assignments;
DROP POLICY IF EXISTS "Doctor branch assignments full access policy" ON public.doctor_branch_assignments;
DROP POLICY IF EXISTS "Doctor assignments super admin manage" ON public.doctor_branch_assignments;
DROP POLICY IF EXISTS "Doctor assignments anon read" ON public.doctor_branch_assignments;
DROP POLICY IF EXISTS "Doctor assignments authenticated read" ON public.doctor_branch_assignments;

CREATE POLICY "Doctor assignments anon read"
  ON public.doctor_branch_assignments
  FOR SELECT
  TO anon
  USING (
    active = true
    AND public.is_active_branch(branch_id)
    AND public.is_active_doctor(doctor_id)
  );

CREATE POLICY "Doctor assignments authenticated read"
  ON public.doctor_branch_assignments
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR_ASSISTANT')
      AND branch_id::text = public.get_user_branch_id()::text
      AND public.is_active_branch(branch_id)
    )
    OR (
      public.get_user_role() = 'PATIENT'
      AND active = true
      AND public.is_active_branch(branch_id)
      AND public.is_active_doctor(doctor_id)
    )
  );

CREATE POLICY "Doctor assignments super admin manage"
  ON public.doctor_branch_assignments
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY: DOCTOR ASSISTANT PAIRINGS
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.doctor_assistant_pairings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor assistant pairings full access policy" ON public.doctor_assistant_pairings;
DROP POLICY IF EXISTS "Doctor assistant pairings read" ON public.doctor_assistant_pairings;
DROP POLICY IF EXISTS "Doctor assistant pairings manage" ON public.doctor_assistant_pairings;

CREATE POLICY "Doctor assistant pairings read"
  ON public.doctor_assistant_pairings
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR_ASSISTANT')
      AND assigned_branch_id::text = public.get_user_branch_id()::text
    )
  );

CREATE POLICY "Doctor assistant pairings manage"
  ON public.doctor_assistant_pairings
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND assigned_branch_id::text = public.get_user_branch_id()::text
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND assigned_branch_id::text = public.get_user_branch_id()::text
    )
  );
