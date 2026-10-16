-- =====================================================================
-- Migration: 20261013000000_allow_branch_admin_read_all_patients.sql
-- Description: Allow BRANCH_ADMIN to view all global patient profiles
-- =====================================================================

DROP POLICY IF EXISTS "Branch staff read patient profiles" ON public.patient_profiles;

CREATE POLICY "Branch staff read patient profiles"
  ON public.patient_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.get_user_role() = 'BRANCH_ADMIN'
    OR (
      public.get_user_role() IN ('DOCTOR', 'DOCTOR_ASSISTANT')
      AND (
        (registered_branch_id IS NOT NULL AND registered_branch_id = public.get_user_branch_id())
        OR EXISTS (
          SELECT 1 FROM public.patient_visits pv
          WHERE pv.patient_id = patient_profiles.id 
            AND pv.branch_id = public.get_user_branch_id()
        )
        OR EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.patient_id = patient_profiles.id 
            AND b.branch_id = public.get_user_branch_id()
        )
        OR EXISTS (
          SELECT 1 FROM public.queue_items q
          WHERE q.patient_id = patient_profiles.id 
            AND q.branch_id = public.get_user_branch_id()
        )
      )
    )
    OR (public.get_user_role() = 'PATIENT' AND id = public.get_user_patient_id())
  );
