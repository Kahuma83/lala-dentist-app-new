CREATE OR REPLACE FUNCTION public.enforce_automatic_branch_rm_prefix()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.prefix := '';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_automatic_branch_rm_prefix
  ON public.patient_branch_rm_settings;
CREATE TRIGGER trigger_enforce_automatic_branch_rm_prefix
  BEFORE INSERT OR UPDATE OF prefix
  ON public.patient_branch_rm_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_automatic_branch_rm_prefix();

UPDATE public.patient_branch_rm_settings
SET prefix = ''
WHERE prefix <> '';

REVOKE ALL ON FUNCTION public.enforce_automatic_branch_rm_prefix() FROM PUBLIC, anon, authenticated;
