BEGIN;

ALTER TABLE public.group_chat_messages
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_chat_messages_one_pin_per_group
  ON public.group_chat_messages(group_id)
  WHERE pinned_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_pinned_doctor_chat_message(
  p_group_id UUID,
  p_message_id UUID,
  p_expected_message_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_pinned_id UUID;
BEGIN
  PERFORM 1
  FROM public.chat_groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat group not found';
  END IF;

  SELECT id
  INTO current_pinned_id
  FROM public.group_chat_messages
  WHERE group_id = p_group_id
    AND pinned_at IS NOT NULL
  LIMIT 1
  FOR UPDATE;

  IF p_message_id IS NULL THEN
    IF current_pinned_id IS DISTINCT FROM p_expected_message_id THEN
      RAISE EXCEPTION 'Pinned message has changed';
    END IF;

    UPDATE public.group_chat_messages
    SET pinned_at = NULL
    WHERE id = current_pinned_id;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_chat_messages
    WHERE id = p_message_id
      AND group_id = p_group_id
  ) THEN
    RAISE EXCEPTION 'Message does not belong to chat group';
  END IF;

  UPDATE public.group_chat_messages
  SET pinned_at = NULL
  WHERE group_id = p_group_id
    AND pinned_at IS NOT NULL;

  UPDATE public.group_chat_messages
  SET pinned_at = now()
  WHERE id = p_message_id
    AND group_id = p_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_pinned_doctor_chat_message(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_pinned_doctor_chat_message(UUID, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.broadcast_doctor_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.pinned_at IS NOT DISTINCT FROM NEW.pinned_at THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object('refresh', true),
    'new_message',
    'doctor-group-chat',
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_doctor_chat_message ON public.group_chat_messages;
CREATE TRIGGER broadcast_doctor_chat_message
AFTER INSERT OR UPDATE OF pinned_at ON public.group_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_doctor_chat_message();

COMMIT;
