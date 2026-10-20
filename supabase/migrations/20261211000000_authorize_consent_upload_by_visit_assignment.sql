CREATE OR REPLACE FUNCTION public.can_upload_clinical_consent_document(
  target_visit_id UUID,
  target_branch_id UUID,
  target_scope TEXT,
  target_treatment_job_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_doctor_id UUID;
  visit_branch_id UUID;
  visit_doctor_id UUID;
  treatment_visit_id UUID;
  treatment_branch_id UUID;
  treatment_doctor_id UUID;
  service_requires_consent BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role() <> 'DOCTOR' THEN
    RETURN FALSE;
  END IF;

  SELECT account.doctor_id
  INTO current_doctor_id
  FROM public.user_accounts AS account
  WHERE account.auth_user_id = auth.uid()
    AND account.active = TRUE
    AND account.role = 'DOCTOR';

  IF current_doctor_id IS NULL
     OR NOT public.user_can_manage_treatment_branch(target_branch_id) THEN
    RETURN FALSE;
  END IF;

  SELECT visit.branch_id, visit.doctor_id
  INTO visit_branch_id, visit_doctor_id
  FROM public.patient_visits AS visit
  WHERE visit.id = target_visit_id;

  IF visit_branch_id IS DISTINCT FROM target_branch_id THEN
    RETURN FALSE;
  END IF;

  IF target_scope = 'VISIT' THEN
    RETURN target_treatment_job_id IS NULL
      AND visit_doctor_id = current_doctor_id;
  END IF;

  IF target_scope <> 'TREATMENT' OR target_treatment_job_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT job.visit_id, job.branch_id, COALESCE(job.assigned_doctor_id, job.doctor_id), service.requires_consent
  INTO treatment_visit_id, treatment_branch_id, treatment_doctor_id, service_requires_consent
  FROM public.treatment_jobs AS job
  JOIN public.master_services AS service ON service.id = job.service_id
  WHERE job.id = target_treatment_job_id;

  RETURN treatment_visit_id = target_visit_id
    AND treatment_branch_id = target_branch_id
    AND treatment_doctor_id = current_doctor_id
    AND service_requires_consent = TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_upload_clinical_consent_to_visit(
  target_visit_id UUID,
  target_branch_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_doctor_id UUID;
  visit_branch_id UUID;
  visit_doctor_id UUID;
BEGIN
  IF auth.uid() IS NULL
     OR public.get_user_role() <> 'DOCTOR'
     OR NOT public.user_can_manage_treatment_branch(target_branch_id) THEN
    RETURN FALSE;
  END IF;

  SELECT account.doctor_id
  INTO current_doctor_id
  FROM public.user_accounts AS account
  WHERE account.auth_user_id = auth.uid()
    AND account.active = TRUE
    AND account.role = 'DOCTOR';

  IF current_doctor_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT visit.branch_id, visit.doctor_id
  INTO visit_branch_id, visit_doctor_id
  FROM public.patient_visits AS visit
  WHERE visit.id = target_visit_id;

  IF visit_branch_id IS DISTINCT FROM target_branch_id THEN
    RETURN FALSE;
  END IF;

  RETURN visit_doctor_id = current_doctor_id
    OR EXISTS (
      SELECT 1
      FROM public.treatment_jobs AS job
      JOIN public.master_services AS service ON service.id = job.service_id
      WHERE job.visit_id = target_visit_id
        AND job.branch_id = target_branch_id
        AND COALESCE(job.assigned_doctor_id, job.doctor_id) = current_doctor_id
        AND service.requires_consent = TRUE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.can_upload_clinical_consent_document(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_upload_clinical_consent_to_visit(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_clinical_consent_document(UUID, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_clinical_consent_to_visit(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "Clinical consent documents doctor insert" ON public.clinical_consent_documents;
CREATE POLICY "Clinical consent documents assigned doctor insert"
  ON public.clinical_consent_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      public.is_super_admin()
      OR public.can_upload_clinical_consent_document(
        visit_id,
        branch_id,
        scope,
        treatment_job_id
      )
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_clinical_consent_document_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Dokumen consent bersifat permanen dan tidak dapat diubah atau dihapus.';
  END IF;

  IF NEW.uploaded_by IS DISTINCT FROM auth.uid()
     OR NEW.object_path !~ (
       '^' || NEW.branch_id::TEXT || '/' || NEW.visit_id::TEXT || '/'
       || auth.uid()::TEXT || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
     )
     OR NOT (
       (NEW.content_type = 'application/pdf' AND NEW.object_path ~ '\.pdf$')
       OR (NEW.content_type = 'image/jpeg' AND NEW.object_path ~ '\.jpg$')
       OR (NEW.content_type = 'image/png' AND NEW.object_path ~ '\.png$')
     )
     OR NOT (
       public.is_super_admin()
       OR public.can_upload_clinical_consent_document(
         NEW.visit_id,
         NEW.branch_id,
         NEW.scope,
         NEW.treatment_job_id
       )
     ) THEN
    RAISE EXCEPTION 'Dokumen consent tidak sesuai dengan penugasan dokter, cabang, atau layanan yang memerlukan consent.';
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Clinical consent document authorized upload" ON storage.objects;
CREATE POLICY "Clinical consent document assigned doctor upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'clinical-consent-documents'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
    AND (storage.foldername(name))[3] = auth.uid()::TEXT
    AND (
      public.is_super_admin()
      OR public.can_upload_clinical_consent_to_visit(
        ((storage.foldername(name))[2])::UUID,
        ((storage.foldername(name))[1])::UUID
      )
    )
  );
