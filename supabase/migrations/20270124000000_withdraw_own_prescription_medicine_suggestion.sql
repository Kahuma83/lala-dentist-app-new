BEGIN;

CREATE OR REPLACE FUNCTION public.withdraw_pending_prescription_medicine(p_medicine_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role() IS DISTINCT FROM 'DOCTOR' THEN
    RAISE EXCEPTION 'Hanya dokter yang dapat menarik usulan obat.';
  END IF;

  UPDATE public.prescription_medicines
  SET approval_status = 'REJECTED',
      updated_at = timezone('utc'::TEXT, now())
  WHERE id = p_medicine_id
    AND submitted_by = auth.uid()
    AND approval_status = 'PENDING'
    AND is_active = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usulan obat tidak ditemukan atau sudah diproses.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_pending_prescription_medicine(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_pending_prescription_medicine(UUID) TO authenticated;

COMMIT;