ALTER TABLE public.external_doctor_payroll_entries
  DROP CONSTRAINT IF EXISTS external_doctor_payroll_entries_absence_request_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_external_doctor_payroll_request_branch_period
  ON public.external_doctor_payroll_entries (
    absence_request_id,
    branch_id,
    payroll_year,
    payroll_month
  );

CREATE OR REPLACE FUNCTION public.split_external_doctor_payroll_entry_by_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  branch_period RECORD;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  FOR branch_period IN
    SELECT
      assignment.branch_id,
      EXTRACT(MONTH FROM assignment.covered_date)::INT AS payroll_month,
      EXTRACT(YEAR FROM assignment.covered_date)::INT AS payroll_year,
      COUNT(*)::INT AS covered_days
    FROM public.external_doctor_replacement_assignments assignment
    WHERE assignment.absence_request_id = NEW.absence_request_id
      AND assignment.external_doctor_id = NEW.external_doctor_id
    GROUP BY
      assignment.branch_id,
      EXTRACT(YEAR FROM assignment.covered_date),
      EXTRACT(MONTH FROM assignment.covered_date)
    ORDER BY
      payroll_year,
      payroll_month,
      assignment.branch_id
  LOOP
    INSERT INTO public.external_doctor_payroll_entries (
      absence_request_id,
      external_doctor_id,
      branch_id,
      payroll_month,
      payroll_year,
      covered_days,
      daily_fee_snapshot,
      action_fee_snapshot,
      amount_snapshot
    ) VALUES (
      NEW.absence_request_id,
      NEW.external_doctor_id,
      branch_period.branch_id,
      branch_period.payroll_month,
      branch_period.payroll_year,
      branch_period.covered_days,
      NEW.daily_fee_snapshot,
      NEW.action_fee_snapshot,
      branch_period.covered_days * NEW.daily_fee_snapshot
    );
  END LOOP;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tidak ditemukan jadwal pengganti eksternal untuk membuat beban per cabang.';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS split_external_doctor_payroll_entry_by_branch
  ON public.external_doctor_payroll_entries;
CREATE TRIGGER split_external_doctor_payroll_entry_by_branch
  BEFORE INSERT ON public.external_doctor_payroll_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.split_external_doctor_payroll_entry_by_branch();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.external_doctor_payroll_entries entry
    WHERE entry.status <> 'PAID'
      AND (
        SELECT COUNT(*)
        FROM (
          SELECT DISTINCT assignment.branch_id,
            EXTRACT(YEAR FROM assignment.covered_date)::INT AS covered_year,
            EXTRACT(MONTH FROM assignment.covered_date)::INT AS covered_month
          FROM public.external_doctor_replacement_assignments assignment
          WHERE assignment.absence_request_id = entry.absence_request_id
            AND assignment.external_doctor_id = entry.external_doctor_id
        ) branch_periods
      ) > 1
      AND (entry.status <> 'PENDING_ACTION_COUNT' OR entry.action_count IS NOT NULL)
  ) THEN
    RAISE EXCEPTION
      'There are unpaid multi-branch doctor replacement entries with confirmed action counts. Reconcile their per-branch action counts before applying this migration.';
  END IF;
END;
$$;

DO $$
DECLARE
  legacy_entry public.external_doctor_payroll_entries;
BEGIN
  FOR legacy_entry IN
    SELECT entry.*
    FROM public.external_doctor_payroll_entries entry
    WHERE entry.status = 'PENDING_ACTION_COUNT'
      AND entry.action_count IS NULL
      AND (
        SELECT COUNT(*)
        FROM (
          SELECT DISTINCT assignment.branch_id,
            EXTRACT(YEAR FROM assignment.covered_date)::INT AS covered_year,
            EXTRACT(MONTH FROM assignment.covered_date)::INT AS covered_month
          FROM public.external_doctor_replacement_assignments assignment
          WHERE assignment.absence_request_id = entry.absence_request_id
            AND assignment.external_doctor_id = entry.external_doctor_id
        ) branch_periods
      ) > 1
  LOOP
    DELETE FROM public.external_doctor_payroll_entries
    WHERE id = legacy_entry.id;

    INSERT INTO public.external_doctor_payroll_entries (
      absence_request_id,
      external_doctor_id,
      branch_id,
      payroll_month,
      payroll_year,
      covered_days,
      daily_fee_snapshot,
      action_fee_snapshot,
      amount_snapshot
    ) VALUES (
      legacy_entry.absence_request_id,
      legacy_entry.external_doctor_id,
      legacy_entry.branch_id,
      legacy_entry.payroll_month,
      legacy_entry.payroll_year,
      legacy_entry.covered_days,
      legacy_entry.daily_fee_snapshot,
      legacy_entry.action_fee_snapshot,
      legacy_entry.amount_snapshot
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.split_external_doctor_payroll_entry_by_branch()
  FROM PUBLIC, anon, authenticated;
