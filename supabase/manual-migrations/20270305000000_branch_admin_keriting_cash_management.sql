-- Apply manually after reviewing the production schema and backing up the database.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_branch_cash_rounding_report(
  p_date DATE,
  p_branch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL
    OR public.get_user_role() <> 'BRANCH_ADMIN'
    OR p_branch_id IS NULL
    OR NOT public.user_can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'Akses ditolak: laporan kas hanya tersedia untuk cabang Admin yang aktif.'
      USING ERRCODE = '42501';
  END IF;

  IF p_date IS NULL OR p_date > (now() AT TIME ZONE 'Asia/Jakarta')::DATE THEN
    RAISE EXCEPTION 'Tanggal rekap kas tidak valid.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.dental_branches branch
    WHERE branch.id = p_branch_id AND branch.is_active
  ) THEN
    RAISE EXCEPTION 'Cabang tidak ditemukan atau tidak aktif.'
      USING ERRCODE = '22023';
  END IF;

  WITH active_branches AS (
    SELECT branch.id, branch.name
    FROM public.dental_branches branch
    WHERE branch.is_active
      AND branch.id = p_branch_id
  ),
  payments_on_date AS (
    SELECT
      payment.branch_id,
      coalesce(sum(payment.amount), 0) AS total,
      coalesce(sum(payment.amount) FILTER (WHERE payment.payment_method = 'QRIS'), 0) AS qris,
      coalesce(sum(payment.amount) FILTER (WHERE payment.payment_method = 'OTHER'), 0) AS edc,
      coalesce(sum(payment.amount) FILTER (WHERE payment.payment_method = 'TRANSFER'), 0) AS transfer,
      coalesce(sum(payment.amount) FILTER (WHERE payment.payment_method = 'CASH'), 0) AS cash_collected
    FROM public.payment_transactions payment
    WHERE payment.status = 'SUCCESS'
      AND payment.payment_date = p_date
      AND payment.branch_id = p_branch_id
    GROUP BY payment.branch_id
  ),
  cash_journals AS (
    SELECT
      journal.id,
      journal.branch_id,
      journal.journal_date,
      coalesce(journal.cash_source, original.cash_source, 'DAILY_CASH') AS cash_source,
      coalesce(sum(
        CASE
          WHEN account.account_category = 'CASH' THEN line.credit - line.debit
          ELSE 0
        END
      ), 0) AS cash_outflow,
      coalesce(bool_or(
        account.account_category = 'CASH'
        AND (line.debit > 0 OR line.credit > 0)
      ), false) AS paid_from_cash
    FROM public.journal_entries journal
    LEFT JOIN public.journal_entries original
      ON original.id = journal.reversal_of_journal_id
    JOIN public.journal_lines line
      ON line.journal_entry_id = journal.id
    JOIN public.chart_of_accounts account
      ON account.id = line.account_id
    WHERE journal.status = 'POSTED'
      AND journal.source_type IN ('EXPENSE', 'MANUAL', 'ADJUSTMENT', 'REVERSAL')
      AND (
        journal.source_type <> 'REVERSAL'
        OR original.source_type IN ('EXPENSE', 'MANUAL', 'ADJUSTMENT')
      )
      AND journal.journal_date <= p_date
      AND journal.branch_id = p_branch_id
    GROUP BY
      journal.id,
      journal.branch_id,
      journal.journal_date,
      coalesce(journal.cash_source, original.cash_source, 'DAILY_CASH')
    HAVING bool_or(
      account.account_category = 'CASH'
      AND (line.debit > 0 OR line.credit > 0)
    )
  ),
  expenses_on_date AS (
    SELECT
      cash_journal.branch_id,
      coalesce(sum(cash_journal.cash_outflow) FILTER (
        WHERE cash_journal.cash_source <> 'KERITING'
      ), 0) AS expenses,
      coalesce(sum(cash_journal.cash_outflow) FILTER (
        WHERE cash_journal.cash_source = 'KERITING'
      ), 0) AS keriting_expenses
    FROM cash_journals cash_journal
    WHERE cash_journal.journal_date = p_date
    GROUP BY cash_journal.branch_id
  ),
  openings AS (
    SELECT
      entry.branch_id,
      entry.entry_date,
      entry.amount
    FROM public.owner_cash_rounding_entries entry
    WHERE entry.entry_type = 'OPENING_BALANCE'
      AND entry.branch_id = p_branch_id
  ),
  payment_history AS (
    SELECT
      payment.branch_id,
      payment.payment_date AS report_date,
      coalesce(sum(payment.amount) FILTER (WHERE payment.payment_method = 'CASH'), 0) AS cash_collected
    FROM public.payment_transactions payment
    JOIN openings opening ON opening.branch_id = payment.branch_id
    WHERE payment.status = 'SUCCESS'
      AND payment.payment_date BETWEEN opening.entry_date AND p_date
      AND payment.branch_id = p_branch_id
    GROUP BY payment.branch_id, payment.payment_date
  ),
  expense_history AS (
    SELECT
      cash_journal.branch_id,
      cash_journal.journal_date AS report_date,
      coalesce(sum(cash_journal.cash_outflow), 0) AS expenses
    FROM cash_journals cash_journal
    JOIN openings opening ON opening.branch_id = cash_journal.branch_id
    WHERE cash_journal.paid_from_cash
      AND cash_journal.cash_source <> 'KERITING'
      AND cash_journal.journal_date BETWEEN opening.entry_date AND p_date
    GROUP BY cash_journal.branch_id, cash_journal.journal_date
  ),
  daily_cash_history AS (
    SELECT
      coalesce(payment.branch_id, expense.branch_id) AS branch_id,
      coalesce(payment.report_date, expense.report_date) AS report_date,
      coalesce(payment.cash_collected, 0) - coalesce(expense.expenses, 0) AS cash_available
    FROM payment_history payment
    FULL OUTER JOIN expense_history expense
      ON expense.branch_id = payment.branch_id
      AND expense.report_date = payment.report_date
  ),
  rounding_history AS (
    SELECT
      history.branch_id,
      coalesce(sum(
        CASE
          WHEN history.cash_available > 0 THEN mod(history.cash_available, 50000)
          ELSE 0
        END
      ), 0) AS accumulated_rounding
    FROM daily_cash_history history
    GROUP BY history.branch_id
  ),
  keriting_expense_history AS (
    SELECT
      cash_journal.branch_id,
      coalesce(sum(cash_journal.cash_outflow), 0) AS expenses
    FROM cash_journals cash_journal
    JOIN openings opening ON opening.branch_id = cash_journal.branch_id
    WHERE cash_journal.paid_from_cash
      AND cash_journal.cash_source = 'KERITING'
      AND cash_journal.journal_date BETWEEN opening.entry_date AND p_date
    GROUP BY cash_journal.branch_id
  ),
  settlements AS (
    SELECT
      entry.branch_id,
      coalesce(sum(entry.amount), 0) AS amount
    FROM public.owner_cash_rounding_entries entry
    JOIN openings opening ON opening.branch_id = entry.branch_id
    WHERE entry.entry_type = 'SETTLEMENT'
      AND entry.entry_date BETWEEN opening.entry_date AND p_date
      AND entry.branch_id = p_branch_id
    GROUP BY entry.branch_id
  ),
  branch_report AS (
    SELECT
      branch.id,
      branch.name,
      coalesce(payment.total, 0) AS total,
      coalesce(payment.qris, 0) AS qris,
      coalesce(payment.edc, 0) AS edc,
      coalesce(payment.transfer, 0) AS transfer,
      coalesce(payment.cash_collected, 0) AS cash_collected,
      coalesce(expense.expenses, 0) AS expenses,
      coalesce(expense.keriting_expenses, 0) AS keriting_expenses,
      coalesce(payment.cash_collected, 0) - coalesce(expense.expenses, 0) AS cash,
      CASE
        WHEN coalesce(payment.cash_collected, 0) - coalesce(expense.expenses, 0) > 0
        THEN (coalesce(payment.cash_collected, 0) - coalesce(expense.expenses, 0))
          - mod(coalesce(payment.cash_collected, 0) - coalesce(expense.expenses, 0), 50000)
        ELSE 0
      END AS amount_to_bring,
      CASE
        WHEN coalesce(payment.cash_collected, 0) - coalesce(expense.expenses, 0) > 0
        THEN mod(coalesce(payment.cash_collected, 0) - coalesce(expense.expenses, 0), 50000)
        ELSE 0
      END AS rounding_today,
      CASE
        WHEN opening.branch_id IS NULL OR p_date < opening.entry_date THEN NULL
        ELSE opening.amount
          + coalesce(rounding.accumulated_rounding, 0)
          - coalesce(keriting_expense.expenses, 0)
          - coalesce(settlement.amount, 0)
      END AS rounding_balance,
      greatest(0, coalesce(expense.expenses, 0) - coalesce(payment.cash_collected, 0)) AS cash_shortfall,
      opening.branch_id IS NOT NULL AS opening_configured,
      opening.entry_date AS opening_date
    FROM active_branches branch
    LEFT JOIN payments_on_date payment ON payment.branch_id = branch.id
    LEFT JOIN expenses_on_date expense ON expense.branch_id = branch.id
    LEFT JOIN openings opening ON opening.branch_id = branch.id
    LEFT JOIN rounding_history rounding ON rounding.branch_id = branch.id
    LEFT JOIN keriting_expense_history keriting_expense ON keriting_expense.branch_id = branch.id
    LEFT JOIN settlements settlement ON settlement.branch_id = branch.id
  )
  SELECT jsonb_build_object(
    'date', p_date,
    'totals', jsonb_build_object(
      'total', coalesce(sum(report.total), 0),
      'qris', coalesce(sum(report.qris), 0),
      'edc', coalesce(sum(report.edc), 0),
      'transfer', coalesce(sum(report.transfer), 0),
      'cashCollected', coalesce(sum(report.cash_collected), 0),
      'expenses', coalesce(sum(report.expenses), 0),
      'keritingExpenses', coalesce(sum(report.keriting_expenses), 0),
      'cash', coalesce(sum(report.cash), 0),
      'amountToBring', coalesce(sum(report.amount_to_bring), 0),
      'roundingToday', coalesce(sum(report.rounding_today), 0),
      'roundingBalance', coalesce(sum(report.rounding_balance), 0),
      'cashShortfall', coalesce(sum(report.cash_shortfall), 0),
      'allBranchesConfigured', coalesce(bool_and(report.rounding_balance IS NOT NULL), true)
    ),
    'branches', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', report.id,
          'name', report.name,
          'total', report.total,
          'qris', report.qris,
          'edc', report.edc,
          'transfer', report.transfer,
          'cashCollected', report.cash_collected,
          'expenses', report.expenses,
          'keritingExpenses', report.keriting_expenses,
          'cash', report.cash,
          'amountToBring', report.amount_to_bring,
          'roundingToday', report.rounding_today,
          'roundingBalance', report.rounding_balance,
          'cashShortfall', report.cash_shortfall,
          'openingConfigured', report.opening_configured,
          'openingDate', report.opening_date
        )
        ORDER BY report.name
      ),
      '[]'::JSONB
    )
  )
  INTO v_result
  FROM branch_report report;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_owner_cash_rounding_entry(
  p_branch_id UUID,
  p_entry_type VARCHAR,
  p_entry_date DATE,
  p_amount BIGINT,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_available_balance BIGINT;
  v_entry_id UUID;
  v_report JSONB;
  v_latest_settlement_date DATE;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_owner()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND p_branch_id IS NOT NULL
      AND public.user_can_access_branch(p_branch_id)
    )
  ) THEN
    RAISE EXCEPTION 'Akses ditolak: transaksi uang keriting hanya untuk Owner atau Admin cabang terkait.'
      USING ERRCODE = '42501';
  END IF;

  IF p_branch_id IS NULL OR p_entry_date IS NULL
    OR p_entry_date > (now() AT TIME ZONE 'Asia/Jakarta')::DATE
    OR p_entry_type IS NULL
    OR p_entry_type NOT IN ('OPENING_BALANCE', 'SETTLEMENT')
    OR p_amount IS NULL OR p_amount < 0
    OR length(coalesce(trim(p_description), '')) > 300 THEN
    RAISE EXCEPTION 'Data transaksi uang keriting tidak valid.'
      USING ERRCODE = '22023';
  END IF;

  IF p_entry_type = 'SETTLEMENT'
    AND (p_amount < 50000 OR mod(p_amount, 50000) <> 0) THEN
    RAISE EXCEPTION 'Setoran uang keriting harus minimal Rp50.000 dan dalam kelipatan Rp50.000.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dental_branches branch
    WHERE branch.id = p_branch_id AND branch.is_active
  ) THEN
    RAISE EXCEPTION 'Cabang tidak ditemukan atau tidak aktif.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_branch_id::TEXT));

  IF p_entry_type = 'OPENING_BALANCE' THEN
    IF EXISTS (
      SELECT 1
      FROM public.owner_cash_rounding_entries entry
      WHERE entry.branch_id = p_branch_id
        AND entry.entry_type = 'OPENING_BALANCE'
    ) THEN
      RAISE EXCEPTION 'Saldo awal uang keriting untuk cabang ini sudah pernah dicatat.'
        USING ERRCODE = '23505';
    END IF;
  ELSE
    SELECT max(entry.entry_date)
    INTO v_latest_settlement_date
    FROM public.owner_cash_rounding_entries entry
    WHERE entry.branch_id = p_branch_id
      AND entry.entry_type = 'SETTLEMENT';

    IF v_latest_settlement_date IS NOT NULL AND p_entry_date < v_latest_settlement_date THEN
      RAISE EXCEPTION 'Tanggal setoran tidak boleh lebih lama dari setoran sebelumnya.'
        USING ERRCODE = '22023';
    END IF;

    IF public.is_owner() THEN
      v_report := public.get_owner_daily_cash_report(p_entry_date);
    ELSE
      v_report := public.get_branch_cash_rounding_report(p_entry_date, p_branch_id);
    END IF;

    SELECT (item->>'roundingBalance')::BIGINT
    INTO v_available_balance
    FROM jsonb_array_elements(v_report->'branches') AS branches(item)
    WHERE item->>'id' = p_branch_id::TEXT;

    IF v_available_balance IS NULL THEN
      RAISE EXCEPTION 'Atur saldo awal uang keriting sebelum mencatat setoran.'
        USING ERRCODE = '22023';
    END IF;

    IF p_amount > v_available_balance THEN
      RAISE EXCEPTION 'Nominal setoran melebihi saldo uang keriting yang tersedia.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.owner_cash_rounding_entries (
    branch_id,
    entry_date,
    entry_type,
    amount,
    description,
    created_by
  )
  VALUES (
    p_branch_id,
    p_entry_date,
    p_entry_type,
    p_amount,
    coalesce(nullif(trim(p_description), ''), CASE
      WHEN p_entry_type = 'OPENING_BALANCE' THEN 'Saldo awal uang keriting'
      ELSE 'Setoran uang keriting'
    END),
    auth.uid()
  )
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_branch_cash_rounding_report(DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_cash_rounding_report(DATE, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.record_owner_cash_rounding_entry(UUID, VARCHAR, DATE, BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_owner_cash_rounding_entry(UUID, VARCHAR, DATE, BIGINT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
