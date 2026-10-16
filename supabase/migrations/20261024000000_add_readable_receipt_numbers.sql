-- Give payment receipts a durable, human-readable number; UUIDs remain internal keys.
CREATE SEQUENCE IF NOT EXISTS public.payment_receipt_number_seq;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS receipt_number TEXT;

CREATE OR REPLACE FUNCTION public.assign_payment_receipt_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_branch_code TEXT;
BEGIN
  IF NEW.receipt_number IS NULL OR btrim(NEW.receipt_number) = '' THEN
    v_branch_code := public.get_invoice_branch_code(NEW.branch_id);
    IF v_branch_code IS NULL THEN
      RAISE EXCEPTION 'Kode cabang tidak ditemukan untuk kwitansi ini';
    END IF;

    NEW.receipt_number := 'KWT/'
      || v_branch_code
      || '/'
      || to_char(coalesce(NEW.transaction_date_time, now()) AT TIME ZONE 'Asia/Jakarta', 'YYYYMM')
      || '/'
      || lpad(nextval('public.payment_receipt_number_seq')::TEXT, 6, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_payment_receipt_number ON public.payment_transactions;
CREATE TRIGGER trg_assign_payment_receipt_number
  BEFORE INSERT ON public.payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_payment_receipt_number();

UPDATE public.payment_transactions
SET receipt_number = NULL
WHERE receipt_number IS NOT NULL
  AND receipt_number !~ '^KWT/[A-Z0-9]{3}/[0-9]{6}/[0-9]{6}$';

WITH duplicate_receipts AS (
  SELECT id,
         row_number() OVER (PARTITION BY receipt_number ORDER BY created_at, id) AS duplicate_rank
  FROM public.payment_transactions
  WHERE receipt_number IS NOT NULL
)
UPDATE public.payment_transactions p
SET receipt_number = NULL
FROM duplicate_receipts d
WHERE p.id = d.id
  AND d.duplicate_rank > 1;

DO $$
DECLARE
  v_max_receipt_number BIGINT;
BEGIN
  SELECT coalesce(max(split_part(receipt_number, '/', 4)::BIGINT), 0)
  INTO v_max_receipt_number
  FROM public.payment_transactions
  WHERE receipt_number ~ '^KWT/[A-Z0-9]{3}/[0-9]{6}/[0-9]{6}$';

  PERFORM setval(
    'public.payment_receipt_number_seq',
    greatest(v_max_receipt_number, 1),
    v_max_receipt_number > 0
  );
END;
$$;

WITH numbered_receipts AS (
  SELECT p.id,
         'KWT/'
           || coalesce(public.get_invoice_branch_code(p.branch_id), 'KLI')
           || '/'
           || to_char(p.transaction_date_time AT TIME ZONE 'Asia/Jakarta', 'YYYYMM')
           || '/'
           || lpad(nextval('public.payment_receipt_number_seq')::TEXT, 6, '0') AS readable_number
  FROM public.payment_transactions p
  WHERE p.receipt_number IS NULL OR btrim(p.receipt_number) = ''
  ORDER BY p.transaction_date_time, p.created_at, p.id
)
UPDATE public.payment_transactions p
SET receipt_number = numbered_receipts.readable_number
FROM numbered_receipts
WHERE p.id = numbered_receipts.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transactions_receipt_number
  ON public.payment_transactions(receipt_number);
