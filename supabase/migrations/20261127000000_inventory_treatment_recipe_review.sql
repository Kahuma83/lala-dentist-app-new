CREATE TABLE IF NOT EXISTS public.inventory_treatment_recipes (
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  service_code VARCHAR(80) NOT NULL,
  materials JSONB NOT NULL CHECK (jsonb_typeof(materials) = 'array'),
  approved_by UUID NOT NULL REFERENCES public.user_accounts(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, service_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_treatment_recipe_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  service_code VARCHAR(80) NOT NULL,
  proposed_materials JSONB NOT NULL CHECK (jsonb_typeof(proposed_materials) = 'array'),
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  note TEXT,
  submitted_by UUID NOT NULL REFERENCES public.user_accounts(id) ON DELETE RESTRICT,
  submitted_by_name_snapshot VARCHAR(100) NOT NULL,
  submitted_by_role_snapshot VARCHAR(30) NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES public.user_accounts(id) ON DELETE RESTRICT,
  reviewed_by_name_snapshot VARCHAR(100),
  reviewed_by_role_snapshot VARCHAR(30),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_inventory_recipe_changes_branch_status
  ON public.inventory_treatment_recipe_changes(branch_id, status, submitted_at DESC);

ALTER TABLE public.inventory_treatment_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_treatment_recipe_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read inventory recipes in assigned branch" ON public.inventory_treatment_recipes;
CREATE POLICY "Read inventory recipes in assigned branch"
  ON public.inventory_treatment_recipes FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
    )
  );

DROP POLICY IF EXISTS "Read inventory recipe changes in assigned branch" ON public.inventory_treatment_recipe_changes;
CREATE POLICY "Read inventory recipe changes in assigned branch"
  ON public.inventory_treatment_recipe_changes FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
    )
  );

GRANT SELECT ON public.inventory_treatment_recipes, public.inventory_treatment_recipe_changes TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.inventory_treatment_recipes, public.inventory_treatment_recipe_changes FROM authenticated;

