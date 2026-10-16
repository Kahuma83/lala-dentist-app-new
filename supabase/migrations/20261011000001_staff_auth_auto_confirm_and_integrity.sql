-- =====================================================================
-- PHASE 10G — STAFF AUTH AUTO-CONFIRM & INTEGRITY HARDENING
-- File: /supabase/migrations/20261011000001_staff_auth_auto_confirm_and_integrity.sql
-- =====================================================================

-- 1. Ensure staff accounts created with internal synthetic emails (@laladentist.com)
-- are automatically confirmed in auth.users so login never fails due to unconfirmed email.
CREATE OR REPLACE FUNCTION public.handle_staff_auth_user_confirmed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email LIKE '%@laladentist.com' OR NEW.email LIKE '%@laladentist.id' THEN
    IF NEW.email_confirmed_at IS NULL THEN
      NEW.email_confirmed_at := timezone('utc'::text, now());
    END IF;
    IF NEW.confirmed_at IS NULL THEN
      NEW.confirmed_at := timezone('utc'::text, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_staff_auth_user_confirmed ON auth.users;
CREATE TRIGGER trg_staff_auth_user_confirmed
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_staff_auth_user_confirmed();

-- 2. Backfill existing unconfirmed staff accounts in auth.users
UPDATE auth.users
SET 
  email_confirmed_at = COALESCE(email_confirmed_at, timezone('utc'::text, now())),
  confirmed_at = COALESCE(confirmed_at, timezone('utc'::text, now()))
WHERE (email LIKE '%@laladentist.com' OR email LIKE '%@laladentist.id')
  AND email_confirmed_at IS NULL;
