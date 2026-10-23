CREATE OR REPLACE FUNCTION public.reopen_reviewed_payroll_for_correction(p_payroll_id UUID)
RETURNS public.monthly_payrolls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  payroll_row public.monthly_payrolls%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat mengembalikan payroll REVIEW untuk koreksi.';
  END IF;

  SELECT *
  INTO payroll_row
  FROM public.monthly_payrolls
  WHERE id = p_payroll_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll tidak ditemukan.';
  END IF;

  IF payroll_row.status <> 'REVIEW' THEN
    RAISE EXCEPTION 'Hanya payroll berstatus REVIEW yang dapat dikembalikan ke DRAFT.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE source_type = 'PAYROLL'
      AND source_id = p_payroll_id::TEXT
  ) THEN
    RAISE EXCEPTION 'Payroll memiliki riwayat jurnal dan tidak dapat dibuka kembali untuk koreksi.';
  END IF;

  DELETE FROM public.payroll_items
  WHERE payroll_id = p_payroll_id;

  UPDATE public.monthly_payrolls
  SET status = 'DRAFT',
      total_compensation = 0,
      total_deductions = 0,
      net_salary = 0,
      updated_at = now()
  WHERE id = p_payroll_id
  RETURNING * INTO payroll_row;

  RETURN payroll_row;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_reviewed_payroll_for_correction(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_reviewed_payroll_for_correction(UUID) TO authenticated;
