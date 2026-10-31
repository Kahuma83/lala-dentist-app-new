BEGIN;

DROP POLICY IF EXISTS "Prescription medicines read" ON public.prescription_medicines;
CREATE POLICY "Prescription medicines read"
  ON public.prescription_medicines
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'DOCTOR'
      AND (
        (approval_status = 'APPROVED' AND is_active = true)
        OR approval_status = 'PENDING'
        OR (approval_status = 'REJECTED' AND submitted_by = auth.uid())
      )
    )
  );

COMMIT;
