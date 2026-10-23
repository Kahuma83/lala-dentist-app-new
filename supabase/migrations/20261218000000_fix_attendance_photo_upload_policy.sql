DROP POLICY IF EXISTS "Attendance evidence upload own staff" ON storage.objects;

CREATE POLICY "Attendance evidence upload own staff" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attendance-evidence'
    AND (storage.foldername(name))[2] = public.get_user_staff_id()::TEXT
    AND (
      (storage.foldername(name))[1] = public.get_user_branch_id()::TEXT
      OR (
        public.get_user_role() = 'DOCTOR'
        AND EXISTS (
          SELECT 1
          FROM public.dental_doctors dd
          JOIN public.doctor_schedules ds ON ds.doctor_id = dd.id
          WHERE dd.staff_id = public.get_user_staff_id()
            AND ds.branch_id::TEXT = (storage.foldername(storage.objects.name))[1]
            AND ds.date = (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE
            AND ds.status = 'ACTIVE'
        )
      )
    )
  );
