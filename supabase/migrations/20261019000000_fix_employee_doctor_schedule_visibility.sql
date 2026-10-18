DROP POLICY IF EXISTS "Doctor schedules authenticated read" ON public.doctor_schedules;

CREATE POLICY "Doctor schedules authenticated read"
  ON public.doctor_schedules
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR_ASSISTANT')
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
      AND public.is_active_branch(branch_id)
    )
    OR (
      public.get_user_role() = 'DOCTOR'
      AND (
        branch_id::TEXT = public.get_user_branch_id()::TEXT
        OR doctor_id IN (
          SELECT account.doctor_id
          FROM public.user_accounts account
          WHERE account.auth_user_id = auth.uid()
            AND account.active = TRUE
            AND account.role = 'DOCTOR'
            AND account.doctor_id IS NOT NULL
        )
        OR doctor_id IN (
          SELECT doctor.id
          FROM public.dental_doctors doctor
          WHERE doctor.staff_id = public.get_user_staff_id()
        )
      )
    )
    OR (
      public.get_user_role() = 'PATIENT'
      AND status = 'ACTIVE'
      AND public.is_active_branch(branch_id)
      AND public.is_active_doctor(doctor_id)
    )
  );
