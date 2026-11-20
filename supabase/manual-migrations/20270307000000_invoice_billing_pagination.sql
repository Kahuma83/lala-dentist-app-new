CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date_branch_status
  ON public.invoices (invoice_date DESC, branch_id, status);

CREATE OR REPLACE FUNCTION public.get_invoice_billing_page(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_status TEXT DEFAULT 'ALL',
  p_branch_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_offset INTEGER DEFAULT 0,
  p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT := upper(coalesce(p_status, 'ALL'));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi login diperlukan untuk membaca invoice.';
  END IF;

  IF (p_start_date IS NULL) <> (p_end_date IS NULL) THEN
    RAISE EXCEPTION 'Rentang tanggal invoice harus lengkap.';
  END IF;

  IF p_start_date IS NOT NULL AND p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Rentang tanggal invoice tidak valid.';
  END IF;

  IF v_status NOT IN ('ALL', 'UNPAID', 'DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED') THEN
    RAISE EXCEPTION 'Filter status invoice tidak valid.';
  END IF;

  IF p_offset < 0 OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Rentang halaman invoice tidak valid.';
  END IF;

  RETURN (
    WITH filtered AS (
      SELECT i.*
      FROM public.invoices AS i
      WHERE (p_start_date IS NULL OR i.invoice_date >= p_start_date)
        AND (p_end_date IS NULL OR i.invoice_date <= p_end_date)
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        AND (
          v_status = 'ALL'
          OR (v_status = 'UNPAID' AND i.status IN ('OPEN', 'PARTIALLY_PAID'))
          OR (v_status <> 'UNPAID' AND i.status = v_status)
        )
        AND (
          nullif(btrim(p_search), '') IS NULL
          OR coalesce(i.invoice_number, '') ILIKE '%' || btrim(p_search) || '%'
          OR i.id::TEXT ILIKE '%' || btrim(p_search) || '%'
          OR EXISTS (
            SELECT 1
            FROM public.patient_profiles AS patient
            WHERE patient.id::TEXT = i.patient_id::TEXT
              AND (
                coalesce(patient.full_name, '') ILIKE '%' || btrim(p_search) || '%'
                OR coalesce(patient.name, '') ILIKE '%' || btrim(p_search) || '%'
              )
          )
        )
    ),
    summary AS (
      SELECT
        coalesce(sum(net_amount) FILTER (WHERE status <> 'CANCELLED'), 0) AS total_invoiced,
        coalesce(sum(paid_amount) FILTER (WHERE status <> 'CANCELLED'), 0) AS total_paid,
        coalesce(sum(outstanding_amount) FILTER (WHERE status <> 'CANCELLED'), 0) AS total_outstanding,
        count(*) FILTER (WHERE status IN ('OPEN', 'PARTIALLY_PAID')) AS open_count
      FROM filtered
    ),
    page AS (
      SELECT *
      FROM filtered
      ORDER BY invoice_date DESC, created_at DESC, id DESC
      OFFSET p_offset
      LIMIT p_limit
    )
    SELECT jsonb_build_object(
      'items',
      coalesce(
        (SELECT jsonb_agg(to_jsonb(page) ORDER BY page.invoice_date DESC, page.created_at DESC, page.id DESC) FROM page),
        '[]'::JSONB
      ),
      'totalCount',
      (SELECT count(*) FROM filtered),
      'summary',
      (SELECT jsonb_build_object(
        'totalInvoiced', total_invoiced,
        'totalPaid', total_paid,
        'totalOutstanding', total_outstanding,
        'openCount', open_count
      ) FROM summary)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_billing_page(DATE, DATE, TEXT, UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invoice_billing_page(DATE, DATE, TEXT, UUID, TEXT, INTEGER, INTEGER) TO authenticated;
