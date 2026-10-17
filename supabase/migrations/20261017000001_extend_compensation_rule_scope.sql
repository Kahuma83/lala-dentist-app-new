ALTER TABLE public.staff_compensation_rules
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.master_services(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.dental_branches(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS effective_start_date DATE,
  ADD COLUMN IF NOT EXISTS effective_end_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_compensation_rules_effective_date_check'
      AND conrelid = 'public.staff_compensation_rules'::regclass
  ) THEN
    ALTER TABLE public.staff_compensation_rules
      ADD CONSTRAINT staff_compensation_rules_effective_date_check
      CHECK (effective_end_date IS NULL OR effective_start_date IS NULL OR effective_end_date >= effective_start_date);
  END IF;
END;
$$;
