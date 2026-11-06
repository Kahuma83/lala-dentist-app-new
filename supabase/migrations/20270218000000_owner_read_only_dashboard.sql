ALTER TABLE public.user_accounts
  DROP CONSTRAINT IF EXISTS chk_user_role;

ALTER TABLE public.user_accounts
  ADD CONSTRAINT chk_user_role
  CHECK (role IN (
    'SUPER_ADMIN',
    'BRANCH_ADMIN',
    'DOCTOR',
    'DOCTOR_ASSISTANT',
    'OB',
    'OWNER',
    'PATIENT'
  ));

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_accounts
    WHERE auth_user_id = auth.uid()
      AND role = 'OWNER'
      AND active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_owner_dashboard_summary(
  p_start_date DATE,
  p_end_date DATE
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
  IF auth.uid() IS NULL OR NOT public.is_owner() THEN
    RAISE EXCEPTION 'Akses ditolak: dashboard hanya untuk akun Owner aktif.'
      USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL
    OR p_end_date IS NULL
    OR p_end_date < p_start_date
    OR p_end_date - p_start_date > 365 THEN
    RAISE EXCEPTION 'Rentang tanggal dashboard tidak valid.'
      USING ERRCODE = '22023';
  END IF;

  WITH branch_metrics AS (
    SELECT
      branch.id,
      branch.name,
      (
        SELECT count(*)
        FROM public.bookings booking
        WHERE booking.branch_id = branch.id
          AND (booking.booking_date_time AT TIME ZONE 'Asia/Jakarta')::DATE
            BETWEEN p_start_date AND p_end_date
          AND booking.status NOT IN ('CANCELLED', 'RESCHEDULED')
      ) AS bookings,
      (
        SELECT count(*)
        FROM public.patient_visits visit
        WHERE visit.branch_id = branch.id
          AND (visit.visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE
            BETWEEN p_start_date AND p_end_date
          AND visit.visit_status <> 'CANCELLED'
      ) AS visits,
      (
        SELECT coalesce(sum(payment.amount), 0)
        FROM public.payment_transactions payment
        WHERE payment.branch_id = branch.id
          AND (payment.transaction_date_time AT TIME ZONE 'Asia/Jakarta')::DATE
            BETWEEN p_start_date AND p_end_date
          AND payment.status = 'SUCCESS'
      ) AS collected,
      (
        SELECT coalesce(sum(invoice.outstanding_amount), 0)
        FROM public.invoices invoice
        WHERE invoice.branch_id = branch.id
          AND (invoice.created_at AT TIME ZONE 'Asia/Jakarta')::DATE
            BETWEEN p_start_date AND p_end_date
          AND invoice.status IN ('OPEN', 'PARTIALLY_PAID')
      ) AS outstanding,
      (
        SELECT count(*)
        FROM public.queue_items queue
        WHERE queue.branch_id = branch.id
          AND queue.status IN ('WAITING', 'CALLING', 'IN_PREPARATION', 'IN_CONSULTATION')
      ) AS active_queue,
      (
        SELECT count(*)
        FROM public.treatment_jobs treatment
        WHERE treatment.branch_id = branch.id
          AND treatment.status <> 'SELESAI'
      ) AS open_treatments,
      (
        SELECT count(*)
        FROM public.inventory_items item
        WHERE item.branch_id = branch.id
          AND item.is_active
          AND item.current_stock <= item.minimum_stock
      ) AS low_stock_items
    FROM public.dental_branches branch
    WHERE branch.is_active
  )
  SELECT jsonb_build_object(
    'startDate', p_start_date,
    'endDate', p_end_date,
    'totals', jsonb_build_object(
      'bookings', coalesce(sum(metrics.bookings), 0),
      'visits', coalesce(sum(metrics.visits), 0),
      'collected', coalesce(sum(metrics.collected), 0),
      'outstanding', coalesce(sum(metrics.outstanding), 0),
      'activeQueue', coalesce(sum(metrics.active_queue), 0),
      'openTreatments', coalesce(sum(metrics.open_treatments), 0),
      'lowStockItems', coalesce(sum(metrics.low_stock_items), 0)
    ),
    'branches', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', metrics.id,
          'name', metrics.name,
          'bookings', metrics.bookings,
          'visits', metrics.visits,
          'collected', metrics.collected,
          'outstanding', metrics.outstanding,
          'activeQueue', metrics.active_queue,
          'openTreatments', metrics.open_treatments,
          'lowStockItems', metrics.low_stock_items
        )
        ORDER BY metrics.name
      ),
      '[]'::JSONB
    )
  )
  INTO v_result
  FROM branch_metrics metrics;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_owner_dashboard_summary(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_dashboard_summary(DATE, DATE) TO authenticated;

DO $$
DECLARE
  v_table_name TEXT;
  v_row_security_enabled BOOLEAN;
  v_tables TEXT[] := ARRAY[
    'dental_branches',
    'master_services',
    'branch_service_tariffs',
    'patient_profiles',
    'dental_doctors',
    'doctor_branch_assignments',
    'doctor_schedules',
    'doctor_assistant_pairings',
    'work_shifts',
    'staff_shift_assignments',
    'bookings',
    'booking_confirmations_h1',
    'patient_visits',
    'queue_items',
    'treatment_jobs',
    'treatment_activities',
    'treatment_visit_links',
    'treatment_incentives',
    'invoices',
    'invoice_items',
    'payment_transactions',
    'inventory_items',
    'inventory_movements',
    'staff',
    'staff_compensation_rules',
    'attendances',
    'overtime_records',
    'staff_absence_requests',
    'staff_replacement_assignments',
    'external_doctor_replacement_assignments',
    'monthly_payrolls',
    'payroll_items',
    'compensation_accruals',
    'chart_of_accounts',
    'journal_entries',
    'journal_lines',
    'branch_expenses',
    'accounting_journals',
    'accounting_journal_lines',
    'clinical_medical_records',
    'inventory_item_recipes',
    'inventory_recipe_change_requests',
    'inventory_treatment_recipes',
    'inventory_treatment_recipe_change_requests'
  ];
BEGIN
  FOREACH v_table_name IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table_name)) IS NOT NULL THEN
      SELECT rel.relrowsecurity
      INTO v_row_security_enabled
      FROM pg_class rel
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      WHERE ns.nspname = 'public'
        AND rel.relname = v_table_name;

      IF NOT v_row_security_enabled THEN
        EXECUTE format(
          'DROP POLICY IF EXISTS owner_preserve_preexisting_access ON public.%I',
          v_table_name
        );
        EXECUTE format(
          'CREATE POLICY owner_preserve_preexisting_access ON public.%I AS PERMISSIVE FOR ALL TO authenticated USING (public.get_user_role() <> ''OWNER'') WITH CHECK (public.get_user_role() <> ''OWNER'')',
          v_table_name
        );
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table_name);
      END IF;

      EXECUTE format(
        'DROP POLICY IF EXISTS owner_no_direct_business_data_access ON public.%I',
        v_table_name
      );
      EXECUTE format(
        'CREATE POLICY owner_no_direct_business_data_access ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.get_user_role() <> ''OWNER'') WITH CHECK (public.get_user_role() <> ''OWNER'')',
        v_table_name
      );
    END IF;
  END LOOP;
END;
$$;
