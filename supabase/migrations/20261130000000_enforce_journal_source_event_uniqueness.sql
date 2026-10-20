UPDATE public.journal_entries
SET event = CASE
  WHEN description ~* '(pembayaran|payment)' THEN 'PAYMENT'
  WHEN description ~* '(akrual|accrual)' THEN 'ACCRUAL'
  ELSE event
END
WHERE source_type = 'PAYROLL'
  AND event IS NULL
  AND description ~* '(pembayaran|payment|akrual|accrual)';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE source_type IN ('INVOICE', 'PAYMENT', 'COMPENSATION')
      AND source_id IS NOT NULL
      AND status <> 'VOID'
    GROUP BY source_type, source_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate active source journals exist for INVOICE, PAYMENT, or COMPENSATION. Reconcile them before applying journal uniqueness.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE source_type IN ('PAYROLL', 'EXPENSE')
      AND source_id IS NOT NULL
      AND status <> 'VOID'
    GROUP BY source_type, source_id, COALESCE(event, 'LEGACY')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate active journal source/event records exist for PAYROLL or EXPENSE. Reconcile them before applying journal uniqueness.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_single_event_source
  ON public.journal_entries (source_type, source_id)
  WHERE source_type IN ('INVOICE', 'PAYMENT', 'COMPENSATION')
    AND source_id IS NOT NULL
    AND status <> 'VOID';

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_payroll_expense_source_event
  ON public.journal_entries (source_type, source_id, COALESCE(event, 'LEGACY'))
  WHERE source_type IN ('PAYROLL', 'EXPENSE')
    AND source_id IS NOT NULL
    AND status <> 'VOID';
