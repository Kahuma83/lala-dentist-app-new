ALTER TABLE public.patient_profiles
  ALTER COLUMN medical_record_number DROP NOT NULL;

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
    NULL,
    LEFT(patient_name, 150),
    LEFT(patient_name, 150),
    patient_phone,
    LOWER(BTRIM(NEW.email)),
    patient_birth_date,
    patient_gender,
    patient_address,
    'UNKNOWN'
  )
  RETURNING id INTO created_patient_id;

  PERFORM public.auto_link_verified_patient_portal_account(created_patient_id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_patient_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_super_admin() THEN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Identity tampering rejected: id is immutable.';
  END IF;

  IF NEW.medical_record_number IS DISTINCT FROM OLD.medical_record_number
     AND NOT (
       COALESCE(BTRIM(OLD.medical_record_number), '') = ''
       AND NEW.medical_record_number IS NOT NULL
       AND BTRIM(NEW.medical_record_number) <> ''
       AND pg_trigger_depth() > 1
     ) THEN
    RAISE EXCEPTION 'Medical record number tampering rejected: medical_record_number is immutable.';
  END IF;

  IF NEW.registered_branch_id IS DISTINCT FROM OLD.registered_branch_id THEN
    RAISE EXCEPTION 'Branch lineage tampering rejected: registered_branch_id modification is restricted to SUPER_ADMIN.';
  END IF;

  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_patient_rm_on_queue_checkin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_patient_id UUID;
BEGIN
  IF NEW.status = 'CANCELLED' THEN
    RETURN NEW;
  END IF;

  target_patient_id := NEW.patient_id;
  IF target_patient_id IS NULL THEN
    SELECT visit.patient_id
    INTO target_patient_id
    FROM public.patient_visits visit
    WHERE visit.id = NEW.visit_id;
  END IF;

  IF target_patient_id IS NULL THEN
    RAISE EXCEPTION 'Check-in antrean tidak memiliki pasien yang valid.';
  END IF;

  PERFORM public.ensure_patient_medical_record_number(target_patient_id);
  NEW.patient_id := target_patient_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_patient_medical_record_number(target_patient_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_rm TEXT;
  latest_rm TEXT;
  latest_parts TEXT[];
  next_number BIGINT;
  next_rm TEXT;
  updated_rm TEXT;
BEGIN
  SELECT profile.medical_record_number
  INTO current_rm
  FROM public.patient_profiles profile
  WHERE profile.id = target_patient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil pasien % tidak ditemukan; RM tidak dapat diterbitkan.', target_patient_id;
  END IF;

  IF current_rm IS NOT NULL AND BTRIM(current_rm) <> '' THEN
    RETURN current_rm;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.patient_profiles.medical_record_number'));

  LOOP
    SELECT profile.medical_record_number
    INTO latest_rm
    FROM public.patient_profiles profile
    WHERE profile.medical_record_number ~ '[0-9]+$'
      AND LENGTH((regexp_match(profile.medical_record_number, '^(.*?)([0-9]+)$'))[2]) <= 18
    ORDER BY (regexp_match(profile.medical_record_number, '^(.*?)([0-9]+)$'))[2]::BIGINT DESC,
             profile.medical_record_number DESC
    LIMIT 1;

    IF latest_rm IS NULL THEN
      next_number := 3000;
      next_rm := next_number::TEXT;
    ELSE
      latest_parts := regexp_match(latest_rm, '^(.*?)([0-9]+)$');
      next_number := latest_parts[2]::BIGINT + 1;
      IF LENGTH(next_number::TEXT) > 18 THEN
        RAISE EXCEPTION 'Batas nomor RM otomatis telah tercapai; hubungi administrator.';
      END IF;
      next_rm := latest_parts[1] ||
        CASE
          WHEN LENGTH(latest_parts[2]) > 1 AND LEFT(latest_parts[2], 1) = '0'
            THEN LPAD(next_number::TEXT, LENGTH(latest_parts[2]), '0')
          ELSE next_number::TEXT
        END;
    END IF;

    updated_rm := NULL;
    BEGIN
      UPDATE public.patient_profiles
      SET medical_record_number = next_rm
      WHERE id = target_patient_id
        AND (medical_record_number IS NULL OR BTRIM(medical_record_number) = '')
      RETURNING medical_record_number INTO updated_rm;
    EXCEPTION
      WHEN unique_violation THEN
        CONTINUE;
    END;

    IF updated_rm IS NOT NULL THEN
      RETURN updated_rm;
    END IF;

    SELECT profile.medical_record_number
    INTO current_rm
    FROM public.patient_profiles profile
    WHERE profile.id = target_patient_id;

    IF current_rm IS NOT NULL AND BTRIM(current_rm) <> '' THEN
      RETURN current_rm;
    END IF;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS queue_items_issue_patient_rm_on_checkin ON public.queue_items;
CREATE TRIGGER queue_items_issue_patient_rm_on_checkin
  BEFORE INSERT ON public.queue_items
  FOR EACH ROW
  EXECUTE FUNCTION public.issue_patient_rm_on_queue_checkin();

REVOKE ALL ON FUNCTION public.handle_patient_portal_signup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_patient_profile_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_patient_rm_on_queue_checkin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_patient_medical_record_number(UUID) FROM PUBLIC, anon, authenticated;
