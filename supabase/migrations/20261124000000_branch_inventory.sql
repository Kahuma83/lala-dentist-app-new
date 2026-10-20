CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  item_code VARCHAR(40) NOT NULL,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN ('BAHAN_TINDAKAN', 'ALAT_MEDIS', 'PERLENGKAPAN_KANTOR', 'LAINNYA')),
  unit VARCHAR(30) NOT NULL,
  current_stock NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  minimum_stock NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  storage_location VARCHAR(160),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, item_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  movement_type VARCHAR(3) NOT NULL CHECK (movement_type IN ('IN', 'OUT')),
  quantity NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),
  previous_stock NUMERIC(14, 2) NOT NULL CHECK (previous_stock >= 0),
  new_stock NUMERIC(14, 2) NOT NULL CHECK (new_stock >= 0),
  unit_cost NUMERIC(14, 2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  reference TEXT,
  note TEXT,
  patient_visit_id UUID REFERENCES public.patient_visits(id) ON DELETE RESTRICT,
  treatment_job_id UUID REFERENCES public.treatment_jobs(id) ON DELETE RESTRICT,
  performed_by UUID NOT NULL REFERENCES public.user_accounts(id) ON DELETE RESTRICT,
  performed_by_name_snapshot VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movement_snapshot_valid CHECK (
    (movement_type = 'IN' AND new_stock = previous_stock + quantity)
    OR (movement_type = 'OUT' AND new_stock = previous_stock - quantity)
  ),
  CONSTRAINT inventory_treatment_visit_required CHECK (
    treatment_job_id IS NULL OR patient_visit_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_branch_active
  ON public.inventory_items(branch_id, is_active, name);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_time
  ON public.inventory_movements(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_branch_time
  ON public.inventory_movements(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_visit
  ON public.inventory_movements(patient_visit_id)
  WHERE patient_visit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_treatment
  ON public.inventory_movements(treatment_job_id)
  WHERE treatment_job_id IS NOT NULL;

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_inventory_item_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_inventory_item_updated_at ON public.inventory_items;
CREATE TRIGGER set_inventory_item_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_inventory_item_updated_at();

DROP POLICY IF EXISTS "Inventory items read assigned branch" ON public.inventory_items;
CREATE POLICY "Inventory items read assigned branch"
  ON public.inventory_items FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
      AND (
        branch_id::TEXT = public.get_user_branch_id()::TEXT
        OR (
          public.get_user_role() IN ('DOCTOR', 'DOCTOR_ASSISTANT')
          AND public.user_can_manage_treatment_branch(branch_id)
        )
      )
    )
  );

DROP POLICY IF EXISTS "Inventory managers create branch items" ON public.inventory_items;
CREATE POLICY "Inventory managers create branch items"
  ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
    )
  );

DROP POLICY IF EXISTS "Inventory managers update branch items" ON public.inventory_items;
CREATE POLICY "Inventory managers update branch items"
  ON public.inventory_items FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
    )
  );

DROP POLICY IF EXISTS "Inventory movements read assigned branch" ON public.inventory_movements;
CREATE POLICY "Inventory movements read assigned branch"
  ON public.inventory_movements FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
      AND (
        branch_id::TEXT = public.get_user_branch_id()::TEXT
        OR (
          public.get_user_role() IN ('DOCTOR', 'DOCTOR_ASSISTANT')
          AND public.user_can_manage_treatment_branch(branch_id)
        )
      )
    )
  );

GRANT SELECT ON public.inventory_items TO authenticated;
GRANT INSERT (branch_id, item_code, name, category, unit, minimum_stock, storage_location, is_active)
  ON public.inventory_items TO authenticated;
GRANT UPDATE (item_code, name, category, unit, minimum_stock, storage_location, is_active)
  ON public.inventory_items TO authenticated;
GRANT SELECT ON public.inventory_movements TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.inventory_movements FROM authenticated;

