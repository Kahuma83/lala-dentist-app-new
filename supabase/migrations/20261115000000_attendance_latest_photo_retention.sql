CREATE OR REPLACE FUNCTION public.clear_old_self_attendance_photo_paths(
  p_keep_photo_path TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  v_staff_id := public.get_user_staff_id();
  IF auth.uid() IS NULL OR v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Tidak memiliki akses untuk membersihkan foto absensi.';
  END IF;

  IF p_keep_photo_path IS NULL
     OR split_part(p_keep_photo_path, '/', 2) <> v_staff_id::TEXT
     OR split_part(p_keep_photo_path, '/', 3) NOT LIKE 'latest-%.jpg'
     OR NOT EXISTS (
       SELECT 1
       FROM public.attendances
       WHERE staff_id = v_staff_id
         AND (
           check_in_photo_path = p_keep_photo_path
           OR check_out_photo_path = p_keep_photo_path
         )
     ) THEN
    RAISE EXCEPTION 'Path foto terbaru tidak valid untuk akun staf ini.';
  END IF;

  UPDATE public.attendances
  SET check_in_photo_path = CASE
        WHEN check_in_photo_path LIKE '%/' || v_staff_id::TEXT || '/latest-%'
             AND check_in_photo_path <> p_keep_photo_path
          THEN NULL
        ELSE check_in_photo_path
      END,
      check_out_photo_path = CASE
        WHEN check_out_photo_path LIKE '%/' || v_staff_id::TEXT || '/latest-%'
             AND check_out_photo_path <> p_keep_photo_path
          THEN NULL
        ELSE check_out_photo_path
      END,
      updated_at = NOW()
  WHERE staff_id = v_staff_id
    AND (
      (check_in_photo_path LIKE '%/' || v_staff_id::TEXT || '/latest-%'
       AND check_in_photo_path <> p_keep_photo_path)
      OR
      (check_out_photo_path LIKE '%/' || v_staff_id::TEXT || '/latest-%'
       AND check_out_photo_path <> p_keep_photo_path)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.clear_old_self_attendance_photo_paths(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_old_self_attendance_photo_paths(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Attendance evidence delete own staff" ON storage.objects;
CREATE POLICY "Attendance evidence delete own staff" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'attendance-evidence'
    AND (storage.foldername(name))[2] = public.get_user_staff_id()::TEXT
  );
