CREATE OR REPLACE FUNCTION public.protect_user_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  internal_patient_link TEXT;
BEGIN
  IF public.is_super_admin() THEN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Privilege escalation rejected: role modification is restricted to SUPER_ADMIN.';
  END IF;

  IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'Identity tampering rejected: auth_user_id is immutable.';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Identity tampering rejected: id is immutable.';
  END IF;

  IF NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
    RAISE EXCEPTION 'Authorization tampering rejected: staff_id modification is restricted to SUPER_ADMIN.';
  END IF;

  IF NEW.patient_id IS DISTINCT FROM OLD.patient_id THEN
    internal_patient_link := txid_current()::TEXT || ':' || OLD.auth_user_id::TEXT;
    IF OLD.patient_id IS NOT NULL
       OR NEW.patient_id IS NULL
       OR NEW.role <> 'PATIENT'
       OR NOT NEW.active
       OR current_setting('app.patient_portal_auto_link', true) IS DISTINCT FROM internal_patient_link THEN
      RAISE EXCEPTION 'Authorization tampering rejected: patient_id modification is restricted to SUPER_ADMIN.';
    END IF;
  END IF;

  IF NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    RAISE EXCEPTION 'Authorization tampering rejected: branch_id modification is restricted to SUPER_ADMIN.';
  END IF;

  IF NEW.active IS DISTINCT FROM OLD.active THEN
    RAISE EXCEPTION 'Status tampering rejected: account active status modification is restricted to SUPER_ADMIN.';
  END IF;

  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_link_verified_patient_portal_account(target_patient_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  patient_email TEXT;
  matching_auth_user_ids UUID[];
  previous_link_marker TEXT;
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

  previous_link_marker := COALESCE(current_setting('app.patient_portal_auto_link', true), '');
  PERFORM set_config(
    'app.patient_portal_auto_link',
    txid_current()::TEXT || ':' || matching_auth_user_ids[1]::TEXT,
    true
  );

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

  PERFORM set_config('app.patient_portal_auto_link', previous_link_marker, true);
END;
$$;

REVOKE ALL ON FUNCTION public.protect_user_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_link_verified_patient_portal_account(UUID) FROM PUBLIC, anon, authenticated;
