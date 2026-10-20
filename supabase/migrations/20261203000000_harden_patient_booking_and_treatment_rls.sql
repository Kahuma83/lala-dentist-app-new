BEGIN;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bookings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bookings TO authenticated;

DROP POLICY IF EXISTS "Enable all access on bookings" ON public.bookings;

DROP POLICY IF EXISTS "Clinical staff create treatment" ON public.treatment_jobs;
DROP POLICY IF EXISTS "Clinical staff create treatment jobs" ON public.treatment_jobs;

CREATE POLICY "Clinical staff create treatment jobs"
  ON public.treatment_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      public.is_super_admin()
      OR (
        public.get_user_role() IN ('DOCTOR', 'DOCTOR_ASSISTANT')
        AND public.user_can_manage_treatment_branch(branch_id)
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.patient_visits AS visit
      WHERE visit.id = treatment_jobs.visit_id
        AND visit.patient_id = treatment_jobs.patient_id
        AND visit.branch_id = treatment_jobs.branch_id
    )
  );

COMMIT;
