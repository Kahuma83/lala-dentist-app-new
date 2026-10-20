BEGIN;

ALTER TABLE public.clinical_medical_records
  ADD COLUMN IF NOT EXISTS odontogram_history JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.capture_clinical_odontogram_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.odontogram_history := '[]'::jsonb;
    RETURN NEW;
  END IF;

  NEW.odontogram_history := COALESCE(OLD.odontogram_history, '[]'::jsonb);
  IF OLD.odontogram IS DISTINCT FROM NEW.odontogram
     AND OLD.odontogram IS NOT NULL
     AND OLD.odontogram <> '[]'::jsonb
     AND OLD.odontogram <> '{}'::jsonb THEN
    NEW.odontogram_history :=
      COALESCE(OLD.odontogram_history, '[]'::jsonb)
      || jsonb_build_array(
        jsonb_build_object(
          'odontogram', OLD.odontogram,
          'changed_at', timezone('utc'::text, now()),
          'changed_by', auth.uid()
        )
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_clinical_odontogram_history
  ON public.clinical_medical_records;
CREATE TRIGGER trg_initialize_clinical_odontogram_history
  BEFORE INSERT ON public.clinical_medical_records
  FOR EACH ROW EXECUTE FUNCTION public.capture_clinical_odontogram_history();
CREATE TRIGGER trg_capture_clinical_odontogram_history
  BEFORE UPDATE OF odontogram, odontogram_history ON public.clinical_medical_records
  FOR EACH ROW EXECUTE FUNCTION public.capture_clinical_odontogram_history();

COMMIT;
