CREATE OR REPLACE FUNCTION public.protect_patient_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_super_admin() THEN
    NEW.updated_at = timezone('utc'::TEXT, now());
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Identity tampering rejected: id is immutable.';
  END IF;

  IF NEW.medical_record_number IS DISTINCT FROM OLD.medical_record_number
     AND NOT EXISTS (
       SELECT 1
       FROM public.patient_branch_medical_records record
       WHERE record.patient_id = OLD.id
         AND UPPER(BTRIM(record.medical_record_number)) = UPPER(BTRIM(NEW.medical_record_number))
         AND (
           record.branch_id = OLD.registered_branch_id
           OR (
             OLD.registered_branch_id IS NULL
             AND NULLIF(BTRIM(OLD.medical_record_number), '') IS NULL
           )
         )
         AND public.get_user_role() = 'BRANCH_ADMIN'
         AND public.user_can_access_branch(record.branch_id)
     ) THEN
    RAISE EXCEPTION 'Medical record number tampering rejected: medical record number changes must use the authorized branch RM workflow.';
  END IF;

  IF NEW.internal_patient_code IS DISTINCT FROM OLD.internal_patient_code
     AND NOT EXISTS (
       SELECT 1
       FROM public.patient_branch_medical_records record
       JOIN public.dental_branches branch ON branch.id = record.branch_id
       WHERE record.patient_id = OLD.id
         AND public.format_internal_patient_code(
           branch.branch_code,
           record.medical_record_number
         ) = NEW.internal_patient_code
         AND (
           (OLD.internal_patient_code IS NULL AND (
             OLD.registered_branch_id IS NULL
             OR OLD.registered_branch_id = record.branch_id
           ))
           OR (
             OLD.internal_patient_code IS NOT NULL
             AND OLD.registered_branch_id = record.branch_id
             AND NEW.medical_record_number = record.medical_record_number
           )
         )
         AND public.get_user_role() = 'BRANCH_ADMIN'
         AND public.user_can_access_branch(record.branch_id)
     ) THEN
    RAISE EXCEPTION 'Internal patient code is immutable.';
  END IF;

  IF NEW.registered_branch_id IS DISTINCT FROM OLD.registered_branch_id THEN
    RAISE EXCEPTION 'Branch lineage tampering rejected: registered_branch_id modification is restricted to SUPER_ADMIN.';
  END IF;

  NEW.updated_at = timezone('utc'::TEXT, now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_patient_branch_medical_record_number(
  target_patient_id UUID,
  target_branch_id UUID,
  requested_rm TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  clean_rm TEXT := NULLIF(BTRIM(requested_rm), '');
  patient_registered_branch UUID;
  old_rm TEXT;
  target_branch_code TEXT;
BEGIN
  IF auth.uid() IS NULL
     OR (
       NOT COALESCE(public.is_super_admin(), FALSE)
       AND (
         COALESCE(public.get_user_role(), '') <> 'BRANCH_ADMIN'
         OR NOT COALESCE(public.user_can_access_branch(target_branch_id), FALSE)
       )
     ) THEN
    RAISE EXCEPTION 'Akses mengubah No. RM ditolak untuk cabang ini.'
      USING ERRCODE = '42501';
  END IF;

  IF clean_rm IS NULL OR LENGTH(clean_rm) > 50 THEN
    RAISE EXCEPTION 'No. RM wajib diisi dan maksimal 50 karakter.';
  END IF;

  SELECT profile.registered_branch_id
  INTO patient_registered_branch
  FROM public.patient_profiles profile
  WHERE profile.id = target_patient_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil pasien tidak ditemukan.';
  END IF;

  SELECT branch.branch_code
  INTO target_branch_code
  FROM public.dental_branches branch
  WHERE branch.id = target_branch_id;
  IF target_branch_code IS NULL THEN
    RAISE EXCEPTION 'Cabang tidak ditemukan atau belum memiliki kode cabang.';
  END IF;

  SELECT record.medical_record_number
  INTO old_rm
  FROM public.patient_branch_medical_records record
  WHERE record.patient_id = target_patient_id
    AND record.branch_id = target_branch_id
  FOR UPDATE;

  IF old_rm IS NULL THEN
    RETURN public.register_patient_branch_medical_record_number(
      target_patient_id,
      target_branch_id,
      clean_rm
    );
  END IF;

  IF UPPER(BTRIM(old_rm)) = UPPER(clean_rm) THEN
    RETURN old_rm;
  END IF;

  BEGIN
    UPDATE public.patient_branch_medical_records
    SET medical_record_number = clean_rm
    WHERE patient_id = target_patient_id
      AND branch_id = target_branch_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'No. RM "%" sudah digunakan pasien lain di cabang ini.', clean_rm
        USING ERRCODE = '23505';
  END;

  IF patient_registered_branch = target_branch_id THEN
    BEGIN
      UPDATE public.patient_profiles
      SET medical_record_number = clean_rm,
          internal_patient_code = public.format_internal_patient_code(target_branch_code, clean_rm),
          updated_at = timezone('utc'::TEXT, now())
      WHERE id = target_patient_id;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'Kode pasien hasil perubahan No. RM sudah digunakan. Periksa kode cabang dan data pasien.'
          USING ERRCODE = '23505';
    END;
  END IF;

  RETURN clean_rm;
END;
$$;

REVOKE ALL ON FUNCTION public.update_patient_branch_medical_record_number(UUID, UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_patient_branch_medical_record_number(UUID, UUID, TEXT)
  TO authenticated;
