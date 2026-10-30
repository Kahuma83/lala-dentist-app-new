ALTER TABLE public.treatment_jobs
  ADD COLUMN IF NOT EXISTS patient_approval_method TEXT,
  ADD COLUMN IF NOT EXISTS patient_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS patient_approved_by UUID,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

ALTER TABLE public.treatment_jobs
  DROP CONSTRAINT IF EXISTS treatment_jobs_status_check;

ALTER TABLE public.treatment_jobs
  ADD CONSTRAINT treatment_jobs_status_check
  CHECK (status IN ('BELUM_DIMULAI', 'DALAM_PROSES', 'SELESAI', 'DISERAHKAN', 'PERLU_REVISI', 'DIBATALKAN'));

ALTER TABLE public.treatment_jobs
  DROP CONSTRAINT IF EXISTS treatment_jobs_patient_approval_method_check;

ALTER TABLE public.treatment_jobs
  ADD CONSTRAINT treatment_jobs_patient_approval_method_check
  CHECK (patient_approval_method IS NULL OR patient_approval_method = 'VERBAL');

ALTER TABLE public.treatment_activities
  DROP CONSTRAINT IF EXISTS treatment_activities_activity_type_check;

ALTER TABLE public.treatment_activities
  ADD CONSTRAINT treatment_activities_activity_type_check
  CHECK (activity_type IN (
    'STARTED',
    'CONTINUED',
    'PROGRESS',
    'COMPLETED',
    'HANDED_OVER',
    'RETURNED_TO_DOCTOR',
    'REVISION_RESUBMITTED',
    'CANCELLED',
    'DURATION_CHANGE',
    'OTHER'
  ));

CREATE OR REPLACE FUNCTION public.enforce_treatment_plan_approval_and_tariff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_service_active BOOLEAN;
  v_base_price BIGINT;
  v_branch_price BIGINT;
BEGIN
  IF NEW.patient_approval_method IS DISTINCT FROM 'VERBAL'
     OR NEW.patient_approved_at IS NULL
     OR NEW.patient_approved_by IS NULL THEN
    RAISE EXCEPTION 'Persetujuan pasien atas rencana tindakan dan estimasi biaya wajib dicatat';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT role
    INTO v_role
    FROM public.user_accounts
    WHERE id = NEW.patient_approved_by
      AND auth_user_id = auth.uid()
      AND active = true;

    IF NOT FOUND OR v_role NOT IN ('DOCTOR', 'DOCTOR_ASSISTANT', 'SUPER_ADMIN') THEN
      RAISE EXCEPTION 'Persetujuan pasien harus dicatat oleh petugas klinik yang berwenang';
    END IF;
  END IF;

  SELECT service.base_price, service.is_active, tariff.custom_price
  INTO v_base_price, v_service_active, v_branch_price
  FROM public.master_services service
  LEFT JOIN public.branch_service_tariffs tariff
    ON tariff.branch_id = NEW.branch_id
   AND tariff.service_id = NEW.service_id
   AND tariff.is_active = true
  WHERE service.id = NEW.service_id;

  IF NOT FOUND OR NOT v_service_active THEN
    RAISE EXCEPTION 'Jenis tindakan aktif tidak ditemukan';
  END IF;

  NEW.price_snapshot := COALESCE(v_branch_price, v_base_price);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS treatment_plan_approval_and_tariff ON public.treatment_jobs;

CREATE TRIGGER treatment_plan_approval_and_tariff
  BEFORE INSERT ON public.treatment_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_treatment_plan_approval_and_tariff();

