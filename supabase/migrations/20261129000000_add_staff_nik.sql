ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS nik VARCHAR(16);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_nik_format_check'
      AND conrelid = 'public.staff'::regclass
  ) THEN
    ALTER TABLE public.staff
      ADD CONSTRAINT staff_nik_format_check
      CHECK (nik IS NULL OR nik ~ '^[0-9]{16}$');
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS staff_nik_unique_idx
  ON public.staff (nik)
  WHERE nik IS NOT NULL;
