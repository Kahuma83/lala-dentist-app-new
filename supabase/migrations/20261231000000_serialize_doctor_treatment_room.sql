CREATE OR REPLACE FUNCTION public.prevent_multiple_patients_in_doctor_treatment_room()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  occupied_queue RECORD;
  has_unfinished_treatment BOOLEAN;
  operational_date DATE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('IN_PREPARATION', 'IN_CONSULTATION')
      AND NEW.status IN ('SKIPPED', 'CANCELLED') THEN
      RAISE EXCEPTION 'Pasien yang sudah berada di ruang tindakan tidak dapat dilewati atau dibatalkan dari antrean.'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.status IN ('IN_PREPARATION', 'IN_CONSULTATION')
      OR NEW.status IN ('IN_PREPARATION', 'IN_CONSULTATION') THEN
      PERFORM pg_advisory_xact_lock(
        hashtextextended(NEW.branch_id::TEXT || ':' || NEW.doctor_id::TEXT, 0)
      );
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.status IN ('IN_PREPARATION', 'IN_CONSULTATION') THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(NEW.branch_id::TEXT || ':' || NEW.doctor_id::TEXT, 0)
    );
  END IF;

  IF NEW.status NOT IN ('IN_PREPARATION', 'IN_CONSULTATION') THEN
    RETURN NEW;
  END IF;

  operational_date := (NEW.arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE;
  SELECT queue.id, queue.visit_id, queue.status
  INTO occupied_queue
  FROM public.queue_items queue
  WHERE queue.branch_id = NEW.branch_id
    AND queue.doctor_id = NEW.doctor_id
    AND (queue.arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE = operational_date
    AND queue.status IN ('IN_PREPARATION', 'IN_CONSULTATION')
    AND queue.id IS DISTINCT FROM NEW.id
  ORDER BY queue.actual_service_start_at NULLS FIRST, queue.arrival_at
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.treatment_jobs treatment
    WHERE treatment.visit_id = occupied_queue.visit_id
      AND treatment.status NOT IN ('SELESAI', 'DISERAHKAN')
  )
  INTO has_unfinished_treatment;

  IF has_unfinished_treatment THEN
    RAISE EXCEPTION 'Treatment pasien sebelumnya belum selesai. Selesaikan semua treatment sebelum memanggil pasien berikutnya.'
      USING ERRCODE = '23514';
  END IF;

  IF occupied_queue.status = 'IN_CONSULTATION' THEN
    RAISE EXCEPTION 'Dokter sedang melayani pasien lain dalam konsultasi aktif.'
      USING ERRCODE = '23514';
  END IF;

  RAISE EXCEPTION 'Pasien lain masih berada di ruang tindakan. Selesaikan kunjungan sebelum memanggil pasien berikutnya.'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_multiple_patients_in_doctor_treatment_room() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS queue_items_single_doctor_treatment_room ON public.queue_items;
CREATE TRIGGER queue_items_single_doctor_treatment_room
  BEFORE INSERT OR UPDATE OF status
  ON public.queue_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_multiple_patients_in_doctor_treatment_room();

CREATE OR REPLACE FUNCTION public.prevent_removing_patient_from_treatment_room()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('IN_PREPARATION', 'IN_CONSULTATION') THEN
    RAISE EXCEPTION 'Pasien yang sudah berada di ruang tindakan tidak dapat dihapus dari antrean.'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_removing_patient_from_treatment_room() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS queue_items_prevent_remove_from_treatment_room ON public.queue_items;
CREATE TRIGGER queue_items_prevent_remove_from_treatment_room
  BEFORE DELETE
  ON public.queue_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_removing_patient_from_treatment_room();
