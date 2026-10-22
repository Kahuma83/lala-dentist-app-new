BEGIN;

DROP POLICY IF EXISTS "Doctors read assigned patient profiles" ON public.patient_profiles;
DROP POLICY IF EXISTS "Doctors read global patient profiles" ON public.patient_profiles;
CREATE POLICY "Doctors read global patient profiles"
  ON public.patient_profiles
  FOR SELECT
  TO authenticated
  USING (public.get_authenticated_doctor_id() IS NOT NULL);

DROP POLICY IF EXISTS "Visit assigned doctor read" ON public.patient_visits;
DROP POLICY IF EXISTS "Doctors read all patient visits" ON public.patient_visits;
CREATE POLICY "Doctors read all patient visits"
  ON public.patient_visits
  FOR SELECT
  TO authenticated
  USING (public.get_authenticated_doctor_id() IS NOT NULL);

DROP POLICY IF EXISTS "Patient medical profile doctor read" ON public.patient_medical_profiles;
CREATE POLICY "Patient medical profile doctor read"
  ON public.patient_medical_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.get_authenticated_doctor_id() IS NOT NULL
  );

DROP POLICY IF EXISTS "Clinical records doctor read" ON public.clinical_medical_records;
CREATE POLICY "Clinical records doctor read"
  ON public.clinical_medical_records
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.get_authenticated_doctor_id() IS NOT NULL
  );

DROP POLICY IF EXISTS "Doctors read global treatment jobs" ON public.treatment_jobs;
CREATE POLICY "Doctors read global treatment jobs"
  ON public.treatment_jobs
  FOR SELECT
  TO authenticated
  USING (public.get_authenticated_doctor_id() IS NOT NULL);

DROP POLICY IF EXISTS "Doctors read global treatment activities" ON public.treatment_activities;
CREATE POLICY "Doctors read global treatment activities"
  ON public.treatment_activities
  FOR SELECT
  TO authenticated
  USING (public.get_authenticated_doctor_id() IS NOT NULL);

DROP POLICY IF EXISTS "Doctors read global treatment clinical details" ON public.treatment_job_clinical_details;
CREATE POLICY "Doctors read global treatment clinical details"
  ON public.treatment_job_clinical_details
  FOR SELECT
  TO authenticated
  USING (public.get_authenticated_doctor_id() IS NOT NULL);

DROP POLICY IF EXISTS "Doctors read global clinical record addenda" ON public.clinical_medical_record_addenda;
CREATE POLICY "Doctors read global clinical record addenda"
  ON public.clinical_medical_record_addenda
  FOR SELECT
  TO authenticated
  USING (public.get_authenticated_doctor_id() IS NOT NULL);

COMMIT;
