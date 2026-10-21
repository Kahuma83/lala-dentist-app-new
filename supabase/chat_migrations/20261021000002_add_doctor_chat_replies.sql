BEGIN;

ALTER TABLE public.group_chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID
  REFERENCES public.group_chat_messages(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_chat_messages_reply_to
  ON public.group_chat_messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

COMMIT;
