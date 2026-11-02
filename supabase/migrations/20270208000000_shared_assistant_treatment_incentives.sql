BEGIN;

CREATE TABLE IF NOT EXISTS public.assistant_treatment_incentive_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.master_services(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  CONSTRAINT assistant_treatment_incentive_rates_service_id_key UNIQUE (service_id)
);

ALTER TABLE public.assistant_treatment_incentive_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.assistant_treatment_incentive_rates FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.assistant_treatment_incentive_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assistant_treatment_incentive_rates TO service_role;

DROP POLICY IF EXISTS "Authenticated users read assistant treatment incentive rates"
  ON public.assistant_treatment_incentive_rates;
CREATE POLICY "Authenticated users read assistant treatment incentive rates"
  ON public.assistant_treatment_incentive_rates
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.save_shared_assistant_treatment_incentive_rate(
  p_service_id UUID,
  p_amount BIGINT,
  p_is_active BOOLEAN
)
RETURNS public.assistant_treatment_incentive_rates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rate public.assistant_treatment_incentive_rates%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat mengatur insentif tindakan bersama untuk asisten.';
  END IF;
  IF p_service_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_is_active IS NULL THEN
    RAISE EXCEPTION 'Tindakan, nominal positif, dan status tarif wajib diisi.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.master_services
    WHERE id = p_service_id
  ) THEN
    RAISE EXCEPTION 'Layanan tindakan untuk insentif asisten tidak ditemukan.';
  END IF;

  INSERT INTO public.assistant_treatment_incentive_rates (service_id, amount, is_active)
  VALUES (p_service_id, p_amount, p_is_active)
  ON CONFLICT (service_id)
  DO UPDATE SET
    amount = EXCLUDED.amount,
    is_active = EXCLUDED.is_active,
    updated_at = timezone('utc'::TEXT, now())
  RETURNING * INTO v_rate;

  RETURN v_rate;
END;
$$;

REVOKE ALL ON FUNCTION public.save_shared_assistant_treatment_incentive_rate(UUID, BIGINT, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_shared_assistant_treatment_incentive_rate(UUID, BIGINT, BOOLEAN)
  TO authenticated;

DROP POLICY IF EXISTS "Validated shared assistant treatment incentive insert"
  ON public.compensation_accruals;
CREATE POLICY "Validated shared assistant treatment incentive insert"
  ON public.compensation_accruals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    rule_id_snapshot = 'ASSISTANT_TREATMENT_BASE_V1'
    AND rule_type_snapshot = 'FIXED_PER_TREATMENT'
    AND value_snapshot = amount
    AND branch_id IS NOT NULL
    AND (
      public.is_super_admin()
      OR (
        (
          (public.get_user_role() = 'BRANCH_ADMIN' AND public.user_can_access_branch(branch_id))
          OR public.user_can_manage_treatment_branch(branch_id)
        )
        AND EXISTS (
          SELECT 1
          FROM public.treatment_jobs job
          JOIN public.staff assistant
            ON assistant.id = compensation_accruals.staff_id
           AND assistant.id = job.pic_assistant_id
          JOIN public.assistant_treatment_incentive_rates rate
            ON rate.service_id = job.service_id
           AND rate.is_active
          JOIN public.invoices invoice
            ON invoice.visit_id = job.visit_id
           AND invoice.status = 'PAID'
          JOIN public.invoice_items item
            ON item.invoice_id = invoice.id
           AND item.treatment_job_id = job.id
          WHERE job.id::TEXT = compensation_accruals.source_id
            AND job.branch_id = compensation_accruals.branch_id
            AND job.status IN ('SELESAI', 'DISERAHKAN')
            AND assistant.position = 'ASSISTANT'
            AND assistant.active = true
            AND assistant.employment_status = 'ACTIVE'
            AND rate.amount = compensation_accruals.amount
            AND compensation_accruals.base_amount_snapshot =
              public.invoice_line_amount_after_discount(invoice.id, item.id)
            AND (
              SELECT COUNT(*)
              FROM public.invoices paid_invoice
              JOIN public.invoice_items linked_item ON linked_item.invoice_id = paid_invoice.id
              WHERE paid_invoice.visit_id = job.visit_id
                AND paid_invoice.status = 'PAID'
                AND linked_item.treatment_job_id = job.id
            ) = 1
            AND NOT EXISTS (
              SELECT 1
              FROM public.staff_compensation_rules individual_rule
              WHERE individual_rule.staff_id = assistant.id
                AND individual_rule.is_active
                AND individual_rule.rule_type_snapshot IN ('PERCENTAGE', 'FIXED_PER_TREATMENT')
                AND (individual_rule.service_id IS NULL OR individual_rule.service_id = job.service_id)
                AND (individual_rule.branch_id IS NULL OR individual_rule.branch_id = job.branch_id)
                AND (
                  individual_rule.effective_start_date IS NULL
                  OR individual_rule.effective_start_date <= COALESCE((job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE)
                )
                AND (
                  individual_rule.effective_end_date IS NULL
                  OR individual_rule.effective_end_date >= COALESCE((job.completed_at AT TIME ZONE 'UTC')::DATE, CURRENT_DATE)
                )
            )
        )
      )
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