CREATE OR REPLACE FUNCTION public.submit_inventory_treatment_recipe_change(
  p_branch_id UUID,
  p_service_code TEXT,
  p_materials JSONB,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.user_accounts%ROWTYPE;
  v_change_id UUID;
BEGIN
  SELECT * INTO v_actor
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;
  IF NOT FOUND OR v_actor.role NOT IN ('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT') THEN
    RAISE EXCEPTION 'An active clinic user with inventory access is required.';
  END IF;
  IF NOT public.is_super_admin() AND p_branch_id::TEXT <> public.get_user_branch_id()::TEXT THEN
    RAISE EXCEPTION 'Recipe access is restricted to your assigned branch.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.master_services
    WHERE code = UPPER(TRIM(p_service_code)) AND is_active = true
  ) THEN
    RAISE EXCEPTION 'The selected treatment service is not active.';
  END IF;
  IF p_materials IS NULL OR jsonb_typeof(p_materials) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Recipe materials must be provided as an array.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_materials) AS material(value)
    WHERE NULLIF(UPPER(TRIM(material.value ->> 'itemCode')), '') IS NULL
      OR COALESCE((material.value ->> 'quantity')::NUMERIC, 0) <= 0
      OR (material.value ->> 'quantity')::NUMERIC > 100000000
  ) THEN
    RAISE EXCEPTION 'Material codes and quantities must be valid and positive.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_materials) AS material(value)
    GROUP BY UPPER(TRIM(material.value ->> 'itemCode'))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Recipe material codes must not be duplicated.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_materials) AS material(value)
    LEFT JOIN public.inventory_items item
      ON item.branch_id = p_branch_id
      AND item.item_code = UPPER(TRIM(material.value ->> 'itemCode'))
      AND item.is_active = true
    WHERE item.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Every recipe material must be an active inventory item in this branch.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventory_treatment_recipe_changes
    WHERE branch_id = p_branch_id
      AND service_code = UPPER(TRIM(p_service_code))
      AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'A pending recipe change already exists for this treatment.';
  END IF;

  INSERT INTO public.inventory_treatment_recipe_changes (
    branch_id, service_code, proposed_materials, note, submitted_by,
    submitted_by_name_snapshot, submitted_by_role_snapshot
  )
  VALUES (
    p_branch_id,
    UPPER(TRIM(p_service_code)),
    p_materials,
    NULLIF(TRIM(p_note), ''),
    v_actor.id,
    COALESCE(NULLIF(TRIM(v_actor.name), ''), auth.jwt() ->> 'email', 'Pengguna klinik'),
    v_actor.role
  )
  RETURNING id INTO v_change_id;
  RETURN v_change_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_inventory_treatment_recipe_change(
  p_change_id UUID,
  p_approve BOOLEAN,
  p_review_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.user_accounts%ROWTYPE;
  v_change public.inventory_treatment_recipe_changes%ROWTYPE;
BEGIN
  SELECT * INTO v_actor
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;
  IF NOT FOUND OR v_actor.role NOT IN ('SUPER_ADMIN', 'DOCTOR') THEN
    RAISE EXCEPTION 'Only a doctor or Super Admin can review treatment recipes.';
  END IF;
  SELECT * INTO v_change
  FROM public.inventory_treatment_recipe_changes
  WHERE id = p_change_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe change was not found.';
  END IF;
  IF NOT public.is_super_admin() AND v_change.branch_id::TEXT <> public.get_user_branch_id()::TEXT THEN
    RAISE EXCEPTION 'Recipe review is restricted to your assigned branch.';
  END IF;
  IF v_change.status <> 'PENDING' THEN
    RAISE EXCEPTION 'This recipe change has already been reviewed.';
  END IF;

  IF p_approve THEN
    INSERT INTO public.inventory_treatment_recipes (
      branch_id, service_code, materials, approved_by, approved_at
    )
    VALUES (
      v_change.branch_id, v_change.service_code, v_change.proposed_materials, v_actor.id, now()
    )
    ON CONFLICT (branch_id, service_code) DO UPDATE SET
      materials = EXCLUDED.materials,
      approved_by = EXCLUDED.approved_by,
      approved_at = EXCLUDED.approved_at;
  END IF;

  UPDATE public.inventory_treatment_recipe_changes
  SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
      reviewed_by = v_actor.id,
      reviewed_by_name_snapshot = COALESCE(NULLIF(TRIM(v_actor.name), ''), auth.jwt() ->> 'email', 'Pengguna klinik'),
      reviewed_by_role_snapshot = v_actor.role,
      reviewed_at = now(),
      review_note = NULLIF(TRIM(p_review_note), '')
  WHERE id = v_change.id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_inventory_treatment_recipe_change(UUID, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_inventory_treatment_recipe_change(UUID, TEXT, JSONB, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.review_inventory_treatment_recipe_change(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_inventory_treatment_recipe_change(UUID, BOOLEAN, TEXT) TO authenticated;

ALTER FUNCTION public.record_inventory_treatment_usage(UUID, JSONB)
  RENAME TO record_inventory_treatment_usage_unvalidated;
REVOKE ALL ON FUNCTION public.record_inventory_treatment_usage_unvalidated(UUID, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_inventory_treatment_usage(
  p_treatment_job_id UUID,
  p_materials JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_treatment public.treatment_jobs%ROWTYPE;
  v_recipe_materials JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to record treatment inventory usage.';
  END IF;
  SELECT * INTO v_treatment
  FROM public.treatment_jobs
  WHERE id = p_treatment_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Treatment was not found.';
  END IF;

  SELECT materials INTO v_recipe_materials
  FROM public.inventory_treatment_recipes
  WHERE branch_id = v_treatment.branch_id
    AND service_code = (
      SELECT code FROM public.master_services WHERE id = v_treatment.service_id
    );
  IF FOUND AND p_materials IS DISTINCT FROM v_recipe_materials THEN
    RAISE EXCEPTION 'Submitted materials do not match the approved recipe for this branch.';
  END IF;

  RETURN public.record_inventory_treatment_usage_unvalidated(p_treatment_job_id, p_materials);
END;
$$;

REVOKE ALL ON FUNCTION public.record_inventory_treatment_usage(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_inventory_treatment_usage(UUID, JSONB) TO authenticated;
