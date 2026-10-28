ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS invoice_net_amount_snapshot BIGINT,
  ADD COLUMN IF NOT EXISTS invoice_paid_amount_snapshot BIGINT,
  ADD COLUMN IF NOT EXISTS invoice_outstanding_amount_snapshot BIGINT;

UPDATE public.payment_transactions
SET invoice_net_amount_snapshot = NULL
WHERE invoice_net_amount_snapshot IS NOT NULL AND invoice_net_amount_snapshot < 0;

UPDATE public.payment_transactions
SET invoice_paid_amount_snapshot = NULL
WHERE invoice_paid_amount_snapshot IS NOT NULL AND invoice_paid_amount_snapshot < 0;

UPDATE public.payment_transactions
SET invoice_outstanding_amount_snapshot = NULL
WHERE invoice_outstanding_amount_snapshot IS NOT NULL AND invoice_outstanding_amount_snapshot < 0;
