BEGIN;

DROP POLICY IF EXISTS "Doctors read treatment branch shift assignments"
  ON public.staff_shift_assignments;
CREATE POLICY "Doctors read treatment branch shift assignments"
  ON public.staff_shift_assignments
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'DOCTOR'
    AND public.user_can_manage_treatment_branch(branch_id)
  );

DROP POLICY IF EXISTS "Doctors read treatment branch work shifts"
  ON public.work_shifts;
CREATE POLICY "Doctors read treatment branch work shifts"
  ON public.work_shifts
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'DOCTOR'
    AND public.user_can_manage_treatment_branch(branch_id)
  );

COMMIT;
