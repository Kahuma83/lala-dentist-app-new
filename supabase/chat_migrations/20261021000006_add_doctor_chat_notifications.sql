BEGIN;

CREATE TABLE IF NOT EXISTS public.doctor_chat_read_receipts (
  group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  clinic_user_id UUID NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, clinic_user_id)
);

CREATE TABLE IF NOT EXISTS public.doctor_chat_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  clinic_user_id UUID NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT doctor_chat_push_endpoint_https CHECK (endpoint LIKE 'https://%')
);

CREATE INDEX IF NOT EXISTS idx_doctor_chat_push_subscriptions_group_user
  ON public.doctor_chat_push_subscriptions(group_id, clinic_user_id);

ALTER TABLE public.doctor_chat_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_chat_push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.doctor_chat_read_receipts, public.doctor_chat_push_subscriptions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.doctor_chat_read_receipts, public.doctor_chat_push_subscriptions TO service_role;

COMMIT;
