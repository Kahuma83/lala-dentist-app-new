BEGIN;

CREATE TABLE IF NOT EXISTS public.prescription_medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generic_name TEXT NOT NULL CHECK (BTRIM(generic_name) <> ''),
  brand_name TEXT NOT NULL DEFAULT '',
  strength TEXT NOT NULL CHECK (BTRIM(strength) <> ''),
  dosage_form TEXT NOT NULL CHECK (BTRIM(dosage_form) <> ''),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prescription_medicines_identity
  ON public.prescription_medicines (
    LOWER(BTRIM(generic_name)),
    LOWER(BTRIM(brand_name)),
    LOWER(BTRIM(strength)),
    LOWER(BTRIM(dosage_form))
  );

CREATE INDEX IF NOT EXISTS idx_prescription_medicines_active_name
  ON public.prescription_medicines (is_active, generic_name);

REVOKE ALL ON TABLE public.prescription_medicines FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.prescription_medicines TO authenticated;
ALTER TABLE public.prescription_medicines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Prescription medicines read" ON public.prescription_medicines;
DROP POLICY IF EXISTS "Prescription medicines super admin insert" ON public.prescription_medicines;
DROP POLICY IF EXISTS "Prescription medicines super admin update" ON public.prescription_medicines;

CREATE POLICY "Prescription medicines read"
  ON public.prescription_medicines
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.get_user_role() = 'DOCTOR' AND is_active = true)
  );

CREATE POLICY "Prescription medicines super admin insert"
  ON public.prescription_medicines
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Prescription medicines super admin update"
  ON public.prescription_medicines
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMIT;
