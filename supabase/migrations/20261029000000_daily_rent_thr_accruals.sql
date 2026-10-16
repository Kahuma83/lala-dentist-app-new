INSERT INTO public.chart_of_accounts (
  code, name, account_type, account_category, normal_balance, is_active, description
)
VALUES
  ('2050', 'Utang Sewa Gedung', 'LIABILITY', 'OTHER_LIABILITY', 'CREDIT', true, 'Akrual sewa gedung yang belum dibayar'),
  ('2060', 'Utang THR', 'LIABILITY', 'OTHER_LIABILITY', 'CREDIT', true, 'Akrual THR yang belum dibayar'),
  ('5070', 'Beban THR', 'EXPENSE', 'OTHER_OPERATING_EXPENSE', 'DEBIT', true, 'Beban Tunjangan Hari Raya')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.recurring_expense_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  expense_type VARCHAR(20) NOT NULL CHECK (expense_type IN ('RENT', 'THR')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  starts_on DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (branch_id, expense_type)
);

CREATE TABLE IF NOT EXISTS public.recurring_expense_accruals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.recurring_expense_plans(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  expense_type VARCHAR(20) NOT NULL CHECK (expense_type IN ('RENT', 'THR')),
  accrual_date DATE NOT NULL,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (plan_id, accrual_date)
);

CREATE INDEX IF NOT EXISTS idx_recurring_expense_plans_branch
  ON public.recurring_expense_plans(branch_id, is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_expense_accruals_plan_date
  ON public.recurring_expense_accruals(plan_id, accrual_date);

GRANT SELECT, INSERT, UPDATE ON public.recurring_expense_plans TO authenticated;
GRANT SELECT ON public.recurring_expense_accruals TO authenticated;
ALTER TABLE public.recurring_expense_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expense_accruals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recurring expense plans read by branch" ON public.recurring_expense_plans;
CREATE POLICY "Recurring expense plans read by branch"
  ON public.recurring_expense_plans FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (
    public.get_user_role() = 'BRANCH_ADMIN'
    AND public.user_can_access_branch(branch_id)
  ));

DROP POLICY IF EXISTS "Recurring expense plans insert by branch" ON public.recurring_expense_plans;
CREATE POLICY "Recurring expense plans insert by branch"
  ON public.recurring_expense_plans FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (
    public.get_user_role() = 'BRANCH_ADMIN'
    AND public.user_can_access_branch(branch_id)
  ));

DROP POLICY IF EXISTS "Recurring expense plans update by branch" ON public.recurring_expense_plans;
CREATE POLICY "Recurring expense plans update by branch"
  ON public.recurring_expense_plans FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (
    public.get_user_role() = 'BRANCH_ADMIN'
    AND public.user_can_access_branch(branch_id)
  ))
  WITH CHECK (public.is_super_admin() OR (
    public.get_user_role() = 'BRANCH_ADMIN'
    AND public.user_can_access_branch(branch_id)
  ));

DROP POLICY IF EXISTS "Recurring expense accruals read by branch" ON public.recurring_expense_accruals;
CREATE POLICY "Recurring expense accruals read by branch"
  ON public.recurring_expense_accruals FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (
    public.get_user_role() = 'BRANCH_ADMIN'
    AND public.user_can_access_branch(branch_id)
  ));

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
        IF plan_row.expense_type = 'RENT' THEN
          period_start := date_trunc('month', accrual_day)::date;
          period_end := (period_start + interval '1 month' - interval '1 day')::date;
          daily_amount :=
            floor(plan_row.amount::numeric * EXTRACT(day FROM accrual_day) / EXTRACT(day FROM period_end))
            - floor(plan_row.amount::numeric * (EXTRACT(day FROM accrual_day) - 1) / EXTRACT(day FROM period_end));
        ELSE
          period_start := date_trunc('year', accrual_day)::date;
          period_end := (period_start + interval '1 year' - interval '1 day')::date;
          daily_amount :=
            floor(plan_row.amount::numeric * (accrual_day - period_start + 1) / (period_end - period_start + 1))
            - floor(plan_row.amount::numeric * (accrual_day - period_start) / (period_end - period_start + 1));
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
          ELSE
            SELECT id INTO expense_account_id FROM public.chart_of_accounts WHERE code = '5070' AND is_active;
            SELECT id INTO liability_account_id FROM public.chart_of_accounts WHERE code = '2060' AND is_active;
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
            'Akrual harian ' || CASE WHEN plan_row.expense_type = 'RENT' THEN 'Sewa Gedung' ELSE 'THR' END
              || ' (' || to_char(period_month, 'YYYY-MM') || ')',
            'EXPENSE', source_key, 'POSTED', month_amount, month_amount,
            'Sistem Akrual Harian', now(), 'Sistem Akrual Harian', 'ACCRUAL'
          ) RETURNING id INTO journal_id;

          INSERT INTO public.journal_lines (
            journal_entry_id, account_id, branch_id, debit, credit, description
          ) VALUES
            (journal_id, expense_account_id, plan_row.branch_id, month_amount, 0,
              'Beban akrual harian ' || CASE WHEN plan_row.expense_type = 'RENT' THEN 'sewa gedung' ELSE 'THR' END),
            (journal_id, liability_account_id, plan_row.branch_id, 0, month_amount,
              'Kewajiban akrual ' || CASE WHEN plan_row.expense_type = 'RENT' THEN 'sewa gedung' ELSE 'THR' END);

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

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
DO $$
DECLARE
  existing_job_id BIGINT;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'daily-recurring-expense-accrual';
  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
  PERFORM cron.schedule(
    'daily-recurring-expense-accrual',
    '5 17 * * *',
    'SELECT public.run_recurring_expense_accruals();'
  );
END;
$$;
