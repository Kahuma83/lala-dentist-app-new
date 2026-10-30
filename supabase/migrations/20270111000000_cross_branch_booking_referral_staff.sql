CREATE OR REPLACE FUNCTION public.validate_booking_referring_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.referring_staff_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.staff AS referral_staff
    WHERE referral_staff.id = NEW.referring_staff_id
      AND referral_staff.position IN ('BRANCH_ADMIN', 'ASSISTANT')
      AND referral_staff.employment_status = 'ACTIVE'
      AND referral_staff.active = true
  ) THEN
    RAISE EXCEPTION 'Staf referral harus admin atau asisten aktif.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_booking_referral_staff()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  staff_position TEXT,
  branch_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_accounts AS account
    WHERE account.auth_user_id = auth.uid()
      AND account.active = true
      AND account.role IN ('SUPER_ADMIN', 'BRANCH_ADMIN')
  ) THEN
    RAISE EXCEPTION 'Hanya admin aktif yang dapat melihat daftar referral.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    referral_staff.id,
    referral_staff.full_name::TEXT,
    referral_staff.position::TEXT,
    referral_staff.branch_id
  FROM public.staff AS referral_staff
  WHERE referral_staff.position IN ('BRANCH_ADMIN', 'ASSISTANT')
    AND referral_staff.employment_status = 'ACTIVE'
    AND referral_staff.active = true
  ORDER BY referral_staff.full_name, referral_staff.branch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_booking_referral_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_referral_staff() TO authenticated;

COMMENT ON FUNCTION public.get_booking_referral_staff() IS
  'Returns the minimal directory of active branch admins and assistants across all branches to authorized booking admins.';
COMMENT ON FUNCTION public.validate_booking_referring_staff() IS
  'Ensures booking referrers are active branch admins or assistants; referral attribution may cross branches.';

NOTIFY pgrst, 'reload schema';
