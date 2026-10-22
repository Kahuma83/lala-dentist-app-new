ALTER TABLE public.dental_branches
  ADD COLUMN IF NOT EXISTS branch_code VARCHAR(10);

UPDATE public.dental_branches
SET branch_code = CASE
  WHEN UPPER(name) LIKE '%GEBANG%' THEN 'GEB'
  ELSE COALESCE(NULLIF(BTRIM(branch_code), ''), public.get_invoice_branch_code(id))
END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.dental_branches
    WHERE branch_code IS NULL OR BTRIM(branch_code) = ''
  ) THEN
    RAISE EXCEPTION 'Setiap cabang harus memiliki kode cabang sebelum migrasi RM lokal.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.dental_branches
    GROUP BY UPPER(BTRIM(branch_code))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Kode cabang harus unik. Periksa dental_branches.branch_code sebelum migrasi RM lokal.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.patient_profiles profile
    WHERE NULLIF(BTRIM(profile.medical_record_number), '') IS NOT NULL
      AND profile.registered_branch_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.queue_items queue_item
        WHERE queue_item.patient_id = profile.id
          AND queue_item.status <> 'CANCELLED'
      )
      AND (
        SELECT COUNT(DISTINCT branch_id)
        FROM (
          SELECT visit.branch_id
          FROM public.patient_visits visit
          WHERE visit.patient_id = profile.id
          UNION
          SELECT booking.branch_id
          FROM public.bookings booking
          WHERE booking.patient_id = profile.id
        ) patient_branches
      ) <> 1
  ) THEN
      RAISE EXCEPTION 'Ada pasien dengan No. RM lama yang cabangnya tidak dapat ditentukan dengan aman. Tetapkan registered_branch_id atau tinjau data kunjungan sebelum migrasi.';
  END IF;

  IF EXISTS (
      SELECT 1
      FROM public.patient_profiles profile
      WHERE NULLIF(BTRIM(profile.medical_record_number), '') IS NOT NULL
        AND profile.registered_branch_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.queue_items queue_item
          WHERE queue_item.patient_id = profile.id
            AND queue_item.status <> 'CANCELLED'
            AND queue_item.branch_id <> profile.registered_branch_id
            AND queue_item.arrival_at = (
              SELECT MIN(first_queue.arrival_at)
              FROM public.queue_items first_queue
              WHERE first_queue.patient_id = profile.id
                AND first_queue.status <> 'CANCELLED'
            )
        )
  ) THEN
      RAISE EXCEPTION 'Cabang pertama check-in berbeda dari cabang pendaftaran pada profil dengan RM lama. Tinjau dan tetapkan cabang asal RM sebelum migrasi.';
  END IF;
END;
$$;

UPDATE public.patient_profiles profile
SET registered_branch_id = COALESCE(
  (
      SELECT queue_item.branch_id
      FROM public.queue_items queue_item
      WHERE queue_item.patient_id = profile.id
        AND queue_item.status <> 'CANCELLED'
      ORDER BY queue_item.arrival_at, queue_item.id
      LIMIT 1
  ),
  (
      SELECT MIN(patient_branches.branch_id::TEXT)::UUID
      FROM (
        SELECT visit.branch_id
        FROM public.patient_visits visit
        WHERE visit.patient_id = profile.id
        UNION
        SELECT booking.branch_id
        FROM public.bookings booking
        WHERE booking.patient_id = profile.id
      ) patient_branches
  )
)
WHERE NULLIF(BTRIM(profile.medical_record_number), '') IS NOT NULL
  AND profile.registered_branch_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dental_branches_branch_code_unique
  ON public.dental_branches (UPPER(BTRIM(branch_code)));
ALTER TABLE public.dental_branches
  ALTER COLUMN branch_code SET NOT NULL;

DO $$
DECLARE
  unique_constraint RECORD;
  medical_record_attribute SMALLINT;
