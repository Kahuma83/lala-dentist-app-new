BEGIN;

ALTER TABLE public.prescription_medicines
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'APPROVED';

ALTER TABLE public.prescription_medicines
  ADD COLUMN IF NOT EXISTS submitted_by UUID DEFAULT auth.uid()
  REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'prescription_medicines_approval_status_check'
      AND conrelid = 'public.prescription_medicines'::regclass
  ) THEN
    ALTER TABLE public.prescription_medicines
      ADD CONSTRAINT prescription_medicines_approval_status_check
      CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED'));
  END IF;
END;
$$;

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
        OR (approval_status = 'PENDING' AND submitted_by = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Prescription medicines super admin insert" ON public.prescription_medicines;
CREATE POLICY "Prescription medicines super admin insert"
  ON public.prescription_medicines
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'DOCTOR'
      AND approval_status = 'PENDING'
      AND is_active = false
      AND submitted_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Prescription medicines super admin update" ON public.prescription_medicines;
CREATE POLICY "Prescription medicines super admin update"
  ON public.prescription_medicines
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMIT;
