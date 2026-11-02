BEGIN;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_date DATE;

UPDATE public.invoices
SET invoice_date = (created_at AT TIME ZONE 'Asia/Jakarta')::DATE
WHERE invoice_date IS NULL;

ALTER TABLE public.invoices
  ALTER COLUMN invoice_date SET DEFAULT (timezone('Asia/Jakarta', now())::DATE),
  ALTER COLUMN invoice_date SET NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_invoice_document_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Jakarta')::DATE;
  v_last_treatment_date DATE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.invoice_date IS DISTINCT FROM OLD.invoice_date THEN
    RAISE EXCEPTION 'Tanggal invoice tidak dapat diubah setelah diterbitkan.';
  END IF;

  IF NEW.invoice_date > v_today THEN
    RAISE EXCEPTION 'Tanggal invoice tidak boleh melebihi tanggal hari ini.';
  END IF;

  SELECT max((coalesce(completed_at, handed_over_at, updated_at, created_at) AT TIME ZONE 'Asia/Jakarta')::DATE)
  INTO v_last_treatment_date
  FROM public.treatment_jobs
  WHERE visit_id = NEW.visit_id
    AND status IN ('SELESAI', 'DISERAHKAN');

  IF v_last_treatment_date IS NOT NULL AND NEW.invoice_date > v_last_treatment_date THEN
    RAISE EXCEPTION 'Tanggal invoice tidak boleh setelah tanggal tindakan terakhir selesai.';
  END IF;

  IF v_last_treatment_date IS NULL AND NEW.invoice_date < v_today THEN
    RAISE EXCEPTION 'Tanggal invoice mundur hanya dapat dipilih untuk kunjungan dengan tanggal tindakan selesai.';
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
      || to_char(NEW.invoice_date, 'YYYYMM')
      || '/'
      || lpad(nextval('public.invoice_number_seq')::TEXT, 6, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_invoice_document_date_insert ON public.invoices;
CREATE TRIGGER trg_validate_invoice_document_date_insert
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_invoice_document_date();

DROP TRIGGER IF EXISTS trg_validate_invoice_document_date_update ON public.invoices;
CREATE TRIGGER trg_validate_invoice_document_date_update
  BEFORE UPDATE OF invoice_date, visit_id ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_invoice_document_date();

COMMIT;
