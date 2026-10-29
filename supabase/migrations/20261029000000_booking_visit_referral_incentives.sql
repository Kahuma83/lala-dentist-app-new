ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS referring_staff_id UUID
  REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_referring_staff
  ON public.bookings(referring_staff_id)
  WHERE referring_staff_id IS NOT NULL;

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
    FROM public.staff
    WHERE id = NEW.referring_staff_id
      AND branch_id = NEW.branch_id
      AND position IN ('BRANCH_ADMIN', 'ASSISTANT')
      AND employment_status = 'ACTIVE'
      AND active = true
  ) THEN
    RAISE EXCEPTION 'Staf referral harus admin atau asisten aktif pada cabang booking.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_referring_staff_scope_guard ON public.bookings;
CREATE TRIGGER booking_referring_staff_scope_guard
  BEFORE INSERT OR UPDATE OF referring_staff_id, branch_id
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_referring_staff();

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_visit_referral_accrual_per_visit
  ON public.compensation_accruals(source_id, rule_id_snapshot)
  WHERE rule_id_snapshot = 'STAFF_VISIT_REFERRAL_RP3000_V1';

COMMENT ON COLUMN public.bookings.referring_staff_id IS
  'Active branch admin or assistant who invited the patient for this booking; one Rp3,000 incentive is accrued per paid visit.';

COMMENT ON COLUMN public.patient_profiles.referring_staff_id IS
  'Legacy initial-referrer metadata; current visit incentives are attributed from the linked booking.';