CREATE OR REPLACE FUNCTION public.prevent_multiple_patients_in_doctor_treatment_room()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  occupied_queue RECORD;
  has_unfinished_treatment BOOLEAN;
  operational_date DATE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('IN_PREPARATION', 'IN_CONSULTATION')
      AND NEW.status IN ('SKIPPED', 'CANCELLED') THEN
      RAISE EXCEPTION 'Pasien yang sudah berada di ruang tindakan tidak dapat dilewati atau dibatalkan dari antrean.'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.status IN ('IN_PREPARATION', 'IN_CONSULTATION')
      OR NEW.status IN ('IN_PREPARATION', 'IN_CONSULTATION') THEN
      PERFORM pg_advisory_xact_lock(
        hashtextextended(NEW.branch_id::TEXT || ':' || NEW.doctor_id::TEXT, 0)
      );
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.status IN ('IN_PREPARATION', 'IN_CONSULTATION') THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(NEW.branch_id::TEXT || ':' || NEW.doctor_id::TEXT, 0)
    );
  END IF;

  IF NEW.status NOT IN ('IN_PREPARATION', 'IN_CONSULTATION') THEN
    RETURN NEW;
  END IF;

  operational_date := (NEW.arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE;
  SELECT queue.id, queue.visit_id, queue.status
  INTO occupied_queue
  FROM public.queue_items queue
  WHERE queue.branch_id = NEW.branch_id
    AND queue.doctor_id = NEW.doctor_id
    AND (queue.arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE = operational_date
    AND queue.status IN ('IN_PREPARATION', 'IN_CONSULTATION')
    AND queue.id IS DISTINCT FROM NEW.id
  ORDER BY queue.actual_service_start_at NULLS FIRST, queue.arrival_at
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.treatment_jobs treatment
    WHERE treatment.visit_id = occupied_queue.visit_id
      AND treatment.status NOT IN ('SELESAI', 'DISERAHKAN', 'DIBATALKAN')
  )
  INTO has_unfinished_treatment;

  IF has_unfinished_treatment THEN
    RAISE EXCEPTION 'Treatment pasien sebelumnya belum selesai. Selesaikan atau batalkan semua rencana sebelum memanggil pasien berikutnya.'
      USING ERRCODE = '23514';
  END IF;

  IF occupied_queue.status = 'IN_CONSULTATION' THEN
    RAISE EXCEPTION 'Dokter sedang melayani pasien lain dalam konsultasi aktif.'
      USING ERRCODE = '23514';
  END IF;

  RAISE EXCEPTION 'Pasien lain masih berada di ruang tindakan. Selesaikan kunjungan sebelum memanggil pasien berikutnya.'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_multiple_patients_in_doctor_treatment_room() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_treatment_job_secure(
  p_treatment_id UUID,
  p_reason TEXT
)
RETURNS SETOF public.treatment_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.user_accounts%ROWTYPE;
  v_treatment public.treatment_jobs%ROWTYPE;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_reason TEXT := NULLIF(BTRIM(p_reason), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: user not authenticated';
  END IF;

  SELECT *
  INTO v_user
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid()
    AND active = true;

  IF NOT FOUND OR v_user.role NOT IN ('DOCTOR', 'DOCTOR_ASSISTANT', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Role tidak memiliki izin membatalkan rencana tindakan';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi';
  END IF;

  SELECT *
  INTO v_treatment
  FROM public.treatment_jobs
  WHERE id = p_treatment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TreatmentJob tidak ditemukan';
  END IF;

  IF v_treatment.status <> 'BELUM_DIMULAI' THEN
    RAISE EXCEPTION 'Hanya rencana tindakan yang belum dimulai yang dapat dibatalkan';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices invoice
    WHERE invoice.visit_id = v_treatment.visit_id
      AND invoice.status <> 'CANCELLED'
  ) THEN
    RAISE EXCEPTION 'Rencana tindakan tidak dapat dibatalkan setelah invoice diterbitkan';
  END IF;

  IF v_user.role = 'DOCTOR'
     AND public.get_authenticated_doctor_id()
         IS DISTINCT FROM COALESCE(v_treatment.assigned_doctor_id, v_treatment.doctor_id) THEN
    RAISE EXCEPTION 'Dokter tidak ditugaskan pada tindakan ini';
  END IF;

  IF v_user.role = 'SUPER_ADMIN' AND v_treatment.external_doctor_id IS NULL THEN
    RAISE EXCEPTION 'Super Admin hanya dapat mengelola tindakan dokter eksternal';
  END IF;

  IF v_user.role <> 'SUPER_ADMIN'
     AND NOT public.user_can_manage_treatment_branch(v_treatment.branch_id) THEN
    RAISE EXCEPTION 'Pengguna tidak memiliki izin tindakan di cabang ini';
  END IF;

  UPDATE public.treatment_jobs
  SET status = 'DIBATALKAN',
      cancelled_at = v_now,
      cancelled_by = v_user.id,
      cancellation_reason = v_reason,
      updated_at = v_now
  WHERE id = p_treatment_id
  RETURNING * INTO v_treatment;

  INSERT INTO public.treatment_activities (
    treatment_id,
    actor_id,
    actor_role,
    actor_name_snapshot,
    activity_type,
    activity_at,
    branch_id,
    notes
  ) VALUES (
    p_treatment_id,
    v_user.id,
    v_user.role,
    v_user.name,
    'CANCELLED',
    v_now,
    v_treatment.branch_id,
    v_reason
  );

  RETURN NEXT v_treatment;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_treatment_job_secure(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_treatment_job_secure(UUID, TEXT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.resubmit_treatment_to_cashier_secure(UUID, TEXT, UUID, BIGINT);

CREATE FUNCTION public.resubmit_treatment_to_cashier_secure(
  p_treatment_id UUID,
  p_corrected_notes TEXT,
  p_service_id UUID
)
RETURNS SETOF public.treatment_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.user_accounts%ROWTYPE;
  v_treatment public.treatment_jobs%ROWTYPE;
  v_service_name TEXT;
  v_base_price BIGINT;
  v_branch_price BIGINT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_corrected_notes TEXT := NULLIF(BTRIM(p_corrected_notes), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: user not authenticated';
  END IF;

  SELECT *
  INTO v_user
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid()
    AND active = true;

  IF NOT FOUND OR v_user.role <> 'DOCTOR' THEN
    RAISE EXCEPTION 'Hanya dokter penanggung jawab yang dapat mengirim ulang tindakan ini';
  END IF;

  IF v_corrected_notes IS NULL THEN
    RAISE EXCEPTION 'Catatan tindakan yang sudah dikoreksi wajib diisi';
  END IF;

  SELECT *
  INTO v_treatment
  FROM public.treatment_jobs
  WHERE id = p_treatment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TreatmentJob tidak ditemukan';
  END IF;

  IF v_treatment.status <> 'PERLU_REVISI' THEN
    RAISE EXCEPTION 'Tindakan tidak sedang menunggu revisi dokter';
  END IF;

  IF public.get_authenticated_doctor_id() IS NULL
     OR public.get_authenticated_doctor_id()
        IS DISTINCT FROM COALESCE(v_treatment.assigned_doctor_id, v_treatment.doctor_id) THEN
    RAISE EXCEPTION 'Dokter tidak ditugaskan pada tindakan ini';
  END IF;

  IF NOT public.user_can_manage_treatment_branch(v_treatment.branch_id) THEN
    RAISE EXCEPTION 'Dokter tidak memiliki izin tindakan di cabang ini';
  END IF;

  SELECT service.name, service.base_price, tariff.custom_price
  INTO v_service_name, v_base_price, v_branch_price
  FROM public.master_services service
  LEFT JOIN public.branch_service_tariffs tariff
    ON tariff.branch_id = v_treatment.branch_id
   AND tariff.service_id = service.id
   AND tariff.is_active = true
  WHERE service.id = p_service_id
    AND (service.is_active = true OR service.id = v_treatment.service_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jenis tindakan aktif tidak ditemukan';
  END IF;

  UPDATE public.treatment_jobs
  SET service_id = p_service_id,
      service_name_snapshot = v_service_name,
      price_snapshot = COALESCE(v_branch_price, v_base_price),
      notes = v_corrected_notes,
      status = 'SELESAI',
      updated_at = v_now
  WHERE id = p_treatment_id
  RETURNING * INTO v_treatment;

  INSERT INTO public.treatment_activities (
    treatment_id,
    actor_id,
    actor_role,
    actor_name_snapshot,
    activity_type,
    activity_at,
    branch_id,
    notes
  ) VALUES (
    p_treatment_id,
    v_user.id,
    v_user.role,
    v_user.name,
    'REVISION_RESUBMITTED',
    v_now,
    v_treatment.branch_id,
    format(
      'Dokter memperbarui tindakan menjadi %s; tarif resmi cabang Rp %s.',
      v_service_name,
      COALESCE(v_branch_price, v_base_price)
    )
  );

  RETURN NEXT v_treatment;
END;
$$;

REVOKE ALL ON FUNCTION public.resubmit_treatment_to_cashier_secure(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_treatment_to_cashier_secure(UUID, TEXT, UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
