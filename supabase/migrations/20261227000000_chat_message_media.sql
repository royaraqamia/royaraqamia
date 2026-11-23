-- ============================================================
-- A message may carry media a member paid for through a connected app (#1775)
--
-- The bytes are fetched by the server with the member's own encrypted connector
-- token and stored in the chat-attachments bucket. This column holds only the
-- render descriptor — a same-origin route to those bytes, the kind and the MIME
-- type — so a thread reopened tomorrow draws the same picture or clip and the
-- vendor's token and link never reach the browser (ADR-0216).
--
-- Nullable and unindexed on purpose, like visual_svg: only the assistant's rows
-- carry it, and it is not exposed to a wider reader than the message it belongs
-- to. A failure stores no descriptor: the Arabic sentence stays in the body.
--
-- Rollback:
--   alter table public.chat_messages drop column if exists media;
-- ============================================================

alter table public.chat_messages
  add column if not exists media jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_media_object'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_media_object
      check (media is null or jsonb_typeof(media) = 'object');
  end if;
end;
$$;
