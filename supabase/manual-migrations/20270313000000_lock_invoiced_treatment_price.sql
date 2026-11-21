CREATE OR REPLACE FUNCTION public.prevent_lab_invoiced_treatment_price_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.invoice_items AS item
    JOIN public.invoices AS invoice ON invoice.id = item.invoice_id
    WHERE item.treatment_job_id = OLD.id
      AND invoice.status <> 'CANCELLED'
      AND item.unit_price_snapshot IS DISTINCT FROM NEW.price_snapshot
  ) THEN
    RAISE EXCEPTION 'Harga final tidak boleh berbeda dari invoice aktif. Koreksi invoice terlebih dahulu.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_lab_invoiced_treatment_price_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_lab_invoiced_treatment_price_change() TO authenticated, service_role;

DROP TRIGGER IF EXISTS treatment_jobs_prevent_invoiced_price_change ON public.treatment_jobs;
CREATE TRIGGER treatment_jobs_prevent_invoiced_price_change
  BEFORE UPDATE OF price_snapshot ON public.treatment_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_lab_invoiced_treatment_price_change();