CREATE OR REPLACE FUNCTION public.record_inventory_movement(
  p_item_id UUID,
  p_movement_type TEXT,
  p_quantity NUMERIC,
  p_note TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_patient_visit_id UUID DEFAULT NULL,
  p_treatment_job_id UUID DEFAULT NULL
)
RETURNS public.inventory_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.inventory_items%ROWTYPE;
  v_actor public.user_accounts%ROWTYPE;
  v_previous_stock NUMERIC(14, 2);
  v_new_stock NUMERIC(14, 2);
  v_movement public.inventory_movements%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to record inventory movements.';
  END IF;
  IF p_movement_type IS NULL OR p_movement_type NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'Movement type must be IN or OUT.';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 100000000 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero and within supported limits.';
  END IF;
  IF p_unit_cost IS NOT NULL AND p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Unit cost cannot be negative.';
  END IF;

  SELECT * INTO v_actor
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active clinic user account was not found.';
  END IF;

  SELECT * INTO v_item
  FROM public.inventory_items
  WHERE id = p_item_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item was not found or is inactive.';
  END IF;

  IF NOT public.is_super_admin()
    AND NOT (
      public.get_user_role() = 'BRANCH_ADMIN'
      AND v_item.branch_id::TEXT = public.get_user_branch_id()::TEXT
    )
    AND NOT (
      public.get_user_role() IN ('DOCTOR', 'DOCTOR_ASSISTANT')
      AND public.user_can_manage_treatment_branch(v_item.branch_id)
    )
  THEN
    RAISE EXCEPTION 'You do not have access to this inventory branch.';
  END IF;

  IF p_movement_type = 'IN'
    AND public.get_user_role() NOT IN ('SUPER_ADMIN', 'BRANCH_ADMIN')
  THEN
    RAISE EXCEPTION 'Only inventory managers can record stock procurement.';
  END IF;

  IF p_treatment_job_id IS NOT NULL AND p_patient_visit_id IS NULL THEN
    RAISE EXCEPTION 'A patient visit is required when linking stock usage to a treatment.';
  END IF;

  IF p_patient_visit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.patient_visits pv
    WHERE pv.id = p_patient_visit_id
      AND pv.branch_id = v_item.branch_id
      AND (p_treatment_job_id IS NULL OR EXISTS (
        SELECT 1
        FROM public.treatment_jobs tj
        WHERE tj.id = p_treatment_job_id
          AND tj.visit_id = pv.id
          AND tj.branch_id = v_item.branch_id
      ))
  ) THEN
    RAISE EXCEPTION 'Patient visit or treatment does not match the inventory branch.';
  END IF;

  v_previous_stock := v_item.current_stock;
  IF p_movement_type = 'IN' THEN
    v_new_stock := v_previous_stock + p_quantity;
  ELSE
    IF v_previous_stock < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock. Available: %, requested: %.', v_previous_stock, p_quantity;
    END IF;
    v_new_stock := v_previous_stock - p_quantity;
  END IF;

  UPDATE public.inventory_items
  SET current_stock = v_new_stock, updated_at = now()
  WHERE id = v_item.id;

  INSERT INTO public.inventory_movements (
    branch_id, item_id, movement_type, quantity, previous_stock, new_stock,
    unit_cost, reference, note, patient_visit_id, treatment_job_id,
    performed_by, performed_by_name_snapshot
  )
  VALUES (
    v_item.branch_id, v_item.id, p_movement_type, p_quantity, v_previous_stock, v_new_stock,
    p_unit_cost, NULLIF(TRIM(p_reference), ''), NULLIF(TRIM(p_note), ''),
    p_patient_visit_id, p_treatment_job_id,
    v_actor.id,
    COALESCE(NULLIF(TRIM(v_actor.name), ''), auth.jwt() ->> 'email', 'Pengguna klinik')
  )
  RETURNING * INTO v_movement;

  RETURN v_movement;
END;
$$;

REVOKE ALL ON FUNCTION public.record_inventory_movement(UUID, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_inventory_movement(UUID, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, UUID, UUID) TO authenticated;
