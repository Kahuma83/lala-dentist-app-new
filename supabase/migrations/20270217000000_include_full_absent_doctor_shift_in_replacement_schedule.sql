DO $$
DECLARE
  v_definition TEXT;
  v_updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.review_doctor_absence_request(uuid,boolean,text,uuid,uuid)'::regprocedure
  ) INTO v_definition;

  v_updated_definition := regexp_replace(
    v_definition,
    $pattern$SELECT DISTINCT ON \(ds\.date\)$pattern$,
    'SELECT'
  );
  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'Tidak menemukan pemilihan satu jadwal harian pada fungsi review dokter.';
  END IF;

  v_definition := v_updated_definition;
  v_updated_definition := regexp_replace(
    v_definition,
    $pattern$ds\.start_time,[[:space:]]+ds\.end_time$pattern$,
    $replacement$to_char(MIN(ds.start_time::TIME), 'HH24:MI') AS start_time,
      to_char(MAX(ds.end_time::TIME), 'HH24:MI') AS end_time$replacement$
  );
  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'Tidak menemukan kolom jam jadwal pada fungsi review dokter.';
  END IF;

  v_definition := v_updated_definition;
  v_updated_definition := regexp_replace(
    v_definition,
    $pattern$ORDER BY ds\.date,[[:space:]]*ds\.start_time$pattern$,
    'GROUP BY ds.date, ds.branch_id' || E'\n' ||
      '    ORDER BY ds.date, ds.branch_id'
  );
  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'Tidak menemukan pengurutan jadwal pada fungsi review dokter.';
  END IF;

  EXECUTE v_updated_definition;
END;
$$;
