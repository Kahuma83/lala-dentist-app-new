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
  v_official_price BIGINT;
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

  v_official_price := COALESCE(v_branch_price, v_base_price);
  IF NEW.price_snapshot IS NULL THEN
    NEW.price_snapshot := v_official_price;
  ELSIF NEW.price_snapshot < 0 OR NEW.price_snapshot > 9007199254740991 THEN
    RAISE EXCEPTION 'Harga tindakan harus berupa angka Rupiah bulat dan tidak boleh negatif';
  ELSIF NEW.price_snapshot <> v_official_price THEN
    IF auth.uid() IS NULL
       OR v_role <> 'DOCTOR'
       OR public.get_authenticated_doctor_id()
          IS DISTINCT FROM COALESCE(NEW.assigned_doctor_id, NEW.doctor_id) THEN
      RAISE EXCEPTION 'Hanya dokter penanggung jawab yang dapat menyesuaikan harga tindakan';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_doctor_treatment_price_adjustment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_official_price BIGINT;
  v_actor public.user_accounts%ROWTYPE;
BEGIN
  SELECT COALESCE(tariff.custom_price, service.base_price)
  INTO v_official_price
  FROM public.master_services service
  LEFT JOIN public.branch_service_tariffs tariff
    ON tariff.branch_id = NEW.branch_id
   AND tariff.service_id = NEW.service_id
   AND tariff.is_active = true
  WHERE service.id = NEW.service_id;

  IF NEW.price_snapshot IS NOT DISTINCT FROM v_official_price THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_actor
  FROM public.user_accounts
  WHERE id = NEW.patient_approved_by;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengguna dokter untuk audit penyesuaian harga tidak ditemukan';
  END IF;

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
    NEW.id,
    v_actor.id,
    v_actor.role,
    v_actor.name,
    'OTHER',
    COALESCE(NEW.created_at, timezone('utc'::text, now())),
    NEW.branch_id,
    format(
      'Harga tindakan disesuaikan dari tarif cabang Rp %s menjadi Rp %s.',
      v_official_price,
      NEW.price_snapshot
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_doctor_treatment_price_adjustment ON public.treatment_jobs;

CREATE TRIGGER log_doctor_treatment_price_adjustment
  AFTER INSERT ON public.treatment_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.log_doctor_treatment_price_adjustment();

DROP FUNCTION IF EXISTS public.resubmit_treatment_to_cashier_secure(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.resubmit_treatment_to_cashier_secure(UUID, TEXT, UUID, BIGINT);
DROP FUNCTION IF EXISTS public.resubmit_treatment_to_cashier_secure(UUID, TEXT, UUID, BIGINT, BOOLEAN);

CREATE FUNCTION public.resubmit_treatment_to_cashier_secure(
  p_treatment_id UUID,
  p_corrected_notes TEXT,
  p_service_id UUID,
  p_price_snapshot BIGINT,
  p_patient_approval_confirmed BOOLEAN
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
  v_official_price BIGINT;
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

  IF p_patient_approval_confirmed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Persetujuan lisan pasien atas harga koreksi wajib dicatat';
  END IF;

  IF p_price_snapshot IS NULL
     OR p_price_snapshot < 0
     OR p_price_snapshot > 9007199254740991 THEN
    RAISE EXCEPTION 'Harga tindakan harus berupa angka Rupiah bulat dan tidak boleh negatif';
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

  v_official_price := COALESCE(v_branch_price, v_base_price);

  UPDATE public.treatment_jobs
  SET service_id = p_service_id,
      service_name_snapshot = v_service_name,
      price_snapshot = p_price_snapshot,
      notes = v_corrected_notes,
      patient_approval_method = 'VERBAL',
      patient_approved_at = v_now,
      patient_approved_by = v_user.id,
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
      'Dokter memperbarui tindakan menjadi %s; tarif dasar cabang Rp %s, harga tindakan Rp %s.',
      v_service_name,
      v_official_price,
      p_price_snapshot
    )
  );

  RETURN NEXT v_treatment;
END;
$$;

REVOKE ALL ON FUNCTION public.resubmit_treatment_to_cashier_secure(UUID, TEXT, UUID, BIGINT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_treatment_to_cashier_secure(UUID, TEXT, UUID, BIGINT, BOOLEAN) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
