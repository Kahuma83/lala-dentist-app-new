-- Keep UUID primary keys for relationships, but provide human-readable document numbers.
CREATE SEQUENCE IF NOT EXISTS public.patient_visit_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;

ALTER TABLE public.patient_visits
  ADD COLUMN IF NOT EXISTS visit_number TEXT;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS visit_number TEXT;

CREATE OR REPLACE FUNCTION public.get_invoice_branch_code(target_branch_id UUID)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN upper(b.name) LIKE '%GEBANG%' THEN 'GEB'
    WHEN upper(b.name) LIKE '%KENCONG%' THEN 'KEN'
    WHEN upper(b.name) LIKE '%AMBULU%' THEN 'AMB'
    WHEN upper(b.name) LIKE '%KAMPUS%' THEN 'KMP'
    WHEN upper(b.name) LIKE '%MUKTISARI%' THEN 'MKS'
    WHEN upper(b.name) LIKE '%LENGKONG%' OR upper(b.name) LIKE '%MUMBUL%' THEN 'LMB'
    ELSE upper(left(regexp_replace(coalesce(b.name, 'KLINIK'), '[^A-Za-z0-9]', '', 'g'), 3))
  END
  FROM public.dental_branches b
  WHERE b.id = target_branch_id;
$$;

CREATE OR REPLACE FUNCTION public.assign_patient_visit_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.visit_number IS NULL OR btrim(NEW.visit_number) = '' THEN
    NEW.visit_number := 'VIS/'
      || to_char(coalesce(NEW.visit_date_time, now()) AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD')
      || '/'
      || lpad(nextval('public.patient_visit_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_invoice_numbers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visit_number TEXT;
  v_branch_code TEXT;
BEGIN
  SELECT pv.visit_number INTO v_visit_number
  FROM public.patient_visits pv
  WHERE pv.id = NEW.visit_id;

  IF v_visit_number IS NULL THEN
    RAISE EXCEPTION 'Nomor kunjungan tidak ditemukan untuk invoice ini';
  END IF;

  NEW.visit_number := v_visit_number;

  IF NEW.invoice_number IS NULL OR btrim(NEW.invoice_number) = '' THEN
    v_branch_code := public.get_invoice_branch_code(NEW.branch_id);
    IF v_branch_code IS NULL THEN
      RAISE EXCEPTION 'Kode cabang tidak ditemukan untuk invoice ini';
    END IF;

    NEW.invoice_number := 'INV/'
      || v_branch_code
      || '/'
      || to_char(coalesce(NEW.created_at, now()) AT TIME ZONE 'Asia/Jakarta', 'YYYYMM')
      || '/'
      || lpad(nextval('public.invoice_number_seq')::TEXT, 6, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_patient_visit_number ON public.patient_visits;
CREATE TRIGGER trg_assign_patient_visit_number
  BEFORE INSERT ON public.patient_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_patient_visit_number();

DROP TRIGGER IF EXISTS trg_assign_invoice_numbers ON public.invoices;
CREATE TRIGGER trg_assign_invoice_numbers
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_invoice_numbers();

-- Replace old UUID-like values and clear duplicate human numbers before backfilling.
UPDATE public.patient_visits
SET visit_number = NULL
WHERE visit_number IS NOT NULL
  AND visit_number !~ '^VIS/[0-9]{8}/[0-9]{6}$';

WITH duplicate_visits AS (
  SELECT id,
         row_number() OVER (PARTITION BY visit_number ORDER BY created_at, id) AS duplicate_rank
  FROM public.patient_visits
  WHERE visit_number IS NOT NULL
)
UPDATE public.patient_visits pv
SET visit_number = NULL
FROM duplicate_visits dv
WHERE pv.id = dv.id
  AND dv.duplicate_rank > 1;

UPDATE public.invoices
SET invoice_number = NULL
WHERE invoice_number IS NOT NULL
  AND invoice_number !~ '^INV/[A-Z0-9]{3}/[0-9]{6}/[0-9]{6}$';

WITH duplicate_invoices AS (
  SELECT id,
         row_number() OVER (PARTITION BY invoice_number ORDER BY created_at, id) AS duplicate_rank
  FROM public.invoices
  WHERE invoice_number IS NOT NULL
)
UPDATE public.invoices i
SET invoice_number = NULL
FROM duplicate_invoices di
WHERE i.id = di.id
  AND di.duplicate_rank > 1;

DO $$
DECLARE
  v_max_visit_number BIGINT;
  v_max_invoice_number BIGINT;
BEGIN
  SELECT coalesce(max(split_part(visit_number, '/', 3)::BIGINT), 0)
  INTO v_max_visit_number
  FROM public.patient_visits
  WHERE visit_number ~ '^VIS/[0-9]{8}/[0-9]{6}$';

  PERFORM setval(
    'public.patient_visit_number_seq',
    greatest(v_max_visit_number, 1),
    v_max_visit_number > 0
  );

  SELECT coalesce(max(split_part(invoice_number, '/', 4)::BIGINT), 0)
  INTO v_max_invoice_number
  FROM public.invoices
  WHERE invoice_number ~ '^INV/[A-Z0-9]{3}/[0-9]{6}/[0-9]{6}$';

  PERFORM setval(
    'public.invoice_number_seq',
    greatest(v_max_invoice_number, 1),
    v_max_invoice_number > 0
  );
END;
$$;

-- Backfill existing records in creation order, preserving all UUID relationships.
WITH numbered_visits AS (
  SELECT id,
         'VIS/'
           || to_char(coalesce(visit_date_time, created_at) AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD')
           || '/'
           || lpad(nextval('public.patient_visit_number_seq')::TEXT, 6, '0') AS readable_number
  FROM public.patient_visits
  WHERE visit_number IS NULL OR btrim(visit_number) = ''
  ORDER BY created_at, id
)
UPDATE public.patient_visits pv
SET visit_number = numbered_visits.readable_number
FROM numbered_visits
WHERE pv.id = numbered_visits.id;

WITH numbered_invoices AS (
  SELECT i.id,
         'INV/'
           || coalesce(public.get_invoice_branch_code(i.branch_id), 'KLI')
           || '/'
           || to_char(i.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYYMM')
           || '/'
           || lpad(nextval('public.invoice_number_seq')::TEXT, 6, '0') AS readable_number
  FROM public.invoices i
  WHERE i.invoice_number IS NULL OR btrim(i.invoice_number) = ''
  ORDER BY i.created_at, i.id
)
UPDATE public.invoices i
SET invoice_number = numbered_invoices.readable_number
FROM numbered_invoices
WHERE i.id = numbered_invoices.id;

UPDATE public.invoices i
SET visit_number = pv.visit_number
FROM public.patient_visits pv
WHERE pv.id = i.visit_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_visits_visit_number
  ON public.patient_visits(visit_number);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_invoice_number
  ON public.invoices(invoice_number);
