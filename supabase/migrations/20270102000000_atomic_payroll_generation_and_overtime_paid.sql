CREATE OR REPLACE FUNCTION public.save_draft_payroll_with_items(
  p_payroll_id UUID,
  p_payroll_payload JSONB,
  p_payroll_items JSONB
)
RETURNS public.monthly_payrolls
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  payroll_row public.monthly_payrolls%ROWTYPE;
BEGIN
  IF p_payroll_payload IS NULL OR jsonb_typeof(p_payroll_payload) <> 'object' THEN
    RAISE EXCEPTION 'Data payroll tidak valid.';
  END IF;
  IF p_payroll_items IS NULL OR jsonb_typeof(p_payroll_items) <> 'array' THEN
    RAISE EXCEPTION 'Rincian payroll tidak valid.';
  END IF;

  IF p_payroll_id IS NULL THEN
    INSERT INTO public.monthly_payrolls (
      staff_id,
      branch_id,
      month,
      year,
      base_salary,
      total_compensation,
      total_deductions,
      net_salary,
      status,
      created_at,
      updated_at
    )
    VALUES (
      (p_payroll_payload->>'staff_id')::UUID,
      NULLIF(p_payroll_payload->>'branch_id', '')::UUID,
      (p_payroll_payload->>'month')::INT,
      (p_payroll_payload->>'year')::INT,
      (p_payroll_payload->>'base_salary')::BIGINT,
      (p_payroll_payload->>'total_compensation')::BIGINT,
      (p_payroll_payload->>'total_deductions')::BIGINT,
      (p_payroll_payload->>'net_salary')::BIGINT,
      'DRAFT',
      now(),
      COALESCE((p_payroll_payload->>'updated_at')::TIMESTAMPTZ, now())
    )
    RETURNING * INTO payroll_row;
  ELSE
    SELECT *
    INTO payroll_row
    FROM public.monthly_payrolls
    WHERE id = p_payroll_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payroll tidak ditemukan atau akses tidak diizinkan.';
    END IF;
    IF payroll_row.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Hanya payroll berstatus DRAFT yang dapat dihitung ulang.';
    END IF;

    UPDATE public.monthly_payrolls
    SET staff_id = (p_payroll_payload->>'staff_id')::UUID,
        branch_id = NULLIF(p_payroll_payload->>'branch_id', '')::UUID,
        month = (p_payroll_payload->>'month')::INT,
        year = (p_payroll_payload->>'year')::INT,
        base_salary = (p_payroll_payload->>'base_salary')::BIGINT,
        total_compensation = (p_payroll_payload->>'total_compensation')::BIGINT,
        total_deductions = (p_payroll_payload->>'total_deductions')::BIGINT,
        net_salary = (p_payroll_payload->>'net_salary')::BIGINT,
        status = 'DRAFT',
        updated_at = COALESCE((p_payroll_payload->>'updated_at')::TIMESTAMPTZ, now())
    WHERE id = p_payroll_id
    RETURNING * INTO payroll_row;

    DELETE FROM public.payroll_items
    WHERE payroll_id = payroll_row.id;
  END IF;

  INSERT INTO public.payroll_items (
    payroll_id,
    description_snapshot,
    amount_snapshot,
    type,
    source_id
  )
  SELECT
    payroll_row.id,
    item.description_snapshot,
    item.amount_snapshot,
    item.type,
    item.source_id
  FROM jsonb_to_recordset(p_payroll_items) AS item(
    description_snapshot VARCHAR(200),
    amount_snapshot BIGINT,
    type VARCHAR(30),
    source_id TEXT
  );

  RETURN payroll_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_draft_payroll_with_items(UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_draft_payroll_with_items(UUID, JSONB, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_payroll_paid_and_overtime(p_payroll_id UUID)
RETURNS public.monthly_payrolls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  payroll_row public.monthly_payrolls%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat menandai payroll sebagai PAID.';
  END IF;

  SELECT *
  INTO payroll_row
  FROM public.monthly_payrolls
  WHERE id = p_payroll_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll tidak ditemukan.';
  END IF;
  IF payroll_row.status NOT IN ('APPROVED', 'PAID') THEN
    RAISE EXCEPTION 'Hanya payroll APPROVED yang dapat ditandai PAID.';
  END IF;

  UPDATE public.monthly_payrolls
  SET status = 'PAID',
      updated_at = now()
  WHERE id = p_payroll_id
  RETURNING * INTO payroll_row;

  UPDATE public.overtime_records overtime
  SET status = 'PAID',
      updated_at = now(),
      updated_by = 'payroll'
  WHERE overtime.status = 'APPROVED'
    AND overtime.id::TEXT IN (
      SELECT item.source_id
      FROM public.payroll_items item
      WHERE item.payroll_id = p_payroll_id
        AND item.type = 'EARNING'
        AND item.description_snapshot LIKE 'Lembur Disetujui%'
        AND item.source_id IS NOT NULL
    );

  RETURN payroll_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_payroll_paid_and_overtime(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_payroll_paid_and_overtime(UUID) TO authenticated;
