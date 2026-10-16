CREATE OR REPLACE FUNCTION public.user_can_manage_treatment_branch(target_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_accounts ua
    JOIN public.dental_branches b ON b.id = target_branch_id
    WHERE ua.auth_user_id = auth.uid()
      AND ua.active = true
      AND ua.role IN ('DOCTOR', 'DOCTOR_ASSISTANT')
      AND (
        ua.branch_id::TEXT = target_branch_id::TEXT
        OR regexp_replace(
          regexp_replace(lower(trim(ua.branch_id::TEXT)), '^(branch[-_ ]*|cabang[-_ ]*)', ''),
          '[^a-z0-9]', '', 'g'
        ) = regexp_replace(
          regexp_replace(lower(trim(b.name)), '^(branch[-_ ]*|cabang[-_ ]*)', ''),
          '[^a-z0-9]', '', 'g'
        )
        OR EXISTS (
          SELECT 1
          FROM public.staff s
          WHERE (s.id::TEXT = ua.staff_id::TEXT OR s.user_account_id = ua.id)
            AND s.branch_id = target_branch_id
            AND s.active = true
        )
        OR EXISTS (
          SELECT 1
          FROM public.dental_doctors d
          WHERE d.id = ua.doctor_id
            AND d.active = true
            AND (
              d.assigned_branch_id = target_branch_id
              OR EXISTS (
                SELECT 1
                FROM public.doctor_branch_assignments dba
                WHERE dba.doctor_id = d.id
                  AND dba.branch_id = target_branch_id
                  AND dba.active = true
                  AND dba.start_date <= CURRENT_DATE
                  AND (dba.end_date IS NULL OR dba.end_date >= CURRENT_DATE)
              )
            )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_manage_treatment_branch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_manage_treatment_branch(UUID) TO authenticated;

ALTER TABLE public.treatment_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage treatment jobs" ON public.treatment_jobs;
DROP POLICY IF EXISTS "Treatment branch isolation" ON public.treatment_jobs;
DROP POLICY IF EXISTS "Treatment branch read" ON public.treatment_jobs;
DROP POLICY IF EXISTS "Clinical staff create treatment" ON public.treatment_jobs;
DROP POLICY IF EXISTS "Clinical staff update treatment" ON public.treatment_jobs;

CREATE POLICY "Clinical staff read treatment jobs"
  ON public.treatment_jobs
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_can_manage_treatment_branch(branch_id)
  );

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
      FROM public.patient_visits pv
      WHERE pv.id = treatment_jobs.visit_id
        AND pv.patient_id = treatment_jobs.patient_id
        AND pv.branch_id = treatment_jobs.branch_id
    )
  );

CREATE POLICY "Clinical staff update treatment jobs"
  ON public.treatment_jobs
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('DOCTOR', 'DOCTOR_ASSISTANT')
      AND public.user_can_manage_treatment_branch(branch_id)
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('DOCTOR', 'DOCTOR_ASSISTANT')
      AND public.user_can_manage_treatment_branch(branch_id)
    )
  );

ALTER TABLE public.treatment_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage treatment activities" ON public.treatment_activities;
DROP POLICY IF EXISTS "Treatment activity branch isolation" ON public.treatment_activities;
DROP POLICY IF EXISTS "Treatment activity branch read" ON public.treatment_activities;
DROP POLICY IF EXISTS "Clinical staff append treatment activity" ON public.treatment_activities;

CREATE POLICY "Clinical staff read treatment activities"
  ON public.treatment_activities
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_can_manage_treatment_branch(branch_id)
  );

CREATE POLICY "Clinical staff append treatment activities"
  ON public.treatment_activities
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
      FROM public.treatment_jobs tj
      WHERE tj.id = treatment_activities.treatment_id
        AND tj.branch_id = treatment_activities.branch_id
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.treatment_jobs TO authenticated;
GRANT SELECT, INSERT ON public.treatment_activities TO authenticated;
