ALTER TABLE public.queue_items
  ADD COLUMN IF NOT EXISTS preferred_service_at TIMESTAMPTZ;
