BEGIN;

CREATE OR REPLACE FUNCTION public.get_treatment_pic_staff_candidates()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  position TEXT,
  employment_status TEXT,
  active BOOLEAN,
  branch_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role() IS DISTINCT FROM 'DOCTOR' THEN
    RAISE EXCEPTION 'Hanya dokter yang dapat memuat kandidat PIC tindakan.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    staff.id,
    staff.full_name::TEXT,
    staff.position::TEXT,
    staff.employment_status::TEXT,
    staff.active,
    staff.branch_id
  FROM public.staff staff
  WHERE staff.active = true
    AND staff.employment_status = 'ACTIVE'
    AND staff.position IN ('ASSISTANT', 'BRANCH_ADMIN')
    AND (
      (
        staff.branch_id IS NOT NULL
        AND public.user_can_manage_treatment_branch(staff.branch_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.staff_shift_assignments assignment
        WHERE assignment.staff_id = staff.id
          AND assignment.active = true
          AND public.user_can_manage_treatment_branch(assignment.branch_id)
      )
    )
  ORDER BY staff.full_name, staff.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_treatment_pic_staff_candidates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_treatment_pic_staff_candidates() TO authenticated;

COMMIT;
