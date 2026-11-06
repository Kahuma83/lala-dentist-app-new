DO $$
DECLARE
  v_definition TEXT;
  v_updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.review_doctor_absence_request(uuid,boolean,text,uuid,uuid)'::regprocedure
  ) INTO v_definition;

  v_updated_definition := replace(
    v_definition,
    'RAISE EXCEPTION ''Dokter internal tersedia pada rentang ini; pengganti eksternal hanya dapat dipilih jika tidak ada dokter internal yang tersedia.'';',
    'IF v_request.admin_external_doctor_id IS DISTINCT FROM p_external_doctor_id THEN' || E'\n' ||
      '      RAISE EXCEPTION ''Dokter internal tersedia pada rentang ini; pilihan dokter eksternal harus ditetapkan secara eksplisit oleh Super Admin.'';' || E'\n' ||
      '    END IF;'
  );

  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'Tidak menemukan validasi ketersediaan dokter internal pada fungsi review dokter.';
  END IF;

  EXECUTE v_updated_definition;
END;
$$;
