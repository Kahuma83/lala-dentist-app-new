DROP POLICY IF EXISTS "Inventory items read assigned branch" ON public.inventory_items;
CREATE POLICY "Inventory items read assigned branch"
  ON public.inventory_items FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
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
      AND branch_id::TEXT = public.get_user_branch_id()::TEXT
    )
  );

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
    AND (
      v_actor.role NOT IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
      OR v_item.branch_id::TEXT <> public.get_user_branch_id()::TEXT
    )
  THEN
    RAISE EXCEPTION 'Inventory access is restricted to your assigned branch.';
  END IF;

  IF p_movement_type = 'IN'
    AND v_actor.role NOT IN ('SUPER_ADMIN', 'BRANCH_ADMIN')
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
  v_actor public.user_accounts%ROWTYPE;
  v_line JSONB;
  v_code TEXT;
  v_requested NUMERIC(14, 2);
  v_item public.inventory_items%ROWTYPE;
  v_previously_used NUMERIC(14, 2);
  v_to_deduct NUMERIC(14, 2);
  v_required_stock NUMERIC(14, 2);
  v_previous_stock NUMERIC(14, 2);
  v_new_stock NUMERIC(14, 2);
  v_claimed UUID;
  v_movements JSONB := '[]'::JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to record treatment inventory usage.';
  END IF;
  IF p_materials IS NULL OR jsonb_typeof(p_materials) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Treatment materials must be provided as an array.';
  END IF;
  IF jsonb_array_length(p_materials) = 0 THEN
    RAISE EXCEPTION 'At least one treatment material is required.';
  END IF;

  SELECT * INTO v_actor
  FROM public.user_accounts
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active clinic user account was not found.';
  END IF;

  SELECT * INTO v_treatment
  FROM public.treatment_jobs
  WHERE id = p_treatment_job_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Treatment was not found.';
  END IF;
  IF NOT public.is_super_admin()
    AND (
      v_actor.role NOT IN ('BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
      OR v_treatment.branch_id::TEXT <> public.get_user_branch_id()::TEXT
    )
  THEN
    RAISE EXCEPTION 'Inventory access is restricted to your assigned branch.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.inventory_treatment_consumptions
    WHERE treatment_job_id = v_treatment.id
  ) THEN
    RETURN jsonb_build_object('alreadyRecorded', true, 'movements', '[]'::JSONB);
  END IF;
  IF v_treatment.status <> 'DALAM_PROSES' THEN
    RAISE EXCEPTION 'Treatment must be in progress before its inventory can be deducted.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_materials) AS material(value)
    WHERE NULLIF(UPPER(TRIM(material.value ->> 'itemCode')), '') IS NULL
      OR COALESCE((material.value ->> 'quantity')::NUMERIC, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'Treatment material codes and quantities must be valid and positive.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_materials) AS material(value)
    GROUP BY UPPER(TRIM(material.value ->> 'itemCode'))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Treatment material codes must not be duplicated.';
  END IF;

  SELECT UPPER(TRIM(material.value ->> 'itemCode')) INTO v_code
  FROM jsonb_array_elements(p_materials) AS material(value)
  LEFT JOIN public.inventory_items item
    ON item.branch_id = v_treatment.branch_id
    AND item.item_code = UPPER(TRIM(material.value ->> 'itemCode'))
    AND item.is_active = true
  WHERE item.id IS NULL
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Required inventory item % is missing or inactive in this branch.', v_code;
  END IF;

  PERFORM item.id
  FROM public.inventory_items item
  JOIN jsonb_array_elements(p_materials) AS material(value)
    ON item.item_code = UPPER(TRIM(material.value ->> 'itemCode'))
  WHERE item.branch_id = v_treatment.branch_id AND item.is_active = true
  ORDER BY item.id
  FOR UPDATE OF item;

  SELECT item.item_code, item.current_stock,
    GREATEST((material.value ->> 'quantity')::NUMERIC - COALESCE(used.quantity, 0), 0)
  INTO v_code, v_previous_stock, v_required_stock
  FROM jsonb_array_elements(p_materials) AS material(value)
  JOIN public.inventory_items item
    ON item.branch_id = v_treatment.branch_id
    AND item.item_code = UPPER(TRIM(material.value ->> 'itemCode'))
    AND item.is_active = true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(movement.quantity), 0) AS quantity
    FROM public.inventory_movements movement
    WHERE movement.treatment_job_id = v_treatment.id
      AND movement.item_id = item.id
      AND movement.movement_type = 'OUT'
  ) used ON true
  WHERE item.current_stock < GREATEST(
    (material.value ->> 'quantity')::NUMERIC - COALESCE(used.quantity, 0), 0
  )
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Insufficient stock for item %: available %, required %.', v_code, v_previous_stock, v_required_stock;
  END IF;

  INSERT INTO public.inventory_treatment_consumptions (
    treatment_job_id, branch_id, patient_visit_id, performed_by
  )
  VALUES (v_treatment.id, v_treatment.branch_id, v_treatment.visit_id, v_actor.id)
  ON CONFLICT (treatment_job_id) DO NOTHING
  RETURNING treatment_job_id INTO v_claimed;
  IF v_claimed IS NULL THEN
    RETURN jsonb_build_object('alreadyRecorded', true, 'movements', '[]'::JSONB);
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_materials)
  LOOP
    v_code := UPPER(TRIM(v_line ->> 'itemCode'));
    v_requested := (v_line ->> 'quantity')::NUMERIC;

    SELECT * INTO v_item
    FROM public.inventory_items
    WHERE branch_id = v_treatment.branch_id
      AND item_code = v_code
      AND is_active = true;

    SELECT COALESCE(SUM(quantity), 0) INTO v_previously_used
    FROM public.inventory_movements
    WHERE treatment_job_id = v_treatment.id
      AND item_id = v_item.id
      AND movement_type = 'OUT';
    v_to_deduct := GREATEST(v_requested - v_previously_used, 0);
    IF v_to_deduct = 0 THEN
      CONTINUE;
    END IF;

    v_previous_stock := v_item.current_stock;
    v_new_stock := v_previous_stock - v_to_deduct;
    UPDATE public.inventory_items
    SET current_stock = v_new_stock, updated_at = now()
    WHERE id = v_item.id;

    INSERT INTO public.inventory_movements (
      branch_id, item_id, movement_type, quantity, previous_stock, new_stock,
      reference, note, patient_visit_id, treatment_job_id, performed_by,
      performed_by_name_snapshot
    )
    VALUES (
      v_item.branch_id, v_item.id, 'OUT', v_to_deduct, v_previous_stock, v_new_stock,
      'Resep otomatis tindakan',
      'Pemakaian standar tindakan ' || v_treatment.service_name_snapshot,
      v_treatment.visit_id, v_treatment.id, v_actor.id,
      COALESCE(NULLIF(TRIM(v_actor.name), ''), auth.jwt() ->> 'email', 'Pengguna klinik')
    );

    v_movements := v_movements || jsonb_build_array(jsonb_build_object(
      'itemCode', v_code,
      'quantity', v_to_deduct,
      'previousStock', v_previous_stock,
      'newStock', v_new_stock
    ));
  END LOOP;

  RETURN jsonb_build_object('alreadyRecorded', false, 'movements', v_movements);
END;
$$;
