CREATE OR REPLACE FUNCTION public.prevent_doctor_recipe_submissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.submitted_by_role_snapshot = 'DOCTOR' THEN
    RAISE EXCEPTION 'Doctors may review recipe changes but cannot submit them.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_doctor_recipe_submissions
  ON public.inventory_treatment_recipe_changes;

CREATE TRIGGER prevent_doctor_recipe_submissions
  BEFORE INSERT ON public.inventory_treatment_recipe_changes
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_doctor_recipe_submissions();

REVOKE ALL ON FUNCTION public.prevent_doctor_recipe_submissions() FROM PUBLIC, anon, authenticated;
