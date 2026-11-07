CREATE OR REPLACE FUNCTION public.search_patients_for_branch_admin_booking(
  p_query TEXT,
  p_offset INTEGER DEFAULT 0,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  full_name TEXT,
  phone TEXT,
  medical_record_number TEXT,
  internal_patient_code TEXT,
  registered_branch_id UUID,
  booking_lookup_only BOOLEAN,
  match_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_query TEXT := lower(trim(coalesce(p_query, '')));
  digits_query TEXT := regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g');
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role() <> 'BRANCH_ADMIN' THEN
    RAISE EXCEPTION 'Akses pencarian pasien booking hanya untuk Admin Cabang.'
      USING ERRCODE = '42501';
  END IF;

  IF length(normalized_query) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    profile.id,
    profile.name::TEXT,
    profile.full_name::TEXT,
    profile.phone::TEXT,
    profile.medical_record_number::TEXT,
    profile.internal_patient_code::TEXT,
    profile.registered_branch_id,
    NOT (
      (
        profile.registered_branch_id IS NOT NULL
        AND public.user_can_access_branch(profile.registered_branch_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.patient_visits visit
        WHERE visit.patient_id = profile.id
          AND public.user_can_access_branch(visit.branch_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.bookings booking
        WHERE booking.patient_id = profile.id
          AND public.user_can_access_branch(booking.branch_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.queue_items queue
        WHERE queue.patient_id = profile.id
          AND public.user_can_access_branch(queue.branch_id)
      )
    ) AS booking_lookup_only,
    count(*) OVER () AS match_count
  FROM public.patient_profiles profile
  WHERE
    position(normalized_query IN lower(coalesce(profile.name, ''))) > 0
    OR position(normalized_query IN lower(coalesce(profile.full_name, ''))) > 0
    OR position(normalized_query IN lower(coalesce(profile.medical_record_number, ''))) > 0
    OR position(normalized_query IN lower(coalesce(profile.internal_patient_code, ''))) > 0
    OR EXISTS (
      SELECT 1
      FROM public.patient_branch_medical_records patient_rm
      WHERE patient_rm.patient_id = profile.id
        AND position(normalized_query IN lower(patient_rm.medical_record_number)) > 0
    )
    OR (
      digits_query <> ''
      AND position(
        digits_query IN regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g')
      ) > 0
    )
  ORDER BY profile.created_at DESC, profile.id
  OFFSET greatest(coalesce(p_offset, 0), 0)
  LIMIT least(greatest(coalesce(p_limit, 10), 1), 50);
END;
$$;

REVOKE ALL ON FUNCTION public.search_patients_for_branch_admin_booking(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_patients_for_branch_admin_booking(TEXT, INTEGER, INTEGER)
  TO authenticated;
