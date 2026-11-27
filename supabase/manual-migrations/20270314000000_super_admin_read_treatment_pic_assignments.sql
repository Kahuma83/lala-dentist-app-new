BEGIN;

GRANT SELECT ON public.treatment_visit_assistant_assignments TO authenticated;

DROP POLICY IF EXISTS "Super Admin reads treatment PIC assignments"
  ON public.treatment_visit_assistant_assignments;
CREATE POLICY "Super Admin reads treatment PIC assignments"
  ON public.treatment_visit_assistant_assignments
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

COMMIT;
