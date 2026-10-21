BEGIN;

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

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_doctor_chat_message ON public.group_chat_messages;
CREATE TRIGGER broadcast_doctor_chat_message
AFTER INSERT OR UPDATE OR DELETE ON public.group_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_doctor_chat_message();

REVOKE ALL ON FUNCTION public.broadcast_doctor_chat_message() FROM PUBLIC, anon, authenticated;

COMMIT;
