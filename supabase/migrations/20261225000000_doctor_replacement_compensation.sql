CREATE TABLE IF NOT EXISTS public.external_doctor_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(150) NOT NULL CHECK (length(trim(full_name)) BETWEEN 3 AND 150),
  phone VARCHAR(30) NOT NULL CHECK (length(trim(phone)) BETWEEN 6 AND 30),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS external_doctor_id UUID
    REFERENCES public.external_doctor_recipients(id) ON DELETE RESTRICT;
ALTER TABLE public.patient_visits
  ADD COLUMN IF NOT EXISTS external_doctor_id UUID
    REFERENCES public.external_doctor_recipients(id) ON DELETE RESTRICT;
ALTER TABLE public.queue_items
  ADD COLUMN IF NOT EXISTS external_doctor_id UUID
    REFERENCES public.external_doctor_recipients(id) ON DELETE RESTRICT;
ALTER TABLE public.treatment_jobs
  ADD COLUMN IF NOT EXISTS external_doctor_id UUID
    REFERENCES public.external_doctor_recipients(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.external_doctor_replacement_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  absence_request_id UUID NOT NULL REFERENCES public.staff_absence_requests(id) ON DELETE RESTRICT,
  covered_date DATE NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  external_doctor_id UUID NOT NULL REFERENCES public.external_doctor_recipients(id) ON DELETE RESTRICT,
  daily_fee_snapshot BIGINT NOT NULL DEFAULT 100000 CHECK (daily_fee_snapshot >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (absence_request_id, covered_date)
);

CREATE TABLE IF NOT EXISTS public.doctor_replacement_visit_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  absence_request_id UUID NOT NULL REFERENCES public.staff_absence_requests(id) ON DELETE RESTRICT,
  covered_date DATE NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE RESTRICT,
  visit_id UUID REFERENCES public.patient_visits(id) ON DELETE RESTRICT,
  queue_item_id UUID REFERENCES public.queue_items(id) ON DELETE RESTRICT,
  previous_doctor_id UUID NOT NULL REFERENCES public.dental_doctors(id) ON DELETE RESTRICT,
  replacement_doctor_id UUID REFERENCES public.dental_doctors(id) ON DELETE RESTRICT,
  external_doctor_id UUID REFERENCES public.external_doctor_recipients(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CHECK (replacement_doctor_id IS NOT NULL OR external_doctor_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.external_doctor_payroll_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  absence_request_id UUID NOT NULL UNIQUE REFERENCES public.staff_absence_requests(id) ON DELETE RESTRICT,
  external_doctor_id UUID NOT NULL REFERENCES public.external_doctor_recipients(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  payroll_month INT NOT NULL CHECK (payroll_month BETWEEN 1 AND 12),
  payroll_year INT NOT NULL CHECK (payroll_year >= 2020),
  covered_days INT NOT NULL CHECK (covered_days > 0),
  daily_fee_snapshot BIGINT NOT NULL DEFAULT 100000 CHECK (daily_fee_snapshot >= 0),
  action_count INT CHECK (action_count IS NULL OR action_count >= 0),
  action_fee_snapshot BIGINT NOT NULL DEFAULT 10000 CHECK (action_fee_snapshot >= 0),
  amount_snapshot BIGINT NOT NULL CHECK (amount_snapshot >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING_ACTION_COUNT'
    CHECK (status IN ('PENDING_ACTION_COUNT', 'DRAFT', 'APPROVED', 'PAID')),
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  confirmed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  paid_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_external_doctor_assignments_request
  ON public.external_doctor_replacement_assignments(absence_request_id, covered_date);
CREATE INDEX IF NOT EXISTS idx_doctor_replacement_transfers_request
  ON public.doctor_replacement_visit_transfers(absence_request_id, covered_date);
CREATE INDEX IF NOT EXISTS idx_external_doctor_payroll_period
  ON public.external_doctor_payroll_entries(payroll_year, payroll_month, status);

ALTER TABLE public.external_doctor_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_doctor_replacement_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_doctor_payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_replacement_visit_transfers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.external_doctor_recipients,
  public.external_doctor_replacement_assignments,
  public.external_doctor_payroll_entries,
  public.doctor_replacement_visit_transfers FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.external_doctor_recipients TO authenticated;
GRANT SELECT ON TABLE public.external_doctor_replacement_assignments,
  public.external_doctor_payroll_entries,
  public.doctor_replacement_visit_transfers TO authenticated;

DROP POLICY IF EXISTS "Super Admin manages external doctor recipients" ON public.external_doctor_recipients;
CREATE POLICY "Super Admin manages external doctor recipients"
  ON public.external_doctor_recipients FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Super Admin reads external doctor replacements" ON public.external_doctor_replacement_assignments;
CREATE POLICY "Super Admin reads external doctor replacements"
  ON public.external_doctor_replacement_assignments FOR SELECT TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super Admin reads external doctor payroll" ON public.external_doctor_payroll_entries;
CREATE POLICY "Super Admin reads external doctor payroll"
  ON public.external_doctor_payroll_entries FOR SELECT TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super Admin reads doctor replacement visit transfers" ON public.doctor_replacement_visit_transfers;
CREATE POLICY "Super Admin reads doctor replacement visit transfers"
  ON public.doctor_replacement_visit_transfers FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.guard_external_doctor_booking_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role'
    AND NOT public.is_super_admin()
    AND (
      TG_OP = 'INSERT' AND NEW.external_doctor_id IS NOT NULL
      OR TG_OP = 'UPDATE' AND NEW.external_doctor_id IS DISTINCT FROM OLD.external_doctor_id
    ) THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat menunjuk dokter eksternal pada booking.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.inherit_external_doctor_from_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_external_doctor_id UUID;
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    SELECT external_doctor_id INTO v_external_doctor_id
    FROM public.bookings
    WHERE id = NEW.booking_id;
    NEW.external_doctor_id := v_external_doctor_id;
  ELSIF NEW.external_doctor_id IS NOT NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Penugasan dokter eksternal harus berasal dari booking yang disetujui.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.inherit_external_doctor_from_visit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_external_doctor_id UUID;
  v_external_doctor_name TEXT;
BEGIN
  SELECT visit.external_doctor_id INTO v_external_doctor_id
  FROM public.patient_visits visit
  WHERE visit.id = NEW.visit_id;
  NEW.external_doctor_id := v_external_doctor_id;
  IF v_external_doctor_id IS NOT NULL THEN
    SELECT full_name INTO v_external_doctor_name
    FROM public.external_doctor_recipients
    WHERE id = v_external_doctor_id;
    NEW.doctor_name_snapshot := v_external_doctor_name;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_external_doctor_booking_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inherit_external_doctor_from_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inherit_external_doctor_from_visit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_external_doctor_booking_assignment ON public.bookings;
CREATE TRIGGER guard_external_doctor_booking_assignment
  BEFORE INSERT OR UPDATE OF external_doctor_id ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_external_doctor_booking_assignment();

DROP TRIGGER IF EXISTS inherit_external_doctor_visit_assignment ON public.patient_visits;
CREATE TRIGGER inherit_external_doctor_visit_assignment
  BEFORE INSERT OR UPDATE OF booking_id ON public.patient_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_external_doctor_from_booking();

DROP TRIGGER IF EXISTS inherit_external_doctor_queue_assignment ON public.queue_items;
CREATE TRIGGER inherit_external_doctor_queue_assignment
  BEFORE INSERT OR UPDATE OF visit_id ON public.queue_items
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_external_doctor_from_visit();

DROP TRIGGER IF EXISTS inherit_external_doctor_treatment_assignment ON public.treatment_jobs;
CREATE TRIGGER inherit_external_doctor_treatment_assignment
  BEFORE INSERT OR UPDATE OF visit_id ON public.treatment_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_external_doctor_from_visit();

CREATE OR REPLACE FUNCTION public.review_doctor_absence_request(
  p_request_id UUID,
  p_approve BOOLEAN,
  p_reviewer_note TEXT DEFAULT NULL,
  p_replacement_doctor_id UUID DEFAULT NULL,
  p_external_doctor_id UUID DEFAULT NULL
)
RETURNS public.staff_absence_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.staff_absence_requests;
  v_absent_staff public.staff;
  v_absent_doctor public.dental_doctors;
  v_replacement_doctor public.dental_doctors;
  v_replacement_staff public.staff;
  v_external_doctor public.external_doctor_recipients;
  v_reviewed_request public.staff_absence_requests;
  v_schedule RECORD;
  v_covered_days INT := 0;
  v_first_branch UUID;
  v_last_covered_date DATE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat memproses pengajuan ketidakhadiran.';
  END IF;

  SELECT * INTO v_request
  FROM public.staff_absence_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Pengajuan tidak ditemukan atau sudah diproses.';
  END IF;

  SELECT * INTO v_absent_staff
  FROM public.staff
  WHERE id = v_request.staff_id;
  IF NOT FOUND OR v_absent_staff.position <> 'DOCTOR' THEN
    RAISE EXCEPTION 'Pengajuan ini bukan pengajuan dokter.';
  END IF;

  IF p_replacement_doctor_id IS NOT NULL AND p_external_doctor_id IS NOT NULL THEN
    RAISE EXCEPTION 'Pilih satu jenis pengganti saja: dokter internal atau eksternal.';
  END IF;
  IF NOT p_approve AND (p_replacement_doctor_id IS NOT NULL OR p_external_doctor_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Pengajuan yang ditolak tidak dapat memiliki dokter pengganti.';
  END IF;
  IF p_replacement_doctor_id IS NOT NULL THEN
    SELECT * INTO v_replacement_doctor
    FROM public.dental_doctors
    WHERE id = p_replacement_doctor_id AND active;
    IF NOT FOUND OR v_replacement_doctor.staff_id IS NULL THEN
      RAISE EXCEPTION 'Dokter internal harus terdaftar aktif dan terhubung ke data staf klinik.';
    END IF;
    SELECT * INTO v_replacement_staff
    FROM public.staff
    WHERE id = v_replacement_doctor.staff_id
      AND active
      AND employment_status = 'ACTIVE'
      AND position = 'DOCTOR';
    IF NOT FOUND OR v_replacement_staff.id = v_absent_staff.id THEN
      RAISE EXCEPTION 'Dokter pengganti internal tidak aktif atau sama dengan dokter yang izin.';
    END IF;
  END IF;
  IF p_external_doctor_id IS NOT NULL THEN
    SELECT * INTO v_external_doctor
    FROM public.external_doctor_recipients
    WHERE id = p_external_doctor_id AND active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Dokter eksternal tidak ditemukan atau sudah dinonaktifkan.';
    END IF;

    SELECT dd.* INTO v_absent_doctor
    FROM public.dental_doctors dd
    WHERE dd.staff_id = v_absent_staff.id AND dd.active
    ORDER BY dd.created_at
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Data dokter klinik yang mengajukan izin tidak ditemukan.';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.dental_doctors candidate
      JOIN public.staff candidate_staff
        ON candidate_staff.id = candidate.staff_id
       AND candidate_staff.active
       AND candidate_staff.employment_status = 'ACTIVE'
       AND candidate_staff.position = 'DOCTOR'
      WHERE candidate.active
        AND candidate.id <> v_absent_doctor.id
        AND NOT EXISTS (
          SELECT 1
          FROM public.doctor_schedules absent_schedule
          JOIN public.doctor_schedules candidate_schedule
            ON candidate_schedule.doctor_id = candidate.id
           AND candidate_schedule.date = absent_schedule.date
           AND candidate_schedule.status = 'ACTIVE'
          WHERE absent_schedule.doctor_id = v_absent_doctor.id
            AND absent_schedule.status = 'ACTIVE'
            AND absent_schedule.date BETWEEN v_request.start_date AND v_request.end_date
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.staff_replacement_assignments existing_assignment
          JOIN public.doctor_schedules absent_schedule
            ON absent_schedule.date = existing_assignment.covered_date
          WHERE existing_assignment.replacement_staff_id = candidate.staff_id
            AND absent_schedule.doctor_id = v_absent_doctor.id
            AND absent_schedule.status = 'ACTIVE'
            AND absent_schedule.date BETWEEN v_request.start_date AND v_request.end_date
        )
    ) THEN
      RAISE EXCEPTION 'Dokter internal tersedia pada rentang ini; pengganti eksternal hanya dapat dipilih jika tidak ada dokter internal yang tersedia.';
    END IF;
  END IF;

  SELECT dd.* INTO v_absent_doctor
  FROM public.dental_doctors dd
  WHERE dd.staff_id = v_absent_staff.id AND dd.active
  ORDER BY dd.created_at
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data dokter klinik yang mengajukan izin tidak ditemukan.';
  END IF;

  IF p_approve AND p_replacement_doctor_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.doctor_schedules absent_schedule
    JOIN public.doctor_schedules replacement_schedule
      ON replacement_schedule.date = absent_schedule.date
     AND replacement_schedule.status = 'ACTIVE'
    WHERE absent_schedule.doctor_id = v_absent_doctor.id
      AND absent_schedule.status = 'ACTIVE'
      AND absent_schedule.date BETWEEN v_request.start_date AND v_request.end_date
      AND replacement_schedule.doctor_id = p_replacement_doctor_id
  ) THEN
    RAISE EXCEPTION 'Dokter internal yang dipilih sudah memiliki jadwal aktif pada salah satu tanggal penggantian.';
  END IF;

  IF NOT p_approve AND length(trim(COALESCE(p_reviewer_note, ''))) < 3 THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi.';
  END IF;

  v_reviewed_request := public.review_staff_absence_request(
    p_request_id,
    p_approve,
    p_reviewer_note,
    NULL
  );

  IF NOT p_approve OR (p_replacement_doctor_id IS NULL AND p_external_doctor_id IS NULL) THEN
    RETURN v_reviewed_request;
  END IF;

  FOR v_schedule IN
    SELECT DISTINCT ON (ds.date)
      ds.date,
      ds.branch_id,
      ds.start_time,
      ds.end_time
    FROM public.doctor_schedules ds
    WHERE ds.doctor_id = v_absent_doctor.id
      AND ds.status = 'ACTIVE'
      AND ds.date BETWEEN v_request.start_date AND v_request.end_date
    ORDER BY ds.date, ds.start_time
  LOOP
    IF p_replacement_doctor_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(
        hashtext(v_replacement_staff.id::TEXT),
        hashtext(v_schedule.date::TEXT)
      );
      IF EXISTS (
        SELECT 1
        FROM public.staff_replacement_assignments
        WHERE replacement_staff_id = v_replacement_staff.id
          AND covered_date = v_schedule.date
      ) OR EXISTS (
        SELECT 1
        FROM public.attendances
        WHERE staff_id = v_replacement_staff.id
          AND date = v_schedule.date
      ) THEN
        RAISE EXCEPTION 'Dokter internal sudah memiliki absensi atau penugasan pada tanggal %.', v_schedule.date;
      END IF;
    END IF;

    IF p_replacement_doctor_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.monthly_payrolls
      WHERE staff_id = v_replacement_staff.id
        AND month = EXTRACT(MONTH FROM v_schedule.date)::INT
        AND year = EXTRACT(YEAR FROM v_schedule.date)::INT
        AND status <> 'DRAFT'
    ) THEN
      RAISE EXCEPTION 'Payroll dokter pengganti untuk tanggal % sudah dikunci.', v_schedule.date;
    END IF;

    IF p_replacement_doctor_id IS NOT NULL THEN
      INSERT INTO public.staff_replacement_assignments (
        absence_request_id, covered_date, branch_id, shift_id, absent_staff_id,
        replacement_staff_id, absent_base_salary_snapshot, amount_snapshot
      ) VALUES (
        p_request_id, v_schedule.date, v_schedule.branch_id, NULL, v_absent_staff.id,
        v_replacement_staff.id, 0, 60000
      );
    ELSE
      INSERT INTO public.external_doctor_replacement_assignments (
        absence_request_id, covered_date, branch_id, external_doctor_id, daily_fee_snapshot
      ) VALUES (
        p_request_id, v_schedule.date, v_schedule.branch_id, v_external_doctor.id, 100000
      );
      v_covered_days := v_covered_days + 1;
      v_first_branch := COALESCE(v_first_branch, v_schedule.branch_id);
      v_last_covered_date := GREATEST(COALESCE(v_last_covered_date, v_schedule.date), v_schedule.date);
    END IF;

    INSERT INTO public.doctor_replacement_visit_transfers (
      absence_request_id, covered_date, branch_id, booking_id, visit_id, queue_item_id,
      previous_doctor_id, replacement_doctor_id, external_doctor_id, created_by
    )
    SELECT
      p_request_id,
      v_schedule.date,
      v_schedule.branch_id,
      visit.booking_id,
      visit.id,
      queue.id,
      v_absent_doctor.id,
      p_replacement_doctor_id,
      p_external_doctor_id,
      auth.uid()
    FROM public.patient_visits visit
    LEFT JOIN LATERAL (
      SELECT queue_item.id
      FROM public.queue_items queue_item
      WHERE queue_item.visit_id = visit.id
        AND queue_item.doctor_id = v_absent_doctor.id
        AND queue_item.status IN ('WAITING', 'CALLING', 'IN_PREPARATION')
      ORDER BY queue_item.created_at DESC
      LIMIT 1
    ) queue ON true
    WHERE visit.doctor_id = v_absent_doctor.id
      AND visit.branch_id = v_schedule.branch_id
      AND (visit.visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE = v_schedule.date
      AND visit.visit_status IN ('WAITING', 'IN_TRIAGE');

    INSERT INTO public.doctor_replacement_visit_transfers (
      absence_request_id, covered_date, branch_id, booking_id,
      previous_doctor_id, replacement_doctor_id, external_doctor_id, created_by
    )
    SELECT
      p_request_id,
      v_schedule.date,
      v_schedule.branch_id,
      booking.id,
      v_absent_doctor.id,
      p_replacement_doctor_id,
      p_external_doctor_id,
      auth.uid()
    FROM public.bookings booking
    WHERE booking.doctor_id = v_absent_doctor.id
      AND booking.branch_id = v_schedule.branch_id
      AND (booking.booking_date_time AT TIME ZONE 'Asia/Jakarta')::DATE = v_schedule.date
      AND booking.status IN ('PENDING', 'CONFIRMED')
      AND NOT EXISTS (
        SELECT 1 FROM public.patient_visits visit
        WHERE visit.booking_id = booking.id
          AND visit.visit_status <> 'CANCELLED'
      );

    IF p_replacement_doctor_id IS NOT NULL THEN
      UPDATE public.bookings
      SET doctor_id = p_replacement_doctor_id,
          doctor_name_snapshot = v_replacement_doctor.name,
          external_doctor_id = NULL,
          updated_at = timezone('utc'::text, now())
      WHERE doctor_id = v_absent_doctor.id
        AND branch_id = v_schedule.branch_id
        AND (booking_date_time AT TIME ZONE 'Asia/Jakarta')::DATE = v_schedule.date
        AND status IN ('PENDING', 'CONFIRMED');

      UPDATE public.patient_visits
      SET doctor_id = p_replacement_doctor_id,
          external_doctor_id = NULL,
          updated_at = timezone('utc'::text, now())
      WHERE doctor_id = v_absent_doctor.id
        AND branch_id = v_schedule.branch_id
        AND (visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE = v_schedule.date
        AND visit_status IN ('WAITING', 'IN_TRIAGE');

      UPDATE public.queue_items queue
      SET doctor_id = p_replacement_doctor_id,
          doctor_name_snapshot = v_replacement_doctor.name,
          external_doctor_id = NULL,
          updated_at = timezone('utc'::text, now())
      FROM public.patient_visits visit
      WHERE queue.visit_id = visit.id
        AND visit.doctor_id = p_replacement_doctor_id
        AND visit.branch_id = v_schedule.branch_id
        AND (visit.visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE = v_schedule.date
        AND queue.status IN ('WAITING', 'CALLING', 'IN_PREPARATION');

      UPDATE public.treatment_jobs
      SET doctor_id = p_replacement_doctor_id,
          assigned_doctor_id = p_replacement_doctor_id,
          doctor_name_snapshot = v_replacement_doctor.name,
          external_doctor_id = NULL,
          updated_at = timezone('utc'::text, now())
      WHERE doctor_id = v_absent_doctor.id
        AND branch_id = v_schedule.branch_id
        AND status = 'BELUM_DIMULAI'
        AND visit_id IN (
          SELECT visit.id
          FROM public.patient_visits visit
          WHERE visit.doctor_id = p_replacement_doctor_id
            AND visit.branch_id = v_schedule.branch_id
            AND (visit.visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE = v_schedule.date
        );

      INSERT INTO public.doctor_schedules (
        doctor_id, branch_id, date, start_time, end_time, status, notes
      ) VALUES (
        p_replacement_doctor_id, v_schedule.branch_id, v_schedule.date,
        v_schedule.start_time, v_schedule.end_time, 'ACTIVE',
        format('Pengganti dokter berdasarkan pengajuan %s', p_request_id)
      );
    ELSE
      UPDATE public.bookings
      SET external_doctor_id = p_external_doctor_id,
          doctor_name_snapshot = v_external_doctor.full_name,
          updated_at = timezone('utc'::text, now())
      WHERE doctor_id = v_absent_doctor.id
        AND branch_id = v_schedule.branch_id
        AND (booking_date_time AT TIME ZONE 'Asia/Jakarta')::DATE = v_schedule.date
        AND status IN ('PENDING', 'CONFIRMED');

      UPDATE public.patient_visits
      SET external_doctor_id = p_external_doctor_id,
          updated_at = timezone('utc'::text, now())
      WHERE doctor_id = v_absent_doctor.id
        AND branch_id = v_schedule.branch_id
        AND (visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE = v_schedule.date
        AND visit_status IN ('WAITING', 'IN_TRIAGE');

      UPDATE public.queue_items queue
      SET external_doctor_id = p_external_doctor_id,
          doctor_name_snapshot = v_external_doctor.full_name,
          updated_at = timezone('utc'::text, now())
      FROM public.patient_visits visit
      WHERE queue.visit_id = visit.id
        AND visit.external_doctor_id = p_external_doctor_id
        AND visit.branch_id = v_schedule.branch_id
        AND (visit.visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE = v_schedule.date
        AND queue.status IN ('WAITING', 'CALLING', 'IN_PREPARATION');

      UPDATE public.treatment_jobs
      SET external_doctor_id = p_external_doctor_id,
          doctor_name_snapshot = v_external_doctor.full_name,
          updated_at = timezone('utc'::text, now())
      WHERE doctor_id = v_absent_doctor.id
        AND branch_id = v_schedule.branch_id
        AND status = 'BELUM_DIMULAI'
        AND visit_id IN (
          SELECT visit.id
          FROM public.patient_visits visit
          WHERE visit.external_doctor_id = p_external_doctor_id
            AND visit.branch_id = v_schedule.branch_id
            AND (visit.visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE = v_schedule.date
        );
    END IF;

    UPDATE public.doctor_schedules
    SET status = 'CANCELLED',
        notes = concat_ws(E'\n', NULLIF(notes, ''), format('Digantikan berdasarkan pengajuan %s', p_request_id)),
        updated_at = timezone('utc'::text, now())
    WHERE doctor_id = v_absent_doctor.id
      AND branch_id = v_schedule.branch_id
      AND date = v_schedule.date
      AND status = 'ACTIVE';
  END LOOP;

  IF p_external_doctor_id IS NOT NULL THEN
    IF v_covered_days = 0 THEN
      RAISE EXCEPTION 'Tidak ada hari praktik terjadwal untuk dokter eksternal pada rentang pengajuan.';
    END IF;
    INSERT INTO public.external_doctor_payroll_entries (
      absence_request_id, external_doctor_id, branch_id,
      payroll_month, payroll_year, covered_days,
      daily_fee_snapshot, action_fee_snapshot, amount_snapshot
    ) VALUES (
      p_request_id, v_external_doctor.id, v_first_branch,
      EXTRACT(MONTH FROM v_last_covered_date)::INT,
      EXTRACT(YEAR FROM v_last_covered_date)::INT,
      v_covered_days, 100000, 10000, v_covered_days * 100000
    );
  END IF;

  RETURN v_reviewed_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_external_doctor_action_count(
  p_entry_id UUID,
  p_action_count INT
)
RETURNS public.external_doctor_payroll_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry public.external_doctor_payroll_entries;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat mengonfirmasi tindakan dokter eksternal.';
  END IF;
  IF p_action_count IS NULL OR p_action_count < 0 THEN
    RAISE EXCEPTION 'Jumlah tindakan harus berupa bilangan bulat nol atau lebih.';
  END IF;
  UPDATE public.external_doctor_payroll_entries
  SET action_count = p_action_count,
      amount_snapshot = covered_days * daily_fee_snapshot + p_action_count * action_fee_snapshot,
      status = 'DRAFT',
      confirmed_by = auth.uid(),
      confirmed_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE id = p_entry_id AND status = 'PENDING_ACTION_COUNT'
  RETURNING * INTO v_entry;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data honor tidak ditemukan atau jumlah tindakan sudah dikonfirmasi.';
  END IF;
  RETURN v_entry;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_external_doctor_payroll_entry(
  p_entry_id UUID,
  p_approve BOOLEAN
)
RETURNS public.external_doctor_payroll_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry public.external_doctor_payroll_entries;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat meninjau honor dokter eksternal.';
  END IF;
  UPDATE public.external_doctor_payroll_entries
  SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'PENDING_ACTION_COUNT' END,
      action_count = CASE WHEN p_approve THEN action_count ELSE NULL END,
      amount_snapshot = CASE WHEN p_approve THEN amount_snapshot ELSE covered_days * daily_fee_snapshot END,
      confirmed_by = CASE WHEN p_approve THEN confirmed_by ELSE NULL END,
      confirmed_at = CASE WHEN p_approve THEN confirmed_at ELSE NULL END,
      approved_by = CASE WHEN p_approve THEN auth.uid() ELSE NULL END,
      approved_at = CASE WHEN p_approve THEN timezone('utc'::text, now()) ELSE NULL END,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_entry_id AND status = 'DRAFT'
  RETURNING * INTO v_entry;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Honor tidak ditemukan atau belum siap ditinjau.';
  END IF;
  RETURN v_entry;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_external_doctor_payroll_paid(p_entry_id UUID)
RETURNS public.external_doctor_payroll_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry public.external_doctor_payroll_entries;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat mencatat pembayaran honor dokter eksternal.';
  END IF;
  UPDATE public.external_doctor_payroll_entries
  SET status = 'PAID',
      paid_by = auth.uid(),
      paid_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE id = p_entry_id AND status = 'APPROVED'
  RETURNING * INTO v_entry;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Honor belum disetujui atau sudah dibayar.';
  END IF;
  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.review_doctor_absence_request(UUID, BOOLEAN, TEXT, UUID, UUID)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_external_doctor_action_count(UUID, INT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_external_doctor_payroll_entry(UUID, BOOLEAN)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_external_doctor_payroll_paid(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_doctor_absence_request(UUID, BOOLEAN, TEXT, UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_external_doctor_action_count(UUID, INT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_external_doctor_payroll_entry(UUID, BOOLEAN)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_external_doctor_payroll_paid(UUID)
  TO authenticated;
