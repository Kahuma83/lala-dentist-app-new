CREATE OR REPLACE FUNCTION public.booking_planned_duration_minutes(p_planned_treatments JSONB)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT LEAST(
    COALESCE(NULLIF(SUM(
      CASE
        WHEN treatment.value ->> 'estimatedDurationMinutes' ~ '^[0-9]{1,6}$'
          THEN (treatment.value ->> 'estimatedDurationMinutes')::INTEGER
        ELSE 0
      END
    ), 0), 30),
    1440
  )::INTEGER
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(p_planned_treatments) = 'array' THEN p_planned_treatments
      ELSE '[]'::JSONB
    END
  ) AS treatment(value);
$$;
