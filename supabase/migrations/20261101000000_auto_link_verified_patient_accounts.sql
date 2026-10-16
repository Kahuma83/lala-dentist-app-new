CREATE OR REPLACE FUNCTION public.auto_link_verified_patient_portal_account(target_patient_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  patient_email TEXT;
  matching_auth_user_ids UUID[];
BEGIN
  SELECT LOWER(BTRIM(profile.email))
  INTO patient_email
  FROM public.patient_profiles profile
  WHERE profile.id = target_patient_id;

  IF patient_email IS NULL OR patient_email = '' THEN
    RETURN;
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.patient_profiles profile
    WHERE LOWER(BTRIM(profile.email)) = patient_email
  ) <> 1 THEN
    RETURN;
  END IF;

  SELECT ARRAY_AGG(account.auth_user_id)
  INTO matching_auth_user_ids
  FROM public.user_accounts account
  JOIN auth.users auth_user ON auth_user.id = account.auth_user_id
  WHERE account.role = 'PATIENT'
    AND account.active = TRUE
    AND account.patient_id IS NULL
    AND auth_user.email_confirmed_at IS NOT NULL
    AND auth_user.raw_user_meta_data ->> 'account_type' = 'patient_portal'
    AND LOWER(BTRIM(account.email)) = patient_email
    AND LOWER(BTRIM(auth_user.email)) = patient_email;

  IF COALESCE(ARRAY_LENGTH(matching_auth_user_ids, 1), 0) <> 1 THEN
    RETURN;
  END IF;

  UPDATE public.user_accounts account
  SET patient_id = target_patient_id::TEXT,
      updated_at = NOW()
  WHERE account.auth_user_id = matching_auth_user_ids[1]
    AND account.role = 'PATIENT'
    AND account.active = TRUE
    AND account.patient_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_accounts existing_link
      WHERE existing_link.patient_id = target_patient_id::TEXT
        AND existing_link.auth_user_id <> matching_auth_user_ids[1]
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_patient_portal_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  patient_name TEXT;
  matching_patient_ids UUID[];
BEGIN
  IF NEW.raw_user_meta_data ->> 'account_type' IS DISTINCT FROM 'patient_portal' THEN
    RETURN NEW;
  END IF;

  patient_name := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'name'), '');
  IF patient_name IS NULL OR NEW.email IS NULL THEN
    RAISE EXCEPTION 'Nama dan email wajib diisi untuk akun pasien.';
  END IF;

  IF LOWER(BTRIM(NEW.email)) LIKE '%@laladentist.com'
     OR LOWER(BTRIM(NEW.email)) LIKE '%@laladentist.id' THEN
    RAISE EXCEPTION 'Email internal klinik tidak dapat digunakan untuk akun pasien.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_accounts account
    WHERE account.auth_user_id = NEW.id
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.user_accounts account
      WHERE LOWER(BTRIM(account.email)) = LOWER(BTRIM(NEW.email))
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
      LOWER(BTRIM(NEW.email)),
      LEFT(patient_name, 100),
      'PATIENT',
      TRUE
    )
    ON CONFLICT (auth_user_id) DO NOTHING;
  END IF;

  IF NEW.email_confirmed_at IS NOT NULL THEN
    SELECT ARRAY_AGG(profile.id)
    INTO matching_patient_ids
    FROM public.patient_profiles profile
    WHERE LOWER(BTRIM(profile.email)) = LOWER(BTRIM(NEW.email));

    IF COALESCE(ARRAY_LENGTH(matching_patient_ids, 1), 0) = 1 THEN
      PERFORM public.auto_link_verified_patient_portal_account(matching_patient_ids[1]);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_portal_signup ON auth.users;
CREATE TRIGGER trg_patient_portal_signup
  AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_patient_portal_signup();

REVOKE ALL ON FUNCTION public.handle_patient_portal_signup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_link_verified_patient_portal_account(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_patient_profile_email_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.auto_link_verified_patient_portal_account(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_patient_portal_profile ON public.patient_profiles;
CREATE TRIGGER trg_auto_link_patient_portal_profile
  AFTER INSERT OR UPDATE OF email ON public.patient_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_patient_profile_email_change();

REVOKE ALL ON FUNCTION public.handle_patient_profile_email_change() FROM PUBLIC, anon, authenticated;

SELECT public.auto_link_verified_patient_portal_account(profile.id)
FROM public.patient_profiles profile
WHERE profile.email IS NOT NULL
  AND BTRIM(profile.email) <> '';
