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
          SELECT doctor.id
          FROM public.dental_doctors doctor
          JOIN public.user_accounts account
            ON account.staff_id = doctor.id::TEXT
            OR account.id::TEXT = doctor.id::TEXT
          WHERE account.auth_user_id = auth.uid()
            AND account.active = TRUE
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

DROP POLICY IF EXISTS "Doctors authenticated read" ON public.dental_doctors;

CREATE POLICY "Doctors authenticated read"
  ON public.dental_doctors
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR_ASSISTANT')
      AND public.doctor_is_assigned_to_branch(id, assigned_branch_id, public.get_user_branch_id())
    )
    OR (
      public.get_user_role() = 'DOCTOR'
      AND staff_id = public.get_user_staff_id()
    )
    OR (
      public.get_user_role() = 'PATIENT'
      AND active = TRUE
      AND EXISTS (
        SELECT 1
        FROM public.doctor_schedules schedule
        WHERE schedule.doctor_id = dental_doctors.id
          AND schedule.status = 'ACTIVE'
          AND public.is_active_branch(schedule.branch_id)
      )
    )
  );

CREATE OR REPLACE FUNCTION public.patient_portal_booking_is_valid(
  p_patient_id UUID,
  p_branch_id UUID,
  p_doctor_id UUID,
  p_booking_date_time TIMESTAMPTZ,
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  operational_datetime TIMESTAMP;
BEGIN
  IF auth.uid() IS NULL
     OR public.get_user_role() IS DISTINCT FROM 'PATIENT'
     OR p_patient_id::TEXT IS DISTINCT FROM public.get_user_patient_id()::TEXT
     OR p_status IS DISTINCT FROM 'PENDING'
     OR p_booking_date_time IS NULL
     OR p_booking_date_time <= now()
     OR NOT public.is_active_branch(p_branch_id)
     OR NOT public.is_active_doctor(p_doctor_id) THEN
    RETURN FALSE;
  END IF;

  operational_datetime := p_booking_date_time AT TIME ZONE 'Asia/Jakarta';

  RETURN EXISTS (
    SELECT 1
    FROM public.doctor_schedules schedule
    WHERE schedule.branch_id = p_branch_id
      AND schedule.doctor_id = p_doctor_id
      AND schedule.date = operational_datetime::DATE
      AND schedule.status = 'ACTIVE'
      AND operational_datetime::TIME >= schedule.start_time::TIME
      AND operational_datetime::TIME < schedule.end_time::TIME
  );
END;
$$;

REVOKE ALL ON FUNCTION public.patient_portal_booking_is_valid(UUID, UUID, UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_portal_booking_is_valid(UUID, UUID, UUID, TIMESTAMPTZ, TEXT) TO authenticated;
