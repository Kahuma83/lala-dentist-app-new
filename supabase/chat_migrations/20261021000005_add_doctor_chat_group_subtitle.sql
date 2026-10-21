BEGIN;

ALTER TABLE public.chat_groups
  ADD COLUMN IF NOT EXISTS subtitle TEXT NOT NULL
  DEFAULT 'Percakapan bersama dokter · pesan diterima langsung'
  CHECK (char_length(subtitle) <= 120);

CREATE OR REPLACE FUNCTION public.broadcast_doctor_chat_group_subtitle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.subtitle IS NOT DISTINCT FROM NEW.subtitle THEN
    RETURN NEW;
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

DROP TRIGGER IF EXISTS broadcast_doctor_chat_group_subtitle ON public.chat_groups;
CREATE TRIGGER broadcast_doctor_chat_group_subtitle
AFTER UPDATE OF subtitle ON public.chat_groups
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_doctor_chat_group_subtitle();

REVOKE ALL ON FUNCTION public.broadcast_doctor_chat_group_subtitle() FROM PUBLIC, anon, authenticated;

COMMIT;
