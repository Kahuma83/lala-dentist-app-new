ALTER TABLE public.overtime_records
  ADD COLUMN IF NOT EXISTS approved_overtime_minutes INT
    CHECK (approved_overtime_minutes IS NULL OR approved_overtime_minutes >= 0),
  ADD COLUMN IF NOT EXISTS is_national_holiday BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Employee portal overtime management" ON public.overtime_records;
DROP POLICY IF EXISTS "Employee portal overtime insert" ON public.overtime_records;
DROP POLICY IF EXISTS "Employee portal overtime submission" ON public.overtime_records;
DROP POLICY IF EXISTS "Employee portal overtime deletion" ON public.overtime_records;
CREATE POLICY "Employee portal overtime insert"
  ON public.overtime_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
      AND status = 'DETECTED'
      AND approved_overtime_minutes IS NULL
      AND overtime_amount_snapshot IS NULL
      AND hourly_rate_snapshot IS NULL
      AND calculation_method IS NULL
      AND is_national_holiday = false
      AND approved_by IS NULL
      AND approved_at IS NULL
      AND rejected_by IS NULL
      AND rejected_at IS NULL
      AND rejection_reason IS NULL
    )
  );

CREATE POLICY "Employee portal overtime submission"
  ON public.overtime_records
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
      AND status = 'DETECTED'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
      AND status = 'SUBMITTED'
      AND approved_overtime_minutes IS NULL
      AND overtime_amount_snapshot IS NULL
      AND hourly_rate_snapshot IS NULL
      AND calculation_method IS NULL
      AND is_national_holiday = false
      AND approved_by IS NULL
      AND approved_at IS NULL
      AND rejected_by IS NULL
      AND rejected_at IS NULL
      AND rejection_reason IS NULL
    )
  );

CREATE POLICY "Employee portal overtime deletion"
  ON public.overtime_records
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.guard_overtime_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF public.get_user_role() IS DISTINCT FROM 'BRANCH_ADMIN'
    OR OLD.status <> 'DETECTED'
    OR NEW.status <> 'SUBMITTED'
    OR (to_jsonb(NEW) - ARRAY['status', 'updated_at', 'updated_by'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'updated_at', 'updated_by']) THEN
    RAISE EXCEPTION 'Branch Admin hanya dapat mengajukan lembur tanpa mengubah data atau tarif.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_overtime_submission() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_overtime_submission ON public.overtime_records;
CREATE TRIGGER guard_overtime_submission
  BEFORE UPDATE ON public.overtime_records
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_overtime_submission();
