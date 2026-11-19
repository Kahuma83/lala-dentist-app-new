BEGIN;

DO $$
DECLARE
  existing_job RECORD;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'daily-recurring-expense-accrual'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END;
$$;

UPDATE public.recurring_expense_plans
SET is_active = false,
    updated_at = timezone('utc'::text, now())
WHERE is_active IS TRUE;

COMMIT;
