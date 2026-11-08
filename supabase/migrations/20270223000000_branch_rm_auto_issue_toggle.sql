ALTER TABLE public.patient_branch_rm_settings
  ADD COLUMN IF NOT EXISTS auto_issue_enabled BOOLEAN NOT NULL DEFAULT TRUE;

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
      END,
    'auto_issue_enabled', COALESCE(config_row.auto_issue_enabled, TRUE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_patient_branch_rm_settings(
  target_branch_id UUID,
  requested_prefix TEXT,
  requested_pad_digits INTEGER,
  requested_next_number BIGINT,
  requested_auto_issue_enabled BOOLEAN
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
  IF requested_auto_issue_enabled IS NULL THEN
    RAISE EXCEPTION 'Status penerbitan RM otomatis wajib ditentukan.';
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
    'next_number', next_number::TEXT,
    'auto_issue_enabled', auto_issue_enabled
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
    auto_issue_enabled,
    updated_by,
    updated_at
  )
  VALUES (
    target_branch_id,
    clean_prefix,
    requested_pad_digits,
    requested_next_number,
    requested_auto_issue_enabled,
    auth.uid(),
    timezone('utc'::TEXT, now())
  )
  ON CONFLICT (branch_id) DO UPDATE
  SET prefix = EXCLUDED.prefix,
      pad_digits = EXCLUDED.pad_digits,
      next_number = EXCLUDED.next_number,
      auto_issue_enabled = EXCLUDED.auto_issue_enabled,
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
      'next_number', requested_next_number::TEXT,
      'auto_issue_enabled', requested_auto_issue_enabled
    )
  );

  RETURN public.get_patient_branch_rm_settings(target_branch_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_patient_branch_rm_settings(UUID, TEXT, INTEGER, BIGINT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_patient_branch_rm_settings(UUID, TEXT, INTEGER, BIGINT, BOOLEAN) TO authenticated;

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

  IF EXISTS (
    SELECT 1
    FROM public.patient_branch_rm_settings setting
    WHERE setting.branch_id = NEW.branch_id
      AND setting.auto_issue_enabled = FALSE
  ) THEN
    NEW.patient_id := target_patient_id;
    RETURN NEW;
  END IF;

  PERFORM public.ensure_patient_medical_record_number(target_patient_id, NEW.branch_id);
  NEW.patient_id := target_patient_id;
  RETURN NEW;
END;
$$;
