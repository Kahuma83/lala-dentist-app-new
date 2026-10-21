BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.group_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE RESTRICT,
  sender_clinic_user_id UUID NOT NULL,
  sender_name_snapshot TEXT NOT NULL,
  message_text TEXT NOT NULL DEFAULT '' CHECK (char_length(message_text) <= 5000),
  attachment_path TEXT,
  attachment_file_name TEXT,
  attachment_content_type TEXT,
  attachment_size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT group_chat_message_has_content CHECK (
    char_length(btrim(message_text)) > 0 OR attachment_path IS NOT NULL
  ),
  CONSTRAINT group_chat_attachment_metadata_complete CHECK (
    (attachment_path IS NULL AND attachment_file_name IS NULL AND attachment_content_type IS NULL AND attachment_size_bytes IS NULL)
    OR
    (attachment_path IS NOT NULL AND attachment_file_name IS NOT NULL AND attachment_content_type IS NOT NULL AND attachment_size_bytes > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_group_chat_messages_recent
  ON public.group_chat_messages(group_id, created_at DESC, id DESC);

ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chat_groups, public.group_chat_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chat_groups, public.group_chat_messages TO service_role;

INSERT INTO public.chat_groups (slug, name)
VALUES ('all-doctors', 'Grup Dokter Lala Dentist')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'doctor-group-chat-files',
  'doctor-group-chat-files',
  FALSE,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
