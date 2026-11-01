CREATE OR REPLACE FUNCTION public.transfer_booking_referral_incentives(
  p_booking_id UUID,
  p_referring_staff_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_target_staff public.staff%ROWTYPE;
  v_accrual RECORD;
  v_payroll_item RECORD;
  v_source_payroll public.monthly_payrolls%ROWTYPE;
  v_target_payroll public.monthly_payrolls%ROWTYPE;
  v_payroll_id UUID;
  v_period_month INTEGER;
  v_period_year INTEGER;
  v_due_date DATE;
  v_accrual_count INTEGER := 0;
  v_updated_payroll_ids UUID[] := ARRAY[]::UUID[];
  v_item_count INTEGER;
  v_tax_item_id UUID;
  v_tax_rate NUMERIC;
  v_tax_amount BIGINT;
  v_gross_income BIGINT;
  v_non_tax_deductions BIGINT;
  v_total_deductions BIGINT;
  v_total_compensation BIGINT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat memindahkan insentif referral.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking tidak ditemukan.';
  END IF;

  IF p_referring_staff_id IS NOT NULL THEN
    SELECT *
    INTO v_target_staff
    FROM public.staff
    WHERE id = p_referring_staff_id
      AND position IN ('BRANCH_ADMIN', 'ASSISTANT')
      AND employment_status = 'ACTIVE'
      AND active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Penerima referral harus Admin Cabang atau Asisten yang masih aktif.';
    END IF;
  END IF;

  IF v_booking.referring_staff_id IS NOT DISTINCT FROM p_referring_staff_id THEN
    RETURN jsonb_build_object(
      'booking_data', to_jsonb(v_booking),
      'transferred_accrual_count', 0,
      'updated_draft_payroll_count', 0
    );
  END IF;

  FOR v_accrual IN
    SELECT accrual.id, accrual.staff_id, accrual.amount, accrual.accrued_at, accrual.source_id
    FROM public.compensation_accruals accrual
    WHERE accrual.rule_id_snapshot = 'STAFF_VISIT_REFERRAL_RP3000_V1'
      AND EXISTS (
        SELECT 1
        FROM public.patient_visits visit
        JOIN public.treatment_jobs job ON job.visit_id = visit.id
        WHERE visit.booking_id = p_booking_id
          AND accrual.source_id IN (
            'referral:visit:' || visit.id::TEXT,
            'referral:visit:' || visit.id::TEXT || ':treatment:' || job.id::TEXT
          )
      )
    ORDER BY accrual.accrued_at, accrual.id
    FOR UPDATE OF accrual
  LOOP
    IF p_referring_staff_id IS NULL THEN
      RAISE EXCEPTION 'Insentif sudah tercatat. Pilih staf pengganti agar insentif dapat dipindahkan, bukan mengosongkan referral.';
    END IF;

    v_due_date := (
      date_trunc('month', v_accrual.accrued_at AT TIME ZONE 'Asia/Jakarta')
      + INTERVAL '1 month'
    )::DATE;
    IF (now() AT TIME ZONE 'Asia/Jakarta')::DATE >= v_due_date THEN
      RAISE EXCEPTION 'Insentif sudah melewati batas pemindahan sebelum tanggal 1 bulan gajian.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.journal_entries journal
      WHERE journal.source_type = 'COMPENSATION'
        AND journal.source_id = v_accrual.id::TEXT
    ) THEN
      RAISE EXCEPTION 'Insentif sudah memiliki jurnal akuntansi dan tidak dapat dipindahkan.';
    END IF;

    v_period_month := EXTRACT(MONTH FROM v_accrual.accrued_at AT TIME ZONE 'Asia/Jakarta')::INTEGER;
    v_period_year := EXTRACT(YEAR FROM v_accrual.accrued_at AT TIME ZONE 'Asia/Jakarta')::INTEGER;

    SELECT *
    INTO v_source_payroll
    FROM public.monthly_payrolls
    WHERE staff_id = v_accrual.staff_id
      AND month = v_period_month
      AND year = v_period_year
    FOR UPDATE;
    IF FOUND THEN
      IF v_source_payroll.status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Insentif tidak dapat dipindahkan karena payroll staf lama sudah masuk tahap Review atau lebih lanjut.';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.journal_entries journal
        WHERE journal.source_type = 'PAYROLL'
          AND journal.source_id = v_source_payroll.id::TEXT
      ) THEN
        RAISE EXCEPTION 'Payroll staf lama sudah memiliki jurnal akuntansi dan tidak dapat diubah.';
      END IF;
    END IF;

    SELECT *
    INTO v_target_payroll
    FROM public.monthly_payrolls
    WHERE staff_id = p_referring_staff_id
      AND month = v_period_month
      AND year = v_period_year
    FOR UPDATE;
    IF FOUND THEN
      IF v_target_payroll.status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Payroll staf pengganti sudah masuk tahap Review atau lebih lanjut.';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.journal_entries journal
        WHERE journal.source_type = 'PAYROLL'
          AND journal.source_id = v_target_payroll.id::TEXT
      ) THEN
        RAISE EXCEPTION 'Payroll staf pengganti sudah memiliki jurnal akuntansi dan tidak dapat diubah.';
      END IF;
    END IF;

    SELECT COUNT(*)
    INTO v_item_count
    FROM public.payroll_items
    WHERE source_id = v_accrual.id::TEXT;
    IF v_item_count > 1 THEN
      RAISE EXCEPTION 'Insentif terhubung ke lebih dari satu rincian payroll; periksa payroll sebelum memindahkan.';
    END IF;

    FOR v_payroll_item IN
      SELECT item.id, item.payroll_id, item.description_snapshot, item.amount_snapshot, item.type,
             payroll.staff_id, payroll.month, payroll.year
      FROM public.payroll_items item
      JOIN public.monthly_payrolls payroll ON payroll.id = item.payroll_id
      WHERE item.source_id = v_accrual.id::TEXT
      FOR UPDATE OF item
    LOOP
      IF v_payroll_item.staff_id <> v_accrual.staff_id
        OR v_payroll_item.month <> v_period_month
        OR v_payroll_item.year <> v_period_year
        OR v_payroll_item.type <> 'EARNING' THEN
        RAISE EXCEPTION 'Rincian insentif pada payroll tidak cocok dengan data akrual.';
      END IF;

      IF NOT (v_payroll_item.payroll_id = ANY(v_updated_payroll_ids)) THEN
        v_updated_payroll_ids := array_append(v_updated_payroll_ids, v_payroll_item.payroll_id);
      END IF;
      IF v_target_payroll.id IS NOT NULL THEN
        IF NOT (v_target_payroll.id = ANY(v_updated_payroll_ids)) THEN
          v_updated_payroll_ids := array_append(v_updated_payroll_ids, v_target_payroll.id);
        END IF;
        UPDATE public.payroll_items
        SET payroll_id = v_target_payroll.id
        WHERE id = v_payroll_item.id;
      ELSE
        DELETE FROM public.payroll_items
        WHERE id = v_payroll_item.id;
      END IF;
    END LOOP;

    IF v_item_count = 0 AND v_target_payroll.id IS NOT NULL THEN
      IF NOT (v_target_payroll.id = ANY(v_updated_payroll_ids)) THEN
        v_updated_payroll_ids := array_append(v_updated_payroll_ids, v_target_payroll.id);
      END IF;
      INSERT INTO public.payroll_items (
        payroll_id, description_snapshot, amount_snapshot, type, source_id
      ) VALUES (
        v_target_payroll.id,
        'Insentif Referral Kunjungan (#' || v_accrual.source_id || ')',
        v_accrual.amount,
        'EARNING',
        v_accrual.id::TEXT
      );
    END IF;

    UPDATE public.compensation_accruals
    SET staff_id = p_referring_staff_id,
        branch_id = v_target_staff.branch_id
    WHERE id = v_accrual.id;
    v_accrual_count := v_accrual_count + 1;
  END LOOP;

  UPDATE public.bookings
  SET referring_staff_id = p_referring_staff_id,
      updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  FOREACH v_payroll_id IN ARRAY v_updated_payroll_ids
  LOOP
    SELECT
      COALESCE(SUM(item.amount_snapshot) FILTER (WHERE item.type = 'EARNING'), 0),
      COALESCE(SUM(item.amount_snapshot) FILTER (
        WHERE item.type = 'DEDUCTION'
          AND item.description_snapshot NOT LIKE 'Potongan Pajak (%'
      ), 0),
      (array_agg(item.id) FILTER (
        WHERE item.type = 'DEDUCTION'
          AND item.description_snapshot LIKE 'Potongan Pajak (%'
      ))[1],
      COALESCE(SUM(item.amount_snapshot) FILTER (
        WHERE item.type = 'EARNING'
          AND item.description_snapshot !~* '^(gaji pokok|lembur disetujui)'
      ), 0)
    INTO v_gross_income, v_non_tax_deductions, v_tax_item_id, v_total_compensation
    FROM public.payroll_items item
    WHERE item.payroll_id = v_payroll_id;

    v_tax_amount := 0;
    IF v_tax_item_id IS NOT NULL THEN
      SELECT substring(description_snapshot FROM '^Potongan Pajak \(([0-9]+([.][0-9]+)?)% dari bruto\)$')::NUMERIC
      INTO v_tax_rate
      FROM public.payroll_items
      WHERE id = v_tax_item_id;
      IF v_tax_rate IS NULL OR v_tax_rate < 0 OR v_tax_rate > 100 THEN
        RAISE EXCEPTION 'Format tarif pajak pada payroll Draft tidak valid; payroll perlu diperiksa.';
      END IF;
      v_tax_amount := round(v_gross_income * v_tax_rate / 100)::BIGINT;
      UPDATE public.payroll_items
      SET amount_snapshot = v_tax_amount
      WHERE id = v_tax_item_id;
    END IF;

    v_total_deductions := v_non_tax_deductions + v_tax_amount;
    UPDATE public.monthly_payrolls
    SET total_compensation = v_total_compensation,
        total_deductions = v_total_deductions,
        net_salary = v_gross_income - v_total_deductions,
        updated_at = now()
    WHERE id = v_payroll_id
      AND status = 'DRAFT';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payroll berubah status saat pemindahan insentif. Muat ulang data dan coba kembali.';
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'booking_data', to_jsonb(v_booking),
    'transferred_accrual_count', v_accrual_count,
    'updated_draft_payroll_count', cardinality(v_updated_payroll_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_booking_referral_incentives(UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_booking_referral_incentives(UUID, UUID)
  TO authenticated;

COMMENT ON FUNCTION public.transfer_booking_referral_incentives(UUID, UUID) IS
  'Super Admin only: reassigns all referral incentives for a booking before the next month payday, updates eligible DRAFT payroll items and totals, and preserves posted financial records.';

NOTIFY pgrst, 'reload schema';
