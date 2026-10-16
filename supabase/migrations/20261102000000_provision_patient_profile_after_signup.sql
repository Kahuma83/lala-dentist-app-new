CREATE OR REPLACE FUNCTION public.handle_patient_portal_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  patient_name TEXT;
  patient_phone TEXT;
  patient_address TEXT;
  patient_birth_date DATE;
  patient_gender TEXT;
  matching_patient_ids UUID[];
  created_patient_id UUID;
  next_medical_record_number BIGINT;
BEGIN
  IF NEW.raw_user_meta_data ->> 'account_type' IS DISTINCT FROM 'patient_portal' THEN
    RETURN NEW;
  END IF;

  patient_name := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'name'), '');
  IF patient_name IS NULL OR NEW.email IS NULL OR LENGTH(BTRIM(NEW.email)) > 100 THEN
    RAISE EXCEPTION 'Nama wajib diisi dan email harus memiliki maksimal 100 karakter.';
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

  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ARRAY_AGG(profile.id)
  INTO matching_patient_ids
  FROM public.patient_profiles profile
  WHERE LOWER(BTRIM(profile.email)) = LOWER(BTRIM(NEW.email));

  IF COALESCE(ARRAY_LENGTH(matching_patient_ids, 1), 0) = 1 THEN
    PERFORM public.auto_link_verified_patient_portal_account(matching_patient_ids[1]);
    RETURN NEW;
  ELSIF COALESCE(ARRAY_LENGTH(matching_patient_ids, 1), 0) > 1 THEN
    RETURN NEW;
  END IF;

  patient_phone := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'phone'), '');
  patient_address := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'address'), '');
  patient_gender := NEW.raw_user_meta_data ->> 'gender';

  IF patient_phone IS NULL
     OR LENGTH(patient_phone) > 30
     OR patient_address IS NULL
     OR LENGTH(patient_address) > 500
     OR patient_gender IS NULL
     OR patient_gender NOT IN ('L', 'P')
     OR COALESCE(NEW.raw_user_meta_data ->> 'date_of_birth', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN NEW;
  END IF;

  BEGIN
    patient_birth_date := (NEW.raw_user_meta_data ->> 'date_of_birth')::DATE;
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RETURN NEW;
  END;

  IF patient_birth_date > CURRENT_DATE THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.patient_profiles.medical_record_number'));

  LOOP
    SELECT COALESCE(MAX(profile.medical_record_number::BIGINT), 3000) + 1
    INTO next_medical_record_number
    FROM public.patient_profiles profile
    WHERE profile.medical_record_number ~ '^[0-9]{1,18}$';

    INSERT INTO public.patient_profiles (
      medical_record_number,
      name,
      full_name,
      phone,
      email,
      date_of_birth,
      gender,
      address,
      acquisition_source
    )
    VALUES (
      next_medical_record_number::TEXT,
      LEFT(patient_name, 150),
      LEFT(patient_name, 150),
      patient_phone,
      LOWER(BTRIM(NEW.email)),
      patient_birth_date,
      patient_gender,
      patient_address,
      'UNKNOWN'
    )
    ON CONFLICT (medical_record_number) DO NOTHING
    RETURNING id INTO created_patient_id;

    EXIT WHEN created_patient_id IS NOT NULL;
  END LOOP;

  PERFORM public.auto_link_verified_patient_portal_account(created_patient_id);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_patient_portal_signup() FROM PUBLIC, anon, authenticated;
