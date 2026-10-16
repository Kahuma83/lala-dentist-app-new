-- =====================================================================
-- PRODUCTION MIGRATION: HARDENED DOCTOR CATALOG, ASSIGNMENTS & SCHEDULES
-- Project Ref: gvkheuvywuskwumyrdip
-- File: supabase/migrations/20261001000000_harden_doctor_catalog_rls.sql
-- Self-Contained: Includes base auth helpers, catalog helpers, column grants & RLS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. FOUNDATIONAL AUTH & ROLE SECURITY FUNCTIONS (SELF-CONTAINED)
-- ---------------------------------------------------------------------

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

  -- 2. Session check fallback: If the current authenticated user's email is a known superadmin email,
  -- treat them as super admin temporarily for this request context!
  IF auth.uid() IS NOT NULL AND LOWER(TRIM(auth.jwt() ->> 'email')) IN ('superadmin@laladentist.id', 'superadmin@laladentist.com', 'nonapresident@gmail.com') THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
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
  -- Check user_accounts
  SELECT role INTO v_role
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;

  -- Self-healing fallback if not found but is a superadmin email
  IF v_role IS NULL AND auth.uid() IS NOT NULL AND auth.jwt() ->> 'email' IN ('superadmin@laladentist.id', 'superadmin@laladentist.com', 'nonapresident@gmail.com') THEN
    PERFORM public.is_super_admin();
    v_role := 'SUPER_ADMIN';
  END IF;

  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_branch_id VARCHAR;
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
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_patient_id VARCHAR;
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

CREATE OR REPLACE FUNCTION public.get_user_staff_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  SELECT s.id INTO v_staff_id
  FROM public.staff s
  JOIN public.user_accounts ua ON ua.id = s.user_account_id
  WHERE ua.auth_user_id = auth.uid() AND ua.active = true
  LIMIT 1;
  RETURN v_staff_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 1. DOCTOR & SCHEDULE SECURITY DEFINER HELPERS (RECURSION-FREE)
-- ---------------------------------------------------------------------

-- 1.1 Cek apakah branch aktif
CREATE OR REPLACE FUNCTION public.is_active_branch(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_branch_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.dental_branches 
    WHERE id = p_branch_id AND is_active = true
  );
END;
$$;

-- 1.2 Cek apakah dokter aktif
CREATE OR REPLACE FUNCTION public.is_active_doctor(p_doctor_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_doctor_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.dental_doctors 
    WHERE id = p_doctor_id AND active = true
  );
END;
$$;

