CREATE TABLE IF NOT EXISTS public.patient_branch_rm_settings (
  branch_id UUID PRIMARY KEY REFERENCES public.dental_branches(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT '',
  pad_digits INTEGER NOT NULL DEFAULT 0 CHECK (pad_digits BETWEEN 0 AND 18),
  next_number BIGINT NOT NULL DEFAULT 3000 CHECK (next_number > 0),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  CHECK (LENGTH(prefix) <= 20),
  CHECK (prefix !~ '[0-9]')
);

CREATE TABLE IF NOT EXISTS public.patient_branch_rm_settings_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_settings JSONB,
  new_settings JSONB NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now())
);

ALTER TABLE public.patient_branch_rm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_branch_rm_settings_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_patient_branch_rm_settings(target_branch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  config_row public.patient_branch_rm_settings%ROWTYPE;
  branch_highest_number BIGINT;
  effective_next_number BIGINT;
BEGIN
  IF NOT public.is_super_admin()
     AND (
       COALESCE(public.get_user_role(), '') <> 'BRANCH_ADMIN'
       OR NOT public.user_can_access_branch(target_branch_id)
     ) THEN
    RAISE EXCEPTION 'Anda tidak berwenang melihat pengaturan RM cabang ini.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dental_branches WHERE id = target_branch_id) THEN
    RAISE EXCEPTION 'Cabang tidak ditemukan.';
  END IF;

  SELECT *
  INTO config_row
  FROM public.patient_branch_rm_settings
  WHERE branch_id = target_branch_id;

  SELECT MAX((regexp_match(record.medical_record_number, '([0-9]+)$'))[1]::BIGINT)
  INTO branch_highest_number
  FROM public.patient_branch_medical_records record
  WHERE record.branch_id = target_branch_id
    AND record.medical_record_number ~ '[0-9]+$'
    AND LENGTH((regexp_match(record.medical_record_number, '([0-9]+)$'))[1]) <= 18;

  effective_next_number := GREATEST(
    COALESCE(config_row.next_number, 3000),
    COALESCE(branch_highest_number + 1, 1)
  );

  RETURN jsonb_build_object(
    'branch_id', target_branch_id,
    'prefix', COALESCE(config_row.prefix, ''),
    'pad_digits', COALESCE(config_row.pad_digits, 0),
    'next_number', effective_next_number::TEXT,
    'highest_number', branch_highest_number::TEXT,
    'preview_rm', COALESCE(config_row.prefix, '') ||
      CASE
        WHEN COALESCE(config_row.pad_digits, 0) > 0
          THEN LPAD(effective_next_number::TEXT, COALESCE(config_row.pad_digits, 0), '0')
        ELSE effective_next_number::TEXT
      END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_patient_branch_rm_settings(
  target_branch_id UUID,
  requested_prefix TEXT,
  requested_pad_digits INTEGER,
  requested_next_number BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  clean_prefix TEXT := BTRIM(COALESCE(requested_prefix, ''));
  branch_highest_number BIGINT;
  previous_settings JSONB;
BEGIN
  IF NOT public.is_super_admin()
     AND (
       COALESCE(public.get_user_role(), '') <> 'BRANCH_ADMIN'
       OR NOT public.user_can_access_branch(target_branch_id)
     ) THEN
    RAISE EXCEPTION 'Hanya admin cabang yang berwenang dapat mengubah pengaturan RM cabang ini.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dental_branches WHERE id = target_branch_id) THEN
    RAISE EXCEPTION 'Cabang tidak ditemukan.';
  END IF;

  IF LENGTH(clean_prefix) > 20 OR clean_prefix ~ '[0-9]' THEN
    RAISE EXCEPTION 'Prefix RM maksimal 20 karakter dan tidak boleh berisi angka.';
  END IF;
  IF requested_pad_digits IS NULL OR requested_pad_digits < 0 OR requested_pad_digits > 18 THEN
    RAISE EXCEPTION 'Jumlah digit padding harus antara 0 sampai 18.';
  END IF;
  IF requested_next_number IS NULL
     OR requested_next_number < 1
     OR LENGTH(requested_next_number::TEXT) > 18 THEN
    RAISE EXCEPTION 'Nomor berikutnya harus 1 sampai 18 digit.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.patient_branch_medical_records:' || target_branch_id::TEXT));

  SELECT MAX((regexp_match(record.medical_record_number, '([0-9]+)$'))[1]::BIGINT)
  INTO branch_highest_number
  FROM public.patient_branch_medical_records record
  WHERE record.branch_id = target_branch_id
    AND record.medical_record_number ~ '[0-9]+$'
    AND LENGTH((regexp_match(record.medical_record_number, '([0-9]+)$'))[1]) <= 18;

  IF branch_highest_number IS NOT NULL AND requested_next_number <= branch_highest_number THEN
    RAISE EXCEPTION 'Nomor berikutnya tidak boleh sama dengan atau lebih kecil dari No. RM tertinggi (%) di cabang ini.',
      COALESCE(branch_highest_number, 2999);
  END IF;

  SELECT jsonb_build_object(
    'prefix', prefix,
    'pad_digits', pad_digits,
    'next_number', next_number::TEXT
  )
  INTO previous_settings
  FROM public.patient_branch_rm_settings
  WHERE branch_id = target_branch_id
  FOR UPDATE;

  INSERT INTO public.patient_branch_rm_settings (
    branch_id,
    prefix,
    pad_digits,
    next_number,
    updated_by,
    updated_at
  )
  VALUES (
    target_branch_id,
    clean_prefix,
    requested_pad_digits,
    requested_next_number,
    auth.uid(),
    timezone('utc'::TEXT, now())
  )
  ON CONFLICT (branch_id) DO UPDATE
  SET prefix = EXCLUDED.prefix,
      pad_digits = EXCLUDED.pad_digits,
      next_number = EXCLUDED.next_number,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at;

  INSERT INTO public.patient_branch_rm_settings_audit (
    branch_id,
    actor_id,
    previous_settings,
    new_settings
  )
  VALUES (
    target_branch_id,
    auth.uid(),
    previous_settings,
    jsonb_build_object(
      'prefix', clean_prefix,
      'pad_digits', requested_pad_digits,
      'next_number', requested_next_number::TEXT
    )
  );

  RETURN public.get_patient_branch_rm_settings(target_branch_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_patient_medical_record_number(
  target_patient_id UUID,
  target_branch_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_rm TEXT;
  registered_branch UUID;
  current_internal_code TEXT;
  target_branch_code TEXT;
  assigned_rm TEXT;
  next_number BIGINT;
  branch_highest_number BIGINT;
  requested_next_number BIGINT;
  rm_prefix TEXT := '';
  rm_pad_digits INTEGER := 0;
  next_rm TEXT;
  generated_internal_code TEXT;
BEGIN
  SELECT profile.medical_record_number,
         profile.registered_branch_id,
         profile.internal_patient_code
  INTO current_rm, registered_branch, current_internal_code
  FROM public.patient_profiles profile
  WHERE profile.id = target_patient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil pasien % tidak ditemukan; RM tidak dapat diterbitkan.', target_patient_id;
  END IF;
  IF target_branch_id IS NULL THEN
    RAISE EXCEPTION 'Cabang check-in wajib ditentukan sebelum menerbitkan RM.';
  END IF;

  SELECT branch.branch_code
  INTO target_branch_code
  FROM public.dental_branches branch
  WHERE branch.id = target_branch_id;
  IF target_branch_code IS NULL THEN
    RAISE EXCEPTION 'Cabang check-in tidak ditemukan atau belum memiliki kode cabang.';
  END IF;

  SELECT record.medical_record_number
  INTO assigned_rm
  FROM public.patient_branch_medical_records record
  WHERE record.patient_id = target_patient_id
    AND record.branch_id = target_branch_id;
  IF assigned_rm IS NOT NULL THEN
    RETURN assigned_rm;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.patient_branch_medical_records:' || target_branch_id::TEXT));

  IF registered_branch = target_branch_id
     AND NULLIF(BTRIM(current_rm), '') IS NOT NULL THEN
    next_rm := BTRIM(current_rm);
  ELSE
    SELECT setting.prefix, setting.pad_digits, setting.next_number
    INTO rm_prefix, rm_pad_digits, requested_next_number
    FROM public.patient_branch_rm_settings setting
    WHERE setting.branch_id = target_branch_id;

    SELECT MAX((regexp_match(record.medical_record_number, '([0-9]+)$'))[1]::BIGINT)
    INTO branch_highest_number
    FROM public.patient_branch_medical_records record
    WHERE record.branch_id = target_branch_id
      AND record.medical_record_number ~ '[0-9]+$'
      AND LENGTH((regexp_match(record.medical_record_number, '([0-9]+)$'))[1]) <= 18;

    next_number := GREATEST(
      COALESCE(requested_next_number, 3000),
      COALESCE(branch_highest_number + 1, 1)
    );
    IF LENGTH(next_number::TEXT) > 18 OR LENGTH((next_number + 1)::TEXT) > 18 THEN
      RAISE EXCEPTION 'Batas nomor RM otomatis cabang telah tercapai; hubungi administrator.';
    END IF;
    next_rm := COALESCE(rm_prefix, '') ||
      CASE
        WHEN COALESCE(rm_pad_digits, 0) > 0
          THEN LPAD(next_number::TEXT, rm_pad_digits, '0')
        ELSE next_number::TEXT
      END;
  END IF;

  generated_internal_code := COALESCE(
    current_internal_code,
    public.format_internal_patient_code(target_branch_code, next_rm)
  );

  INSERT INTO public.patient_branch_medical_records (
    patient_id,
    branch_id,
    medical_record_number
  )
  VALUES (target_patient_id, target_branch_id, next_rm);

  UPDATE public.patient_profiles
  SET medical_record_number = CASE
        WHEN NULLIF(BTRIM(medical_record_number), '') IS NULL THEN next_rm
        ELSE medical_record_number
      END,
      internal_patient_code = COALESCE(internal_patient_code, generated_internal_code)
  WHERE id = target_patient_id;

  IF next_rm ~ '[0-9]+$'
     AND LENGTH((regexp_match(next_rm, '([0-9]+)$'))[1]) <= 18 THEN
    INSERT INTO public.patient_branch_rm_settings (
      branch_id,
      prefix,
      pad_digits,
      next_number,
      updated_at
    )
    VALUES (
      target_branch_id,
      COALESCE(rm_prefix, ''),
      COALESCE(rm_pad_digits, 0),
      (regexp_match(next_rm, '([0-9]+)$'))[1]::BIGINT + 1,
      timezone('utc'::TEXT, now())
    )
    ON CONFLICT (branch_id) DO UPDATE
    SET next_number = GREATEST(
          public.patient_branch_rm_settings.next_number,
          EXCLUDED.next_number
        ),
        updated_by = NULL,
        updated_at = timezone('utc'::TEXT, now());
  END IF;

  RETURN next_rm;
END;
$$;

REVOKE ALL ON TABLE public.patient_branch_rm_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.patient_branch_rm_settings_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_patient_branch_rm_settings(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_patient_branch_rm_settings(UUID, TEXT, INTEGER, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_branch_rm_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_patient_branch_rm_settings(UUID, TEXT, INTEGER, BIGINT) TO authenticated;
