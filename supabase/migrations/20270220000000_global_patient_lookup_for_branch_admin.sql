CREATE OR REPLACE FUNCTION public.search_patients_global_for_admin(
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
  lookup_only BOOLEAN,
  identity_document_match BOOLEAN,
  branch_medical_records JSONB,
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
  IF auth.uid() IS NULL
     OR public.get_user_role() NOT IN ('BRANCH_ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Akses pencarian pasien global hanya untuk Admin Cabang atau Super Admin.'
      USING ERRCODE = '42501';
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
    CASE
      WHEN public.is_super_admin() THEN FALSE
      ELSE NOT (
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
      )
    END AS lookup_only,
    (
      normalized_query <> ''
      AND lower(regexp_replace(coalesce(profile.identity_document_number, ''), '[[:space:]]', '', 'g'))
        = lower(regexp_replace(normalized_query, '[[:space:]]', '', 'g'))
    ) AS identity_document_match,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'branch_id', branch_rm.branch_id,
          'branch_name', branch.name,
          'branch_code', branch.branch_code,
          'medical_record_number', branch_rm.medical_record_number
        )
        ORDER BY branch.name
      )
      FROM public.patient_branch_medical_records branch_rm
      JOIN public.dental_branches branch ON branch.id = branch_rm.branch_id
      WHERE branch_rm.patient_id = profile.id
    ), '[]'::JSONB) AS branch_medical_records,
    count(*) OVER () AS match_count
  FROM public.patient_profiles profile
  WHERE
    normalized_query = ''
    OR position(normalized_query IN lower(coalesce(profile.name, ''))) > 0
    OR position(normalized_query IN lower(coalesce(profile.full_name, ''))) > 0
    OR position(normalized_query IN lower(coalesce(profile.medical_record_number, ''))) > 0
    OR position(normalized_query IN lower(coalesce(profile.internal_patient_code, ''))) > 0
    OR position(
      normalized_query IN lower(coalesce(profile.identity_document_number, ''))
    ) > 0
    OR EXISTS (
      SELECT 1
      FROM public.patient_branch_medical_records branch_rm
      JOIN public.dental_branches branch ON branch.id = branch_rm.branch_id
      WHERE branch_rm.patient_id = profile.id
        AND (
          position(normalized_query IN lower(branch_rm.medical_record_number)) > 0
          OR position(
            normalized_query IN lower(branch.branch_code || '-' || branch_rm.medical_record_number)
          ) > 0
        )
    )
    OR (
      digits_query <> ''
      AND (
        position(
          digits_query IN regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g')
        ) > 0
        OR position(
          digits_query IN regexp_replace(coalesce(profile.identity_document_number, ''), '[^0-9]', '', 'g')
        ) > 0
      )
    )
  ORDER BY profile.created_at DESC, profile.id
  OFFSET greatest(coalesce(p_offset, 0), 0)
  LIMIT least(greatest(coalesce(p_limit, 10), 1), 50);
END;
$$;

REVOKE ALL ON FUNCTION public.search_patients_global_for_admin(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_patients_global_for_admin(TEXT, INTEGER, INTEGER)
  TO authenticated;
