BEGIN;

CREATE OR REPLACE FUNCTION public.broadcast_doctor_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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
AFTER INSERT ON public.group_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_doctor_chat_message();

REVOKE ALL ON FUNCTION public.broadcast_doctor_chat_message() FROM PUBLIC, anon, authenticated;

COMMIT;
