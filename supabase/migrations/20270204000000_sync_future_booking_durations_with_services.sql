CREATE OR REPLACE FUNCTION public.sync_future_booking_durations_with_service()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.bookings AS booking
  SET
    planned_treatments = (
      SELECT jsonb_agg(
        CASE
          WHEN treatment.value ->> 'serviceId' = NEW.id::TEXT
            THEN jsonb_set(
              treatment.value,
              '{estimatedDurationMinutes}',
              to_jsonb(NEW.estimated_duration_minutes),
              TRUE
            )
          ELSE treatment.value
        END
        ORDER BY treatment.ordinality
      )
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(booking.planned_treatments) = 'array'
            THEN booking.planned_treatments
          ELSE '[]'::JSONB
        END
      ) WITH ORDINALITY AS treatment(value, ordinality)
    ),
    updated_at = timezone('utc'::TEXT, now())
  WHERE booking.status IN ('PENDING', 'CONFIRMED')
    AND booking.booking_date_time >= now()
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(booking.planned_treatments) = 'array'
            THEN booking.planned_treatments
          ELSE '[]'::JSONB
        END
      ) AS treatment(value)
      WHERE treatment.value ->> 'serviceId' = NEW.id::TEXT
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS master_services_sync_future_booking_durations
  ON public.master_services;

CREATE TRIGGER master_services_sync_future_booking_durations
  AFTER UPDATE OF estimated_duration_minutes
  ON public.master_services
  FOR EACH ROW
  WHEN (OLD.estimated_duration_minutes IS DISTINCT FROM NEW.estimated_duration_minutes)
  EXECUTE FUNCTION public.sync_future_booking_durations_with_service();

UPDATE public.bookings AS booking
SET
  planned_treatments = (
    SELECT jsonb_agg(
      CASE
        WHEN service.id IS NOT NULL
          THEN jsonb_set(
            treatment.value,
            '{estimatedDurationMinutes}',
            to_jsonb(service.estimated_duration_minutes),
            TRUE
          )
        ELSE treatment.value
      END
      ORDER BY treatment.ordinality
    )
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(booking.planned_treatments) = 'array'
          THEN booking.planned_treatments
        ELSE '[]'::JSONB
      END
    ) WITH ORDINALITY AS treatment(value, ordinality)
    LEFT JOIN public.master_services AS service
      ON service.id::TEXT = treatment.value ->> 'serviceId'
  ),
  updated_at = timezone('utc'::TEXT, now())
WHERE booking.status IN ('PENDING', 'CONFIRMED')
  AND booking.booking_date_time >= now()
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(booking.planned_treatments) = 'array'
          THEN booking.planned_treatments
        ELSE '[]'::JSONB
      END
    ) AS treatment(value)
    JOIN public.master_services AS service
      ON service.id::TEXT = treatment.value ->> 'serviceId'
  );
