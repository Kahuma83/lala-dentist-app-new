CREATE OR REPLACE FUNCTION public.handle_patient_portal_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  patient_name TEXT;
BEGIN
  IF NEW.raw_user_meta_data ->> 'account_type' IS DISTINCT FROM 'patient_portal' THEN
    RETURN NEW;
  END IF;

  patient_name := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'name'), '');
  IF patient_name IS NULL OR NEW.email IS NULL THEN
    RAISE EXCEPTION 'Nama dan email wajib diisi untuk akun pasien.';
  END IF;

  IF LOWER(NEW.email) LIKE '%@laladentist.com'
     OR LOWER(NEW.email) LIKE '%@laladentist.id' THEN
    RAISE EXCEPTION 'Email internal klinik tidak dapat digunakan untuk akun pasien.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_accounts account
    WHERE LOWER(account.email) = LOWER(NEW.email)
  ) THEN
    RAISE EXCEPTION 'Email ini sudah digunakan sebagai akun klinik.';
  END IF;

  INSERT INTO public.user_accounts (
    auth_user_id,
    username,
    email,
    name,
    role,
    active
  )
  VALUES (
    NEW.id,
    'patient_' || REPLACE(NEW.id::TEXT, '-', ''),
    LOWER(NEW.email),
    LEFT(patient_name, 100),
    'PATIENT',
    TRUE
  )
  ON CONFLICT (auth_user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_portal_signup ON auth.users;
CREATE TRIGGER trg_patient_portal_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_patient_portal_signup();

REVOKE ALL ON FUNCTION public.handle_patient_portal_signup() FROM PUBLIC, anon, authenticated;
