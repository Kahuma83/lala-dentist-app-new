DROP POLICY IF EXISTS "Authenticated users read referral incentive rates"
  ON public.staff_referral_incentive_rates;
CREATE POLICY "Clinic admins read referral incentive rates"
  ON public.staff_referral_incentive_rates
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.get_user_role() = 'BRANCH_ADMIN'
  );

DROP POLICY IF EXISTS "Super admin manages referral incentive rates"
  ON public.staff_referral_incentive_rates;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.staff_referral_incentive_rates FROM authenticated;

CREATE OR REPLACE FUNCTION public.save_shared_staff_referral_incentive_rate(
  p_previous_service_name VARCHAR(120),
  p_service_name VARCHAR(120),
  p_amount NUMERIC(12, 2),
  p_is_active BOOLEAN,
  p_update_existing BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_position TEXT;
  v_rate_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat mengatur tarif insentif referral.'
      USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal insentif referral harus lebih besar dari nol.'
      USING ERRCODE = '22023';
  END IF;
  IF p_service_name IS NOT NULL AND length(trim(p_service_name)) = 0 THEN
    p_service_name := NULL;
  END IF;
  IF p_service_name IS NOT NULL AND length(p_service_name) > 120 THEN
    RAISE EXCEPTION 'Nama tindakan maksimal 120 karakter.'
      USING ERRCODE = '22023';
  END IF;
  IF p_update_existing AND p_previous_service_name IS NULL AND p_service_name IS NOT NULL THEN
    RAISE EXCEPTION 'Tarif dasar tidak dapat diubah menjadi tarif tindakan khusus.'
      USING ERRCODE = '22023';
  END IF;
  IF p_update_existing AND p_previous_service_name IS NOT NULL AND p_service_name IS NULL THEN
    RAISE EXCEPTION 'Tarif tindakan tidak dapat diubah menjadi tarif dasar.'
      USING ERRCODE = '22023';
  END IF;
  IF p_service_name IS NULL AND NOT p_is_active THEN
    RAISE EXCEPTION 'Tarif dasar referral wajib tetap aktif.'
      USING ERRCODE = '22023';
  END IF;
  IF p_service_name IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.staff_referral_incentive_rates rate
    WHERE lower(regexp_replace(trim(rate.service_name), '[^a-zA-Z0-9]', '', 'g'))
        = lower(regexp_replace(trim(p_service_name), '[^a-zA-Z0-9]', '', 'g'))
      AND (
        NOT p_update_existing
        OR p_previous_service_name IS NULL
        OR lower(regexp_replace(trim(rate.service_name), '[^a-zA-Z0-9]', '', 'g'))
          <> lower(regexp_replace(trim(p_previous_service_name), '[^a-zA-Z0-9]', '', 'g'))
      )
  ) THEN
    RAISE EXCEPTION 'Tarif untuk tindakan tersebut sudah ada.'
      USING ERRCODE = '23505';
  END IF;

  FOREACH v_position IN ARRAY ARRAY['BRANCH_ADMIN', 'ASSISTANT'] LOOP
    v_rate_id := NULL;
    IF p_update_existing THEN
      SELECT rate.id INTO v_rate_id
      FROM public.staff_referral_incentive_rates rate
      WHERE rate.staff_position = v_position
        AND (
          (p_previous_service_name IS NULL AND rate.service_name IS NULL)
          OR (
            p_previous_service_name IS NOT NULL
            AND rate.service_name IS NOT NULL
            AND lower(regexp_replace(trim(rate.service_name), '[^a-zA-Z0-9]', '', 'g'))
              = lower(regexp_replace(trim(p_previous_service_name), '[^a-zA-Z0-9]', '', 'g'))
          )
        )
      LIMIT 1;
    END IF;

    IF v_rate_id IS NULL THEN
      INSERT INTO public.staff_referral_incentive_rates (
        staff_position, service_name, amount, is_active, updated_at
      ) VALUES (
        v_position, p_service_name, p_amount, p_is_active, now()
      );
    ELSE
      UPDATE public.staff_referral_incentive_rates
      SET service_name = p_service_name,
          amount = p_amount,
          is_active = p_is_active,
          updated_at = now()
      WHERE id = v_rate_id;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.save_shared_staff_referral_incentive_rate(VARCHAR, VARCHAR, NUMERIC, BOOLEAN, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_shared_staff_referral_incentive_rate(VARCHAR, VARCHAR, NUMERIC, BOOLEAN, BOOLEAN)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_treatment_booking_referral_staff(p_treatment_job_id UUID)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  staff_position TEXT,
  branch_id UUID,
  referral_rate_amount NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_treatment_branch_id UUID;
BEGIN
  SELECT job.branch_id INTO v_treatment_branch_id
  FROM public.treatment_jobs job
  WHERE job.id = p_treatment_job_id;

  IF v_treatment_branch_id IS NULL THEN
    RAISE EXCEPTION 'Tindakan tidak ditemukan.'
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.is_super_admin()
    OR (public.get_user_role() = 'BRANCH_ADMIN' AND public.user_can_access_branch(v_treatment_branch_id))
    OR public.user_can_manage_treatment_branch(v_treatment_branch_id)
  ) THEN
    RAISE EXCEPTION 'Anda tidak memiliki akses ke tindakan ini.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    referral_staff.id,
    referral_staff.full_name::TEXT,
    referral_staff.position::TEXT,
    referral_staff.branch_id,
    (
      SELECT rate.amount
      FROM public.staff_referral_incentive_rates rate
      WHERE rate.staff_position = referral_staff.position
        AND rate.is_active
        AND (
          rate.service_name IS NULL
          OR lower(regexp_replace(trim(rate.service_name), '[^a-zA-Z0-9]', '', 'g'))
            = lower(regexp_replace(trim(job.service_name_snapshot), '[^a-zA-Z0-9]', '', 'g'))
        )
      ORDER BY (rate.service_name IS NOT NULL) DESC
      LIMIT 1
    ) AS referral_rate_amount
  FROM public.treatment_jobs job
  JOIN public.patient_visits visit ON visit.id = job.visit_id
  JOIN public.bookings booking ON booking.id = visit.booking_id
  JOIN public.staff referral_staff ON referral_staff.id = booking.referring_staff_id
  WHERE job.id = p_treatment_job_id
    AND referral_staff.position IN ('BRANCH_ADMIN', 'ASSISTANT')
    AND referral_staff.employment_status = 'ACTIVE'
    AND referral_staff.active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_treatment_booking_referral_staff(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_treatment_booking_referral_staff(UUID) TO authenticated;

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
        AND amount = (
          SELECT rate.amount
          FROM public.staff_referral_incentive_rates rate
          WHERE rate.staff_position = referral_staff.position
            AND rate.is_active
            AND (
              rate.service_name IS NULL
              OR lower(regexp_replace(trim(rate.service_name), '[^a-zA-Z0-9]', '', 'g'))
                = lower(regexp_replace(trim(job.service_name_snapshot), '[^a-zA-Z0-9]', '', 'g'))
            )
          ORDER BY (rate.service_name IS NOT NULL) DESC
          LIMIT 1
        )
    )
  );

NOTIFY pgrst, 'reload schema';
