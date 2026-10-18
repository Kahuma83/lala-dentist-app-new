ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS profile_photo_path TEXT;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'staff-profile-photos',
  'staff-profile-photos',
  FALSE,
  524288,
  ARRAY['image/jpeg']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = 524288,
    allowed_mime_types = ARRAY['image/jpeg'];

CREATE OR REPLACE FUNCTION public.can_manage_staff_profile_photo(target_staff_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND target_staff_id IS NOT NULL
    AND (
      public.is_super_admin()
      OR target_staff_id = public.get_user_staff_id()::TEXT
      OR (
        public.get_user_role() = 'BRANCH_ADMIN'
        AND EXISTS (
          SELECT 1
          FROM public.staff s
          WHERE s.id::TEXT = target_staff_id
            AND s.branch_id::TEXT = public.get_user_branch_id()::TEXT
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_staff_profile_photo(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_staff_profile_photo(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_staff_profile_photo_path(
  p_staff_id UUID,
  p_photo_path TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  previous_photo_path TEXT;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.can_manage_staff_profile_photo(p_staff_id::TEXT) THEN
    RAISE EXCEPTION 'Tidak memiliki akses untuk memperbarui foto profil pegawai.'
      USING ERRCODE = '42501';
  END IF;

  IF p_photo_path IS NULL
     OR p_photo_path !~ (
       '^staff-profile/' || p_staff_id::TEXT ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
     ) THEN
    RAISE EXCEPTION 'Lokasi foto profil tidak valid.'
      USING ERRCODE = '22023';
  END IF;

  SELECT profile_photo_path INTO previous_photo_path
  FROM public.staff
  WHERE id = p_staff_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data pegawai tidak ditemukan.'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.staff
  SET profile_photo_path = p_photo_path,
      updated_at = timezone('utc'::TEXT, now())
  WHERE id = p_staff_id;

  RETURN previous_photo_path;
END;
$$;

REVOKE ALL ON FUNCTION public.set_staff_profile_photo_path(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_staff_profile_photo_path(UUID, TEXT) TO authenticated;

DROP POLICY IF EXISTS "Staff profile photos owner read" ON storage.objects;
CREATE POLICY "Staff profile photos owner read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'staff-profile-photos'
    AND name ~ '^staff-profile/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    AND (storage.foldername(name))[2] = public.get_user_staff_id()::TEXT
  );

DROP POLICY IF EXISTS "Staff profile photos authorized upload" ON storage.objects;
CREATE POLICY "Staff profile photos authorized upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'staff-profile-photos'
    AND name ~ '^staff-profile/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    AND public.can_manage_staff_profile_photo((storage.foldername(name))[2])
  );

DROP POLICY IF EXISTS "Staff profile photos authorized delete" ON storage.objects;
CREATE POLICY "Staff profile photos authorized delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'staff-profile-photos'
    AND name ~ '^staff-profile/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    AND public.can_manage_staff_profile_photo((storage.foldername(name))[2])
  );
