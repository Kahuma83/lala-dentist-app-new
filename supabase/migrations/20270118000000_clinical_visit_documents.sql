BEGIN;

CREATE TABLE IF NOT EXISTS public.clinical_visit_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  doctor_id UUID NOT NULL REFERENCES public.dental_doctors(id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL CHECK (document_type IN ('PRESCRIPTION', 'SICK_NOTE', 'REFERRAL')),
  form_data JSONB NOT NULL CHECK (
    jsonb_typeof(form_data) = 'object'
    AND octet_length(form_data::TEXT) <= 32768
  ),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now())
);

CREATE INDEX IF NOT EXISTS idx_clinical_visit_documents_visit
  ON public.clinical_visit_documents(visit_id, created_at DESC);

REVOKE ALL ON TABLE public.clinical_visit_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.clinical_visit_documents TO authenticated;
ALTER TABLE public.clinical_visit_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinical visit documents doctor read" ON public.clinical_visit_documents;
DROP POLICY IF EXISTS "Clinical visit documents assigned doctor insert" ON public.clinical_visit_documents;

CREATE POLICY "Clinical visit documents doctor read"
  ON public.clinical_visit_documents
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'DOCTOR'
      AND public.doctor_can_manage_clinical_visit(visit_id, branch_id, doctor_id)
    )
  );

CREATE POLICY "Clinical visit documents assigned doctor insert"
  ON public.clinical_visit_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.doctor_can_manage_clinical_visit(visit_id, branch_id, doctor_id)
  );

CREATE OR REPLACE FUNCTION public.enforce_clinical_visit_document_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  visit_patient_id UUID;
  visit_branch_id UUID;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Dokumen klinis bersifat permanen; buat dokumen baru untuk revisi.';
  END IF;

  SELECT patient_id, branch_id
  INTO visit_patient_id, visit_branch_id
  FROM public.patient_visits
  WHERE id = NEW.visit_id;

  IF visit_patient_id IS DISTINCT FROM NEW.patient_id
     OR visit_branch_id IS DISTINCT FROM NEW.branch_id
     OR NEW.created_by IS DISTINCT FROM auth.uid()
     OR NOT public.doctor_can_manage_clinical_visit(NEW.visit_id, NEW.branch_id, NEW.doctor_id) THEN
    RAISE EXCEPTION 'Dokumen klinis tidak sesuai dengan pasien, kunjungan, cabang, atau penugasan dokter.';
  END IF;

  IF (
    NEW.document_type = 'PRESCRIPTION'
    AND BTRIM(COALESCE(NEW.form_data ->> 'prescription', '')) = ''
  ) OR (
    NEW.document_type = 'SICK_NOTE'
    AND (
      COALESCE(NEW.form_data ->> 'restDays', '') !~ '^[1-9][0-9]*$'
      OR COALESCE(NEW.form_data ->> 'restStartDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    )
  ) OR (
    NEW.document_type = 'REFERRAL'
    AND (
      BTRIM(COALESCE(NEW.form_data ->> 'recipientDentist', '')) = ''
      OR BTRIM(COALESCE(NEW.form_data ->> 'recipientLocation', '')) = ''
      OR BTRIM(COALESCE(NEW.form_data ->> 'complaint', '')) = ''
      OR BTRIM(COALESCE(NEW.form_data ->> 'diagnosis', '')) = ''
    )
  ) THEN
    RAISE EXCEPTION 'Dokumen klinis belum berisi semua informasi wajib.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_clinical_visit_document_integrity
  ON public.clinical_visit_documents;
CREATE TRIGGER trg_enforce_clinical_visit_document_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON public.clinical_visit_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_clinical_visit_document_integrity();

COMMIT;
