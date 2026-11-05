BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE status <> 'CANCELLED'
    GROUP BY visit_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Tidak dapat memasang batas invoice: terdapat kunjungan dengan lebih dari satu invoice aktif. Periksa dan koreksi duplikasi invoice sebelum mengulang migration.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_one_active_per_visit
  ON public.invoices(visit_id)
  WHERE status <> 'CANCELLED';

COMMIT;
