-- Doctors need a clinic-wide patient history to support visits across branches.
-- These policies grant read access only; existing branch-scoped write policies remain unchanged.

DROP POLICY IF EXISTS "Doctors read all global patient profiles" ON public.patient_profiles;
CREATE POLICY "Doctors read all global patient profiles"
  ON public.patient_profiles
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() = 'DOCTOR');

DROP POLICY IF EXISTS "Doctors read all patient visits" ON public.patient_visits;
CREATE POLICY "Doctors read all patient visits"
  ON public.patient_visits
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() = 'DOCTOR');

DROP POLICY IF EXISTS "Doctors read all patient medical records" ON public.clinical_medical_records;
CREATE POLICY "Doctors read all patient medical records"
  ON public.clinical_medical_records
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() = 'DOCTOR');
