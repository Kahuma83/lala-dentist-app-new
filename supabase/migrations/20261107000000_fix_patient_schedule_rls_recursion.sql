CREATE OR REPLACE FUNCTION public.doctor_has_active_portal_schedule(p_doctor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.doctor_schedules schedule
    WHERE schedule.doctor_id = p_doctor_id
      AND schedule.status = 'ACTIVE'
      AND public.is_active_branch(schedule.branch_id)
  );
$$;

REVOKE ALL ON FUNCTION public.doctor_has_active_portal_schedule(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_has_active_portal_schedule(UUID) TO authenticated;

DROP POLICY IF EXISTS "Doctors authenticated read" ON public.dental_doctors;

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
      AND active = TRUE
      AND public.doctor_has_active_portal_schedule(id)
    )
  );