BEGIN
  SELECT attnum
  INTO medical_record_attribute
  FROM pg_attribute
  WHERE attrelid = 'public.patient_profiles'::REGCLASS
    AND attname = 'medical_record_number'
    AND NOT attisdropped;

  FOR unique_constraint IN
    SELECT constraint_row.conname
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.patient_profiles'::REGCLASS
      AND constraint_row.contype = 'u'
      AND constraint_row.conkey = ARRAY[medical_record_attribute]::SMALLINT[]
  LOOP
    EXECUTE FORMAT(
      'ALTER TABLE public.patient_profiles DROP CONSTRAINT %I',
      unique_constraint.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE public.patient_profiles
  ALTER COLUMN medical_record_number DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS internal_patient_code VARCHAR(100);

CREATE TABLE IF NOT EXISTS public.patient_branch_medical_records (
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  medical_record_number VARCHAR(50) NOT NULL CHECK (BTRIM(medical_record_number) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  PRIMARY KEY (patient_id, branch_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_branch_rm_unique
  ON public.patient_branch_medical_records (branch_id, UPPER(BTRIM(medical_record_number)));
CREATE INDEX IF NOT EXISTS idx_patient_branch_rm_patient
  ON public.patient_branch_medical_records (patient_id);

CREATE OR REPLACE FUNCTION public.protect_branch_code_after_rm_issuance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.branch_code IS DISTINCT FROM OLD.branch_code
     AND EXISTS (
       SELECT 1
       FROM public.patient_branch_medical_records record
       WHERE record.branch_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'Kode cabang tidak dapat diubah setelah No. RM pasien diterbitkan.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_protect_branch_code_after_rm_issuance ON public.dental_branches;
CREATE TRIGGER trigger_protect_branch_code_after_rm_issuance
  BEFORE UPDATE OF branch_code
  ON public.dental_branches
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_branch_code_after_rm_issuance();

CREATE OR REPLACE FUNCTION public.format_internal_patient_code(
  target_branch_code TEXT,
  target_medical_record_number TEXT
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
  SELECT UPPER(BTRIM(target_branch_code))
    || '-'
    || CASE
      WHEN UPPER(BTRIM(target_medical_record_number)) LIKE 'RM%'
        THEN 'RM-' || REGEXP_REPLACE(UPPER(BTRIM(target_medical_record_number)), '^RM[- ]*', '')
      ELSE 'RM' || UPPER(BTRIM(target_medical_record_number))
    END;
$$;

INSERT INTO public.patient_branch_medical_records (
  patient_id,
  branch_id,
  medical_record_number
)
SELECT profile.id,
       profile.registered_branch_id,
       BTRIM(profile.medical_record_number)
FROM public.patient_profiles profile
WHERE NULLIF(BTRIM(profile.medical_record_number), '') IS NOT NULL
  AND profile.registered_branch_id IS NOT NULL
ON CONFLICT (patient_id, branch_id) DO NOTHING;

UPDATE public.patient_profiles profile
SET internal_patient_code = public.format_internal_patient_code(
  branch.branch_code,
  profile.medical_record_number
)
FROM public.dental_branches branch
WHERE profile.registered_branch_id = branch.id
  AND NULLIF(BTRIM(profile.medical_record_number), '') IS NOT NULL
  AND profile.internal_patient_code IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.patient_profiles
    WHERE internal_patient_code IS NOT NULL
    GROUP BY UPPER(BTRIM(internal_patient_code))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Kode internal pasien duplikat ditemukan; tinjau kode cabang dan RM lama sebelum migrasi.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_profiles_internal_patient_code
  ON public.patient_profiles (UPPER(BTRIM(internal_patient_code)))
  WHERE internal_patient_code IS NOT NULL;

ALTER TABLE public.patient_branch_medical_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.patient_branch_medical_records FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.patient_branch_medical_records TO authenticated;

DROP POLICY IF EXISTS "Patient branch RM read access" ON public.patient_branch_medical_records;
CREATE POLICY "Patient branch RM read access"
  ON public.patient_branch_medical_records
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_can_access_branch(branch_id)
    OR (
      public.get_user_role() = 'PATIENT'
      AND patient_id = public.get_user_patient_id()
    )
  );

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
     AND NOT (
       COALESCE(BTRIM(OLD.medical_record_number), '') = ''
       AND NEW.medical_record_number IS NOT NULL
       AND BTRIM(NEW.medical_record_number) <> ''
       AND EXISTS (
         SELECT 1
         FROM public.patient_branch_medical_records record
         WHERE record.patient_id = OLD.id
           AND UPPER(BTRIM(record.medical_record_number)) = UPPER(BTRIM(NEW.medical_record_number))
       )
     ) THEN
    RAISE EXCEPTION 'Medical record number tampering rejected: medical_record_number is immutable.';
  END IF;

  IF NEW.internal_patient_code IS DISTINCT FROM OLD.internal_patient_code
     AND NOT (
       OLD.internal_patient_code IS NULL
       AND NEW.internal_patient_code IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM public.patient_branch_medical_records record
         JOIN public.dental_branches branch ON branch.id = record.branch_id
         WHERE record.patient_id = OLD.id
           AND public.format_internal_patient_code(
             branch.branch_code,
             record.medical_record_number
           ) = NEW.internal_patient_code
       )
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

CREATE OR REPLACE FUNCTION public.sync_patient_branch_medical_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_branch_code TEXT;
BEGIN
  IF NULLIF(BTRIM(NEW.medical_record_number), '') IS NULL
     OR NEW.registered_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT branch.branch_code
  INTO target_branch_code
  FROM public.dental_branches branch
  WHERE branch.id = NEW.registered_branch_id;

  IF target_branch_code IS NULL THEN
    RAISE EXCEPTION 'Kode cabang tidak ditemukan untuk penautan No. RM pasien.';
  END IF;

  INSERT INTO public.patient_branch_medical_records (
    patient_id,
    branch_id,
    medical_record_number
  )
  VALUES (
    NEW.id,
    NEW.registered_branch_id,
    BTRIM(NEW.medical_record_number)
  )
  ON CONFLICT (patient_id, branch_id) DO NOTHING;

  UPDATE public.patient_profiles
  SET internal_patient_code = COALESCE(
    internal_patient_code,
    public.format_internal_patient_code(target_branch_code, NEW.medical_record_number)
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_patient_branch_medical_record ON public.patient_profiles;
CREATE TRIGGER trigger_sync_patient_branch_medical_record
  AFTER INSERT
  ON public.patient_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_patient_branch_medical_record();

CREATE OR REPLACE FUNCTION public.register_patient_branch_medical_record_number(
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
  branch_code_value TEXT;
  existing_rm TEXT;
  current_rm TEXT;
BEGIN
  IF NOT public.is_super_admin()
     AND (
       COALESCE(public.get_user_role(), '') <> 'BRANCH_ADMIN'
       OR NOT public.user_can_access_branch(target_branch_id)
     ) THEN
    RAISE EXCEPTION 'Hanya administrator cabang yang berwenang dapat menautkan No. RM lokal.';
  END IF;

  IF clean_rm IS NULL OR LENGTH(clean_rm) > 50 THEN
    RAISE EXCEPTION 'No. RM wajib diisi dan maksimal 50 karakter.';
  END IF;

  PERFORM 1
  FROM public.patient_profiles profile
  WHERE profile.id = target_patient_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil pasien % tidak ditemukan.', target_patient_id;
  END IF;

  SELECT branch.branch_code
  INTO branch_code_value
  FROM public.dental_branches branch
  WHERE branch.id = target_branch_id;
  IF branch_code_value IS NULL THEN
    RAISE EXCEPTION 'Cabang tidak ditemukan atau belum memiliki kode cabang.';
  END IF;

  SELECT record.medical_record_number
  INTO existing_rm
  FROM public.patient_branch_medical_records record
  WHERE record.patient_id = target_patient_id
    AND record.branch_id = target_branch_id;
  IF existing_rm IS NOT NULL THEN
    IF UPPER(BTRIM(existing_rm)) <> UPPER(clean_rm) THEN
      RAISE EXCEPTION 'No. RM cabang yang sudah terdaftar tidak dapat diganti.';
    END IF;
    RETURN existing_rm;
  END IF;

  SELECT profile.medical_record_number
  INTO current_rm
  FROM public.patient_profiles profile
  WHERE profile.id = target_patient_id;

  INSERT INTO public.patient_branch_medical_records (
    patient_id,
    branch_id,
    medical_record_number
  )
  VALUES (target_patient_id, target_branch_id, clean_rm);

  UPDATE public.patient_profiles
  SET medical_record_number = CASE
        WHEN NULLIF(BTRIM(current_rm), '') IS NULL THEN clean_rm
        ELSE current_rm
      END,
      internal_patient_code = COALESCE(
        internal_patient_code,
        public.format_internal_patient_code(branch_code_value, clean_rm)
      )
  WHERE id = target_patient_id;

  RETURN clean_rm;
END;
$$;

REVOKE ALL ON FUNCTION public.register_patient_branch_medical_record_number(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_patient_branch_medical_record_number(UUID, UUID, TEXT) TO authenticated;

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
  latest_rm TEXT;
  latest_parts TEXT[];
  next_number BIGINT;
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
    SELECT record.medical_record_number
    INTO latest_rm
    FROM public.patient_branch_medical_records record
    WHERE record.branch_id = target_branch_id
      AND record.medical_record_number ~ '[0-9]+$'
      AND LENGTH((REGEXP_MATCH(record.medical_record_number, '^(.*?)([0-9]+)$'))[2]) <= 18
    ORDER BY (REGEXP_MATCH(record.medical_record_number, '^(.*?)([0-9]+)$'))[2]::BIGINT DESC,
             record.medical_record_number DESC
    LIMIT 1;

    IF latest_rm IS NULL THEN
      next_number := 3000;
      next_rm := next_number::TEXT;
    ELSE
      latest_parts := REGEXP_MATCH(latest_rm, '^(.*?)([0-9]+)$');
      next_number := latest_parts[2]::BIGINT + 1;
      IF LENGTH(next_number::TEXT) > 18 THEN
        RAISE EXCEPTION 'Batas nomor RM otomatis cabang telah tercapai; hubungi administrator.';
      END IF;
      next_rm := latest_parts[1] ||
        CASE
          WHEN LENGTH(latest_parts[2]) > 1 AND LEFT(latest_parts[2], 1) = '0'
            THEN LPAD(next_number::TEXT, LENGTH(latest_parts[2]), '0')
          ELSE next_number::TEXT
        END;
    END IF;
  END IF;

  generated_internal_code := COALESCE(
    current_internal_code,
    public.format_internal_patient_code(target_branch_code, next_rm)
  );

  LOOP
    BEGIN
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

      RETURN next_rm;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT record.medical_record_number
        INTO assigned_rm
        FROM public.patient_branch_medical_records record
        WHERE record.patient_id = target_patient_id
          AND record.branch_id = target_branch_id;

        IF assigned_rm IS NOT NULL THEN
          RETURN assigned_rm;
        END IF;

        IF registered_branch = target_branch_id
           AND NULLIF(BTRIM(current_rm), '') IS NOT NULL THEN
          RAISE EXCEPTION 'No. RM % sudah digunakan pasien lain di cabang ini.', current_rm;
        END IF;

        latest_parts := REGEXP_MATCH(next_rm, '^(.*?)([0-9]+)$');
        IF latest_parts IS NULL THEN
          RAISE EXCEPTION 'No. RM cabang % bentrok dan tidak dapat dinaikkan otomatis.', target_branch_code;
        END IF;
        next_number := latest_parts[2]::BIGINT + 1;
        next_rm := latest_parts[1] ||
          CASE
            WHEN LENGTH(latest_parts[2]) > 1 AND LEFT(latest_parts[2], 1) = '0'
              THEN LPAD(next_number::TEXT, LENGTH(latest_parts[2]), '0')
            ELSE next_number::TEXT
          END;
        generated_internal_code := COALESCE(
          current_internal_code,
          public.format_internal_patient_code(target_branch_code, next_rm)
        );
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_patient_medical_record_number(target_patient_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_branch_id UUID;
BEGIN
  SELECT profile.registered_branch_id
  INTO target_branch_id
  FROM public.patient_profiles profile
  WHERE profile.id = target_patient_id;

  IF target_branch_id IS NULL THEN
    RAISE EXCEPTION 'Cabang pasien % belum ditentukan; RM tidak dapat diterbitkan.', target_patient_id;
  END IF;

  RETURN public.ensure_patient_medical_record_number(target_patient_id, target_branch_id);
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

  PERFORM public.ensure_patient_medical_record_number(target_patient_id, NEW.branch_id);
  NEW.patient_id := target_patient_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_patient_branch_medical_record() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_patient_medical_record_number(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_patient_medical_record_number(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_patient_rm_on_queue_checkin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_patient_profile_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_patient_branch_medical_record_number(UUID, UUID, TEXT) FROM PUBLIC, anon;
