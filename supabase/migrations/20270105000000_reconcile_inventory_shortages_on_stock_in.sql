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
  v_consumption public.inventory_treatment_consumptions%ROWTYPE;
  v_previous_stock NUMERIC(14, 2);
  v_new_stock NUMERIC(14, 2);
  v_available_stock NUMERIC(14, 2);
  v_quantity_to_deduct NUMERIC(14, 2);
  v_shortage_entry JSONB;
  v_updated_entry JSONB;
  v_updated_shortages JSONB;
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

  IF p_movement_type = 'IN' THEN
    v_available_stock := v_new_stock;

    FOR v_consumption IN
      SELECT consumption.*
      FROM public.inventory_treatment_consumptions consumption
      WHERE consumption.branch_id = v_item.branch_id
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(consumption.shortage_details) AS shortage(value)
          WHERE UPPER(TRIM(shortage.value ->> 'itemCode')) = UPPER(v_item.item_code)
            AND COALESCE(NULLIF(shortage.value ->> 'shortage', '')::NUMERIC, 0) > 0
        )
      ORDER BY consumption.created_at, consumption.treatment_job_id
      FOR UPDATE OF consumption
    LOOP
      v_updated_shortages := '[]'::JSONB;

      FOR v_shortage_entry IN
        SELECT value
        FROM jsonb_array_elements(v_consumption.shortage_details)
      LOOP
        v_updated_entry := v_shortage_entry;
        IF v_available_stock > 0
          AND UPPER(TRIM(v_shortage_entry ->> 'itemCode')) = UPPER(v_item.item_code)
          AND COALESCE(NULLIF(v_shortage_entry ->> 'shortage', '')::NUMERIC, 0) > 0
        THEN
          v_quantity_to_deduct := LEAST(
            v_available_stock,
            (v_shortage_entry ->> 'shortage')::NUMERIC
          );
          v_previous_stock := v_available_stock;
          v_available_stock := v_available_stock - v_quantity_to_deduct;
          v_updated_entry := jsonb_set(
            jsonb_set(
              v_shortage_entry,
              '{deducted}',
              to_jsonb((v_shortage_entry ->> 'deducted')::NUMERIC + v_quantity_to_deduct)
            ),
            '{shortage}',
            to_jsonb((v_shortage_entry ->> 'shortage')::NUMERIC - v_quantity_to_deduct)
          );

          UPDATE public.inventory_items
          SET current_stock = v_available_stock, updated_at = now()
          WHERE id = v_item.id;

          INSERT INTO public.inventory_movements (
            branch_id, item_id, movement_type, quantity, previous_stock, new_stock,
            reference, note, patient_visit_id, treatment_job_id, performed_by,
            performed_by_name_snapshot
          )
          VALUES (
            v_item.branch_id, v_item.id, 'OUT', v_quantity_to_deduct,
            v_previous_stock, v_available_stock,
            v_movement.id::TEXT,
            'Rekonsiliasi kekurangan resep tindakan ' || v_consumption.treatment_job_id::TEXT,
            v_consumption.patient_visit_id, v_consumption.treatment_job_id, v_actor.id,
            COALESCE(NULLIF(TRIM(v_actor.name), ''), auth.jwt() ->> 'email', 'Pengguna klinik')
          );
        END IF;
        v_updated_shortages := v_updated_shortages || jsonb_build_array(v_updated_entry);
      END LOOP;

      UPDATE public.inventory_treatment_consumptions
      SET shortage_details = v_updated_shortages
      WHERE treatment_job_id = v_consumption.treatment_job_id;

      IF v_available_stock <= 0 THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;

  RETURN v_movement;
END;
$$;
