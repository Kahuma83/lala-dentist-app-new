ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_current_stock_check;

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_previous_stock_check,
  DROP CONSTRAINT IF EXISTS inventory_movements_new_stock_check;

DO $$
DECLARE
  v_item public.inventory_items%ROWTYPE;
  v_consumption public.inventory_treatment_consumptions%ROWTYPE;
  v_shortage_entry JSONB;
  v_updated_entry JSONB;
  v_updated_shortages JSONB;
  v_previous_stock NUMERIC(14, 2);
  v_new_stock NUMERIC(14, 2);
  v_quantity NUMERIC(14, 2);
BEGIN
  FOR v_item IN
    SELECT *
    FROM public.inventory_items
    ORDER BY id
    FOR UPDATE
  LOOP
    v_new_stock := v_item.current_stock;

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
        IF UPPER(TRIM(v_shortage_entry ->> 'itemCode')) = UPPER(v_item.item_code)
          AND COALESCE(NULLIF(v_shortage_entry ->> 'shortage', '')::NUMERIC, 0) > 0
        THEN
          v_quantity := (v_shortage_entry ->> 'shortage')::NUMERIC;
          v_previous_stock := v_new_stock;
          v_new_stock := v_new_stock - v_quantity;
          v_updated_entry := jsonb_set(
            jsonb_set(
              jsonb_set(
                v_shortage_entry,
                '{deducted}',
                to_jsonb(COALESCE(NULLIF(v_shortage_entry ->> 'deducted', '')::NUMERIC, 0) + v_quantity)
              ),
              '{shortage}',
              '0'::JSONB
            ),
            '{stockDeficit}',
            to_jsonb(GREATEST(-v_new_stock, 0))
          );

          INSERT INTO public.inventory_movements (
            branch_id, item_id, movement_type, quantity, previous_stock, new_stock,
            reference, note, patient_visit_id, treatment_job_id, performed_by,
            performed_by_name_snapshot
          )
          SELECT
            v_item.branch_id, v_item.id, 'OUT', v_quantity, v_previous_stock, v_new_stock,
            'Rekonsiliasi kekurangan resep tindakan (migrasi)',
            'Rekonsiliasi stok minus historis',
            v_consumption.patient_visit_id, v_consumption.treatment_job_id,
            actor.id, COALESCE(NULLIF(TRIM(actor.name), ''), 'Pengguna klinik')
          FROM public.user_accounts actor
          WHERE actor.id = v_consumption.performed_by;
        END IF;
        v_updated_shortages := v_updated_shortages || jsonb_build_array(v_updated_entry);
      END LOOP;

      UPDATE public.inventory_treatment_consumptions
      SET shortage_details = v_updated_shortages
      WHERE treatment_job_id = v_consumption.treatment_job_id;
    END LOOP;

    IF v_new_stock <> v_item.current_stock THEN
      UPDATE public.inventory_items
      SET current_stock = v_new_stock, updated_at = now()
      WHERE id = v_item.id;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_inventory_treatment_usage_unvalidated(
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
  v_remaining NUMERIC(14, 2);
  v_stock_deficit NUMERIC(14, 2);
  v_previous_stock NUMERIC(14, 2);
  v_new_stock NUMERIC(14, 2);
  v_claimed UUID;
  v_movements JSONB := '[]'::JSONB;
  v_shortages JSONB := '[]'::JSONB;
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
    SELECT shortage_details INTO v_shortages
    FROM public.inventory_treatment_consumptions
    WHERE treatment_job_id = v_treatment.id;
    RETURN jsonb_build_object(
      'alreadyRecorded', true,
      'movements', '[]'::JSONB,
      'shortages', COALESCE(v_shortages, '[]'::JSONB)
    );
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

  PERFORM item.id
  FROM public.inventory_items item
  JOIN jsonb_array_elements(p_materials) AS material(value)
    ON item.item_code = UPPER(TRIM(material.value ->> 'itemCode'))
  WHERE item.branch_id = v_treatment.branch_id AND item.is_active = true
  ORDER BY item.id
  FOR UPDATE OF item;

  INSERT INTO public.inventory_treatment_consumptions (
    treatment_job_id, branch_id, patient_visit_id, performed_by
  )
  VALUES (v_treatment.id, v_treatment.branch_id, v_treatment.visit_id, v_actor.id)
  ON CONFLICT (treatment_job_id) DO NOTHING
  RETURNING treatment_job_id INTO v_claimed;
  IF v_claimed IS NULL THEN
    SELECT shortage_details INTO v_shortages
    FROM public.inventory_treatment_consumptions
    WHERE treatment_job_id = v_treatment.id;
    RETURN jsonb_build_object(
      'alreadyRecorded', true,
      'movements', '[]'::JSONB,
      'shortages', COALESCE(v_shortages, '[]'::JSONB)
    );
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

    IF NOT FOUND THEN
      v_shortages := v_shortages || jsonb_build_array(jsonb_build_object(
        'itemCode', v_code,
        'requested', v_requested,
        'deducted', 0,
        'shortage', v_requested
      ));
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(quantity), 0) INTO v_previously_used
    FROM public.inventory_movements
    WHERE treatment_job_id = v_treatment.id
      AND item_id = v_item.id
      AND movement_type = 'OUT';
    v_remaining := GREATEST(v_requested - v_previously_used, 0);
    v_to_deduct := v_remaining;
    v_previous_stock := v_item.current_stock;
    v_new_stock := v_previous_stock - v_to_deduct;
    v_stock_deficit := GREATEST(-v_new_stock, 0);

    IF v_stock_deficit > 0 THEN
      v_shortages := v_shortages || jsonb_build_array(jsonb_build_object(
        'itemCode', v_code,
        'requested', v_remaining,
        'deducted', v_to_deduct,
        'shortage', 0,
        'stockDeficit', v_stock_deficit
      ));
    END IF;
    IF v_to_deduct = 0 THEN
      CONTINUE;
    END IF;

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
      'Pemakaian resep tindakan ' || v_treatment.service_name_snapshot,
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

  UPDATE public.inventory_treatment_consumptions
  SET shortage_details = v_shortages
  WHERE treatment_job_id = v_treatment.id;

  RETURN jsonb_build_object(
    'alreadyRecorded', false,
    'movements', v_movements,
    'shortages', v_shortages
  );
END;
$$;
