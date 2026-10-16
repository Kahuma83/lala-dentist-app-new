CREATE OR REPLACE FUNCTION public.user_can_access_branch(target_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_accounts ua
      JOIN public.dental_branches b ON b.id = target_branch_id
      WHERE ua.auth_user_id = auth.uid()
        AND ua.active = true
        AND ua.role IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
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
        )
    );
$$;

REVOKE ALL ON FUNCTION public.user_can_access_branch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_branch(UUID) TO authenticated;

ALTER TABLE public.patient_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Visit branch isolation" ON public.patient_visits;
CREATE POLICY "Visit branch isolation"
  ON public.patient_visits
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_can_access_branch(branch_id)
    OR (
      public.get_user_role() = 'PATIENT'
      AND patient_id::TEXT = public.get_user_patient_id()::TEXT
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.user_can_access_branch(branch_id)
    OR (
      public.get_user_role() = 'PATIENT'
      AND patient_id::TEXT = public.get_user_patient_id()::TEXT
    )
  );

ALTER TABLE public.queue_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Queue branch isolation" ON public.queue_items;
DROP POLICY IF EXISTS "Queue items full access policy" ON public.queue_items;
DROP POLICY IF EXISTS "Authenticated manage queue items" ON public.queue_items;
CREATE POLICY "Queue branch isolation"
  ON public.queue_items
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_can_access_branch(branch_id)
    OR (
      public.get_user_role() = 'PATIENT'
      AND patient_id::TEXT = public.get_user_patient_id()::TEXT
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.user_can_access_branch(branch_id)
    OR (
      public.get_user_role() = 'PATIENT'
      AND patient_id::TEXT = public.get_user_patient_id()::TEXT
    )
  );
