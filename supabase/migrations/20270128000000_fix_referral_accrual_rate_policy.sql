CREATE OR REPLACE FUNCTION public.get_treatment_booking_referral_rate(
  p_treatment_job_id UUID,
  p_staff_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_branch_id UUID;
  v_service_name TEXT;
  v_staff_position TEXT;
BEGIN
  SELECT job.branch_id, job.service_name_snapshot, referral_staff.position
  INTO v_branch_id, v_service_name, v_staff_position
  FROM public.treatment_jobs job
  JOIN public.patient_visits visit ON visit.id = job.visit_id
  JOIN public.bookings booking ON booking.id = visit.booking_id
  JOIN public.staff referral_staff ON referral_staff.id = booking.referring_staff_id
  WHERE job.id = p_treatment_job_id
    AND referral_staff.id = p_staff_id
    AND referral_staff.position IN ('BRANCH_ADMIN', 'ASSISTANT')
    AND referral_staff.employment_status = 'ACTIVE'
    AND referral_staff.active = true;

  IF v_branch_id IS NULL
    OR NOT (
      public.is_super_admin()
      OR (public.get_user_role() = 'BRANCH_ADMIN' AND public.user_can_access_branch(v_branch_id))
      OR public.user_can_manage_treatment_branch(v_branch_id)
    ) THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT rate.amount
    FROM public.staff_referral_incentive_rates rate
    WHERE rate.staff_position = v_staff_position
      AND rate.is_active
      AND (
        rate.service_name IS NULL
        OR lower(regexp_replace(trim(rate.service_name), '[^a-zA-Z0-9]', '', 'g'))
          = lower(regexp_replace(trim(v_service_name), '[^a-zA-Z0-9]', '', 'g'))
      )
    ORDER BY (rate.service_name IS NOT NULL) DESC
    LIMIT 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_treatment_booking_referral_rate(UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_treatment_booking_referral_rate(UUID, UUID)
  TO authenticated;

DROP POLICY IF EXISTS "Validated booking referral accrual insert"
  ON public.compensation_accruals;
CREATE POLICY "Validated booking referral accrual insert"
  ON public.compensation_accruals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    rule_id_snapshot = 'STAFF_VISIT_REFERRAL_RP3000_V1'
    AND rule_type_snapshot = 'STAFF_VISIT_REFERRAL'
    AND value_snapshot = amount
    AND EXISTS (
      SELECT 1
      FROM public.treatment_jobs job
      JOIN public.patient_visits visit ON visit.id = job.visit_id
      JOIN public.bookings booking ON booking.id = visit.booking_id
      JOIN public.staff referral_staff ON referral_staff.id = booking.referring_staff_id
      JOIN public.invoices invoice ON invoice.visit_id = job.visit_id AND invoice.status = 'PAID'
      JOIN public.invoice_items item ON item.invoice_id = invoice.id AND item.treatment_job_id = job.id
      WHERE job.status IN ('SELESAI', 'DISERAHKAN')
        AND compensation_accruals.source_id = 'referral:visit:' || job.visit_id::TEXT || ':treatment:' || job.id::TEXT
        AND compensation_accruals.staff_id = referral_staff.id
        AND compensation_accruals.branch_id = referral_staff.branch_id
        AND (
          SELECT COUNT(*)
          FROM public.invoices paid_invoice
          JOIN public.invoice_items linked_item ON linked_item.invoice_id = paid_invoice.id
          WHERE paid_invoice.visit_id = job.visit_id
            AND paid_invoice.status = 'PAID'
            AND linked_item.treatment_job_id = job.id
        ) = 1
        AND referral_staff.position IN ('BRANCH_ADMIN', 'ASSISTANT')
        AND referral_staff.employment_status = 'ACTIVE'
        AND referral_staff.active = true
        AND (
          public.is_super_admin()
          OR (public.get_user_role() = 'BRANCH_ADMIN' AND public.user_can_access_branch(job.branch_id))
          OR public.user_can_manage_treatment_branch(job.branch_id)
        )
        AND base_amount_snapshot = public.invoice_line_amount_after_discount(invoice.id, item.id)
        AND amount = public.get_treatment_booking_referral_rate(job.id, referral_staff.id)
    )
  );

NOTIFY pgrst, 'reload schema';
