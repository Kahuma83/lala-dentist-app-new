CREATE TABLE IF NOT EXISTS public.inventory_treatment_consumptions (
  treatment_job_id UUID PRIMARY KEY REFERENCES public.treatment_jobs(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  patient_visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE RESTRICT,
  performed_by UUID NOT NULL REFERENCES public.user_accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_treatment_consumptions ENABLE ROW LEVEL SECURITY;

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
    RAISE EXCEPTION 'At least one treatment material is required.';
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
  IF v_actor.role NOT IN ('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT')
    OR NOT public.is_super_admin() AND NOT (
      v_treatment.branch_id::TEXT = public.get_user_branch_id()::TEXT
      OR (
        v_actor.role IN ('DOCTOR', 'DOCTOR_ASSISTANT')
        AND public.user_can_manage_treatment_branch(v_treatment.branch_id)
      )
    )
  THEN
    RAISE EXCEPTION 'You do not have access to this treatment branch.';
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

  SELECT item.item_code,
    item.current_stock,
    GREATEST(
      (material.value ->> 'quantity')::NUMERIC - COALESCE(used.quantity, 0),
      0
    )
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
    (material.value ->> 'quantity')::NUMERIC - COALESCE(used.quantity, 0),
    0
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

REVOKE ALL ON FUNCTION public.record_inventory_treatment_usage(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_inventory_treatment_usage(UUID, JSONB) TO authenticated;
