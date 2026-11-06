ALTER TABLE public.staff_absence_requests
  ADD COLUMN IF NOT EXISTS admin_external_doctor_id UUID
    REFERENCES public.external_doctor_recipients(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.guard_absence_external_replacement_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.staff_absence_requests;
BEGIN
  SELECT * INTO v_request
  FROM public.staff_absence_requests
  WHERE id = NEW.absence_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengajuan ketidakhadiran tidak ditemukan.';
  END IF;

  IF v_request.branch_id IS NOT NULL AND NEW.branch_id IS DISTINCT FROM v_request.branch_id THEN
    RAISE EXCEPTION 'Penugasan dokter eksternal harus berada di cabang yang sama dengan pengajuan.';
  END IF;

  IF v_request.replacement_selection_finalized
    AND (
      v_request.admin_external_doctor_id IS NULL
      OR NEW.external_doctor_id IS DISTINCT FROM v_request.admin_external_doctor_id
    )
  THEN
    RAISE EXCEPTION 'Penugasan eksternal pada pengajuan baru harus dipilih secara eksplisit oleh Super Admin.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_absence_replacement_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'APPROVED' AND NEW.replacement_selection_finalized THEN
    IF NEW.admin_external_doctor_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.external_doctor_replacement_assignments assignment
        WHERE assignment.absence_request_id = NEW.id
          AND assignment.external_doctor_id = NEW.admin_external_doctor_id
      ) THEN
        RAISE EXCEPTION 'Penugasan dokter eksternal pilihan Super Admin tidak tercatat.';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.proposed_replacement_staff_id IS NOT NULL THEN
      IF NEW.replacement_response_status <> 'ACCEPTED' THEN
        RAISE EXCEPTION 'Pengganti harus menyetujui sebelum pengajuan dapat disetujui.';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.staff_replacement_assignments assignment
        WHERE assignment.absence_request_id = NEW.id
          AND assignment.replacement_staff_id = NEW.proposed_replacement_staff_id
      ) THEN
        RAISE EXCEPTION 'Penugasan pengganti yang dipilih tidak tercatat.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS verify_absence_external_replacement ON public.staff_absence_requests;
CREATE CONSTRAINT TRIGGER verify_absence_external_replacement
  AFTER UPDATE ON public.staff_absence_requests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.status = 'APPROVED'
    AND NEW.replacement_selection_finalized
    AND NEW.admin_external_doctor_id IS NOT NULL)
  EXECUTE FUNCTION public.verify_absence_replacement_consent();

CREATE OR REPLACE FUNCTION public.review_doctor_absence_request_with_external_override(
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
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat memproses pengajuan ketidakhadiran.';
  END IF;

  UPDATE public.staff_absence_requests
  SET admin_external_doctor_id = CASE
    WHEN p_approve THEN p_external_doctor_id
    ELSE NULL
  END,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_request_id
    AND status = 'PENDING'
  RETURNING * INTO v_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengajuan tidak ditemukan atau sudah diproses.';
  END IF;

  RETURN public.review_doctor_absence_request(
    p_request_id,
    p_approve,
    p_reviewer_note,
    p_replacement_doctor_id,
    p_external_doctor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_doctor_absence_request_with_external_override(UUID, BOOLEAN, TEXT, UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_doctor_absence_request_with_external_override(UUID, BOOLEAN, TEXT, UUID, UUID)
  TO authenticated;
