BEGIN;

INSERT INTO public.chart_of_accounts (
  code, name, account_type, account_category, normal_balance, is_active, description
)
VALUES (
  '2070',
  'Utang Pengeluaran Rutin',
  'LIABILITY',
  'OTHER_LIABILITY',
  'CREDIT',
  true,
  'Kewajiban dari akrual pengeluaran rutin selain sewa dan THR'
)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.recurring_expense_plans
  DROP CONSTRAINT IF EXISTS recurring_expense_plans_expense_type_check;
ALTER TABLE public.recurring_expense_plans
  ALTER COLUMN expense_type TYPE VARCHAR(60),
  ADD COLUMN IF NOT EXISTS expense_name TEXT,
  ADD COLUMN IF NOT EXISTS expense_account_id UUID
    REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.recurring_expense_accruals
  DROP CONSTRAINT IF EXISTS recurring_expense_accruals_expense_type_check;
ALTER TABLE public.recurring_expense_accruals
  ALTER COLUMN expense_type TYPE VARCHAR(60);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.recurring_expense_plans'::regclass
      AND conname = 'recurring_expense_plans_custom_details_check'
  ) THEN
    ALTER TABLE public.recurring_expense_plans
      ADD CONSTRAINT recurring_expense_plans_custom_details_check
      CHECK (
        expense_type IN ('RENT', 'THR')
        OR (
          NULLIF(BTRIM(expense_name), '') IS NOT NULL
          AND expense_account_id IS NOT NULL
        )
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_recurring_expense_accruals()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  clinic_today DATE := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  plan_row RECORD;
  accrual_day DATE;
  accrual_start DATE;
  period_start DATE;
  period_end DATE;
  period_month DATE;
  daily_amount BIGINT;
  month_amount BIGINT;
  expense_account_id UUID;
  liability_account_id UUID;
  journal_id UUID;
  source_key TEXT;
  journal_no TEXT;
  expense_label TEXT;
BEGIN
  FOR plan_row IN SELECT * FROM public.recurring_expense_plans LOOP
    IF plan_row.is_active THEN
      SELECT COALESCE(MAX(accrual_date) + 1, plan_row.starts_on)
      INTO accrual_start
      FROM public.recurring_expense_accruals
      WHERE plan_id = plan_row.id;

      FOR accrual_day IN
        SELECT generated_day::date
        FROM generate_series(accrual_start, clinic_today, interval '1 day') AS days(generated_day)
      LOOP
        IF plan_row.expense_type = 'THR' THEN
          period_start := date_trunc('year', accrual_day)::date;
          period_end := (period_start + interval '1 year' - interval '1 day')::date;
          daily_amount :=
            floor(plan_row.amount::numeric * (accrual_day - period_start + 1) / (period_end - period_start + 1))
            - floor(plan_row.amount::numeric * (accrual_day - period_start) / (period_end - period_start + 1));
        ELSE
          period_start := date_trunc('month', accrual_day)::date;
          period_end := (period_start + interval '1 month' - interval '1 day')::date;
          daily_amount :=
            floor(plan_row.amount::numeric * EXTRACT(day FROM accrual_day) / EXTRACT(day FROM period_end))
            - floor(plan_row.amount::numeric * (EXTRACT(day FROM accrual_day) - 1) / EXTRACT(day FROM period_end));
        END IF;

        INSERT INTO public.recurring_expense_accruals (
          plan_id, branch_id, expense_type, accrual_date, amount
        ) VALUES (
          plan_row.id, plan_row.branch_id, plan_row.expense_type, accrual_day, daily_amount
        ) ON CONFLICT (plan_id, accrual_date) DO NOTHING;
      END LOOP;
    END IF;

    period_month := date_trunc('month', plan_row.starts_on)::date;
    WHILE period_month < date_trunc('month', clinic_today)::date LOOP
      period_end := (period_month + interval '1 month' - interval '1 day')::date;
      source_key := 'RECURRING_ACCRUAL:' || plan_row.id::text || ':' || to_char(period_month, 'YYYYMM');

      IF NOT EXISTS (
        SELECT 1 FROM public.journal_entries WHERE source_type = 'EXPENSE' AND source_id = source_key
      ) THEN
        SELECT COALESCE(SUM(a.amount), 0)
        INTO month_amount
        FROM public.recurring_expense_accruals a
        WHERE a.plan_id = plan_row.id
          AND a.accrual_date >= period_month
          AND a.accrual_date <= period_end;

        IF month_amount > 0 THEN
          expense_account_id := NULL;
          liability_account_id := NULL;
          IF plan_row.expense_type = 'RENT' THEN
            SELECT id INTO expense_account_id FROM public.chart_of_accounts WHERE code = '5030' AND is_active;
            SELECT id INTO liability_account_id FROM public.chart_of_accounts WHERE code = '2050' AND is_active;
            expense_label := 'Sewa Gedung';
          ELSIF plan_row.expense_type = 'THR' THEN
            SELECT id INTO expense_account_id FROM public.chart_of_accounts WHERE code = '5070' AND is_active;
            SELECT id INTO liability_account_id FROM public.chart_of_accounts WHERE code = '2060' AND is_active;
            expense_label := 'THR';
          ELSE
            SELECT id INTO expense_account_id
            FROM public.chart_of_accounts
            WHERE id = plan_row.expense_account_id
              AND account_type = 'EXPENSE'
              AND is_active;
            SELECT id INTO liability_account_id
            FROM public.chart_of_accounts
            WHERE code = '2070'
              AND account_type = 'LIABILITY'
              AND is_active;
            expense_label := plan_row.expense_name;
          END IF;

          IF expense_account_id IS NULL OR liability_account_id IS NULL THEN
            RAISE EXCEPTION 'Akun beban atau kewajiban untuk akrual % tidak ditemukan/aktif', plan_row.expense_type;
          END IF;

          journal_no := 'JRN-ACR-' || upper(replace(plan_row.branch_id::text, '-', ''))
            || '-' || to_char(period_month, 'YYYYMM') || '-' || plan_row.expense_type;
          INSERT INTO public.journal_entries (
            journal_number, journal_date, branch_id, description, source_type, source_id,
            status, total_debit, total_credit, created_by, posted_at, posted_by, event
          ) VALUES (
            journal_no, period_end, plan_row.branch_id,
            'Akrual harian ' || expense_label || ' (' || to_char(period_month, 'YYYY-MM') || ')',
            'EXPENSE', source_key, 'POSTED', month_amount, month_amount,
            'Sistem Akrual Harian', now(), 'Sistem Akrual Harian', 'ACCRUAL'
          ) RETURNING id INTO journal_id;

          INSERT INTO public.journal_lines (
            journal_entry_id, account_id, branch_id, debit, credit, description
          ) VALUES
            (journal_id, expense_account_id, plan_row.branch_id, month_amount, 0,
              'Beban akrual harian ' || expense_label),
            (journal_id, liability_account_id, plan_row.branch_id, 0, month_amount,
              'Kewajiban akrual ' || expense_label);

          UPDATE public.recurring_expense_accruals
          SET journal_entry_id = journal_id
          WHERE plan_id = plan_row.id
            AND accrual_date >= period_month
            AND accrual_date <= period_end;
        END IF;
      END IF;

      period_month := (period_month + interval '1 month')::date;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.run_recurring_expense_accruals() FROM PUBLIC, authenticated;

COMMIT;
