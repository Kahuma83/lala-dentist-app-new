INSERT INTO storage.buckets (id, name, public)
VALUES ('clinic-doctor-portraits', 'clinic-doctor-portraits', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public read clinic doctor portraits" ON storage.objects;
CREATE POLICY "Public read clinic doctor portraits"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'clinic-doctor-portraits');

DROP POLICY IF EXISTS "Super admins upload clinic doctor portraits" ON storage.objects;
CREATE POLICY "Super admins upload clinic doctor portraits"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'clinic-doctor-portraits' AND public.is_super_admin());

DROP POLICY IF EXISTS "Super admins update clinic doctor portraits" ON storage.objects;
CREATE POLICY "Super admins update clinic doctor portraits"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'clinic-doctor-portraits' AND public.is_super_admin())
  WITH CHECK (bucket_id = 'clinic-doctor-portraits' AND public.is_super_admin());

DROP POLICY IF EXISTS "Super admins delete clinic doctor portraits" ON storage.objects;
CREATE POLICY "Super admins delete clinic doctor portraits"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'clinic-doctor-portraits' AND public.is_super_admin());