-- 1.3 Cek apakah dokter memiliki tautan cabang aktif
CREATE OR REPLACE FUNCTION public.doctor_has_active_branch_link(p_doctor_id UUID, p_assigned_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_doctor_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Cek assigned branch langsung (harus aktif)
  IF p_assigned_branch_id IS NOT NULL AND public.is_active_branch(p_assigned_branch_id) THEN
    RETURN TRUE;
  END IF;

  -- Cek assignment aktif ke cabang yang aktif
  RETURN EXISTS (
    SELECT 1 
    FROM public.doctor_branch_assignments dba
    JOIN public.dental_branches b ON b.id = dba.branch_id
    WHERE dba.doctor_id = p_doctor_id 
      AND dba.active = true 
      AND b.is_active = true
  );
END;
$$;

-- 1.4 Cek apakah dokter terhubung ke target branch (target branch WAJIB aktif)
CREATE OR REPLACE FUNCTION public.doctor_is_assigned_to_branch(p_doctor_id UUID, p_assigned_branch_id UUID, p_target_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_doctor_id IS NULL OR p_target_branch_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Target branch WAJIB aktif
  IF NOT public.is_active_branch(p_target_branch_id) THEN
    RETURN FALSE;
  END IF;

  -- Dokter terdaftar di branch tersebut
  IF p_assigned_branch_id = p_target_branch_id THEN
    RETURN TRUE;
  END IF;

  -- Atau memiliki assignment aktif di branch tersebut
  RETURN EXISTS (
    SELECT 1 
    FROM public.doctor_branch_assignments dba 
    WHERE dba.doctor_id = p_doctor_id 
      AND dba.branch_id = p_target_branch_id 
      AND dba.active = true
  );
END;
$$;

-- 1.5 Cek validitas jadwal dokter
CREATE OR REPLACE FUNCTION public.is_valid_doctor_schedule(p_doctor_id UUID, p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_doctor_id IS NULL OR p_branch_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT public.is_active_branch(p_branch_id) THEN
    RETURN FALSE;
  END IF;

  IF NOT public.is_active_doctor(p_doctor_id) THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.dental_doctors d
    WHERE d.id = p_doctor_id AND d.assigned_branch_id = p_branch_id
  ) OR EXISTS (
    SELECT 1 FROM public.doctor_branch_assignments dba
    WHERE dba.doctor_id = p_doctor_id AND dba.branch_id = p_branch_id AND dba.active = true
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 2. FUNCTION PERMISSIONS
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_branch_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_patient_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_staff_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_branch(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_doctor(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.doctor_has_active_branch_link(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.doctor_is_assigned_to_branch(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_valid_doctor_schedule(UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_branch_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_patient_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_staff_id() TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_active_branch(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_doctor(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_has_active_branch_link(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_is_assigned_to_branch(UUID, UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_doctor_schedule(UUID, UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. SCHEMA EXTENSIONS & COLUMN PRIVILEGES FOR ANON
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.dental_doctors ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE IF EXISTS public.dental_doctors ADD COLUMN IF NOT EXISTS title VARCHAR(100);

REVOKE ALL ON TABLE public.dental_doctors FROM anon;
REVOKE ALL ON TABLE public.doctor_branch_assignments FROM anon;
REVOKE ALL ON TABLE public.doctor_schedules FROM anon;

GRANT SELECT (
  id,
  doctor_code,
  name,
  full_name,
  specialization,
  title,
  str,
  sip,
  assigned_branch_id,
  active,
  avatar_url,
  created_at,
  updated_at
) ON TABLE public.dental_doctors TO anon;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dental_doctors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.doctor_branch_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.doctor_schedules TO authenticated;

-- ---------------------------------------------------------------------
-- 4. ENABLE ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.dental_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.doctor_branch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.doctor_schedules ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 5. CLEAN UP PREVIOUS POLICIES
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Doctors public read" ON public.dental_doctors;
DROP POLICY IF EXISTS "Doctors anon read" ON public.dental_doctors;
DROP POLICY IF EXISTS "Doctors authenticated read" ON public.dental_doctors;
DROP POLICY IF EXISTS "Doctors super admin manage" ON public.dental_doctors;

DROP POLICY IF EXISTS "Doctor assignments public read" ON public.doctor_branch_assignments;
DROP POLICY IF EXISTS "Doctor assignments anon read" ON public.doctor_branch_assignments;
DROP POLICY IF EXISTS "Doctor assignments authenticated read" ON public.doctor_branch_assignments;
DROP POLICY IF EXISTS "Doctor assignments super admin manage" ON public.doctor_branch_assignments;

DROP POLICY IF EXISTS "Doctor schedules public read" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Doctor schedules anon read" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Doctor schedules authenticated read" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Doctor schedules manage" ON public.doctor_schedules;

-- ---------------------------------------------------------------------
-- 6. POLICIES: DENTAL DOCTORS
-- ---------------------------------------------------------------------
CREATE POLICY "Doctors anon read"
  ON public.dental_doctors
  FOR SELECT
  TO anon
  USING (
    active = true 
    AND public.doctor_has_active_branch_link(id, assigned_branch_id)
  );

CREATE POLICY "Doctors authenticated read"
  ON public.dental_doctors
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR_ASSISTANT')
      AND public.doctor_is_assigned_to_branch(id, assigned_branch_id, public.get_user_branch_id())
    )
    OR (
      public.get_user_role() = 'DOCTOR'
      AND staff_id = public.get_user_staff_id()
    )
    OR (
      public.get_user_role() = 'PATIENT'
      AND active = true
      AND public.doctor_has_active_branch_link(id, assigned_branch_id)
    )
  );

CREATE POLICY "Doctors super admin manage"
  ON public.dental_doctors
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------
-- 7. POLICIES: DOCTOR BRANCH ASSIGNMENTS
-- ---------------------------------------------------------------------
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
      AND branch_id = public.get_user_branch_id()
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
-- 8. POLICIES: DOCTOR SCHEDULES
-- ---------------------------------------------------------------------
CREATE POLICY "Doctor schedules anon read"
  ON public.doctor_schedules
  FOR SELECT
  TO anon
  USING (
    status = 'ACTIVE'
    AND public.is_valid_doctor_schedule(doctor_id, branch_id)
  );

CREATE POLICY "Doctor schedules authenticated read"
  ON public.doctor_schedules
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR_ASSISTANT')
      AND branch_id = public.get_user_branch_id()
      AND public.is_active_branch(branch_id)
    )
    OR (
      public.get_user_role() = 'PATIENT'
      AND status = 'ACTIVE'
      AND public.is_valid_doctor_schedule(doctor_id, branch_id)
    )
  );

CREATE POLICY "Doctor schedules manage"
  ON public.doctor_schedules
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN' 
      AND branch_id = public.get_user_branch_id()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN' 
      AND branch_id = public.get_user_branch_id()
    )
  );
