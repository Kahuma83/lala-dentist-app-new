INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinical-consent-documents',
  'clinical-consent-documents',
  FALSE,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png'];

CREATE TABLE IF NOT EXISTS public.clinical_consent_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  scope TEXT NOT NULL CHECK (scope IN ('VISIT', 'TREATMENT')),
  treatment_job_id UUID REFERENCES public.treatment_jobs(id) ON DELETE RESTRICT,
  object_path TEXT NOT NULL UNIQUE,
  original_file_name TEXT NOT NULL CHECK (BTRIM(original_file_name) <> '' AND LENGTH(original_file_name) <= 255),
  content_type TEXT NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  uploaded_by UUID NOT NULL DEFAULT auth.uid(),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_clinical_consent_document_scope_job
    CHECK ((scope = 'VISIT' AND treatment_job_id IS NULL) OR (scope = 'TREATMENT' AND treatment_job_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_clinical_consent_documents_visit
  ON public.clinical_consent_documents(visit_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_consent_documents_treatment
  ON public.clinical_consent_documents(treatment_job_id, uploaded_at DESC)
  WHERE treatment_job_id IS NOT NULL;

REVOKE ALL ON TABLE public.clinical_consent_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.clinical_consent_documents TO authenticated;
ALTER TABLE public.clinical_consent_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinical consent documents doctor read" ON public.clinical_consent_documents;
DROP POLICY IF EXISTS "Clinical consent documents doctor insert" ON public.clinical_consent_documents;

CREATE POLICY "Clinical consent documents doctor read"
  ON public.clinical_consent_documents
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.get_user_role() = 'DOCTOR' AND public.user_can_manage_treatment_branch(branch_id))
  );

CREATE POLICY "Clinical consent documents doctor insert"
  ON public.clinical_consent_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      public.is_super_admin()
      OR (public.get_user_role() = 'DOCTOR' AND public.user_can_manage_treatment_branch(branch_id))
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_clinical_consent_document_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  visit_branch_id UUID;
  job_visit_id UUID;
  job_branch_id UUID;
  service_requires_consent BOOLEAN;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Dokumen consent bersifat permanen dan tidak dapat diubah atau dihapus.';
  END IF;

  SELECT branch_id INTO visit_branch_id
  FROM public.patient_visits
  WHERE id = NEW.visit_id;

  IF visit_branch_id IS DISTINCT FROM NEW.branch_id THEN
    RAISE EXCEPTION 'Cabang dokumen consent tidak sesuai dengan kunjungan.';
  END IF;

  IF NEW.scope = 'TREATMENT' THEN
    SELECT job.visit_id, job.branch_id, service.requires_consent
    INTO job_visit_id, job_branch_id, service_requires_consent
    FROM public.treatment_jobs AS job
    JOIN public.master_services AS service ON service.id = job.service_id
    WHERE job.id = NEW.treatment_job_id;

    IF job_visit_id IS DISTINCT FROM NEW.visit_id
       OR job_branch_id IS DISTINCT FROM NEW.branch_id
       OR service_requires_consent IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Dokumen consent tindakan hanya dapat dikaitkan dengan layanan wajib consent pada kunjungan dan cabang yang sama.';
    END IF;
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
     OR public.get_user_role() NOT IN ('DOCTOR', 'SUPER_ADMIN')
     OR (
       NOT public.is_super_admin()
       AND NOT public.user_can_manage_treatment_branch(NEW.branch_id)
     ) THEN
    RAISE EXCEPTION 'Data dokumen consent tidak valid atau Anda tidak memiliki akses.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_clinical_consent_document_integrity
  ON public.clinical_consent_documents;
CREATE TRIGGER trg_enforce_clinical_consent_document_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON public.clinical_consent_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_clinical_consent_document_integrity();

DROP POLICY IF EXISTS "Clinical consent document authorized read" ON storage.objects;
DROP POLICY IF EXISTS "Clinical consent document authorized upload" ON storage.objects;
DROP POLICY IF EXISTS "Clinical consent document uploader cleanup" ON storage.objects;

CREATE POLICY "Clinical consent document authorized read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'clinical-consent-documents'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
    AND EXISTS (
      SELECT 1
      FROM public.clinical_consent_documents AS document
      WHERE document.object_path = name
    )
    AND (
      public.is_super_admin()
      OR (
        public.get_user_role() = 'DOCTOR'
        AND public.user_can_manage_treatment_branch(((storage.foldername(name))[1])::UUID)
      )
    )
  );

CREATE POLICY "Clinical consent document authorized upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'clinical-consent-documents'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
    AND (storage.foldername(name))[3] = auth.uid()::TEXT
    AND EXISTS (
      SELECT 1
      FROM public.patient_visits AS visit
      WHERE visit.id::TEXT = (storage.foldername(name))[2]
        AND visit.branch_id::TEXT = (storage.foldername(name))[1]
    )
    AND (
      public.is_super_admin()
      OR (
        public.get_user_role() = 'DOCTOR'
        AND public.user_can_manage_treatment_branch(((storage.foldername(name))[1])::UUID)
      )
    )
  );

CREATE POLICY "Clinical consent document uploader cleanup"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'clinical-consent-documents'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
    AND (storage.foldername(name))[3] = auth.uid()::TEXT
    AND NOT EXISTS (
      SELECT 1
      FROM public.clinical_consent_documents AS document
      WHERE document.object_path = name
    )
    AND EXISTS (
      SELECT 1
      FROM public.patient_visits AS visit
      WHERE visit.id::TEXT = (storage.foldername(name))[2]
        AND visit.branch_id::TEXT = (storage.foldername(name))[1]
    )
    AND (
      public.is_super_admin()
      OR (
        public.get_user_role() = 'DOCTOR'
        AND public.user_can_manage_treatment_branch(((storage.foldername(name))[1])::UUID)
      )
    )
  );
