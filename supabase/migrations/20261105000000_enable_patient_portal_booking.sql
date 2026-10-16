ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source VARCHAR(30),
  ADD COLUMN IF NOT EXISTS channel VARCHAR(30);

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
     OR NOT public.is_valid_doctor_schedule(p_doctor_id, p_branch_id) THEN
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

DROP POLICY IF EXISTS "Booking branch isolation select" ON public.bookings;
DROP POLICY IF EXISTS "Booking branch isolation manage" ON public.bookings;
DROP POLICY IF EXISTS "Booking staff branch isolation manage" ON public.bookings;
DROP POLICY IF EXISTS "Booking patient create own scheduled request" ON public.bookings;

CREATE POLICY "Booking branch isolation select"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    (
      public.get_user_role() IS DISTINCT FROM 'PATIENT'
      AND (
        public.is_super_admin()
        OR branch_id::TEXT = public.get_user_branch_id()::TEXT
      )
    )
    OR (
      public.get_user_role() = 'PATIENT'
      AND patient_id::TEXT = public.get_user_patient_id()::TEXT
    )
  );

CREATE POLICY "Booking staff branch isolation manage"
  ON public.bookings
  FOR ALL
  TO authenticated
  USING (
    public.get_user_role() IS DISTINCT FROM 'PATIENT'
    AND (
      public.is_super_admin()
      OR (
        public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
        AND branch_id::TEXT = public.get_user_branch_id()::TEXT
      )
    )
  )
  WITH CHECK (
    public.get_user_role() IS DISTINCT FROM 'PATIENT'
    AND (
      public.is_super_admin()
      OR (
        public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
        AND branch_id::TEXT = public.get_user_branch_id()::TEXT
      )
    )
  );

CREATE POLICY "Booking patient create own scheduled request"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.patient_portal_booking_is_valid(
      patient_id,
      branch_id,
      doctor_id,
      booking_date_time,
      status
    )
    AND source = 'PATIENT_PORTAL'
    AND channel = 'PATIENT_PORTAL'
  );
