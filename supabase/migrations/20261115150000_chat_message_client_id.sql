-- A message written offline is replayed when the connection returns (#1033).
--
-- The client mints the line's identity before it ever reaches the server, so a
-- retry is the same message instead of a second one: `client_id` is a v7 UUID
-- the writer made, and the partial unique index below is what turns a replay
-- into a read of the row the first attempt wrote — attachments included, since
-- those rows already point at it (ADR-0033's write contract, the shape every
-- local-store product uses).
--
-- `id` stays the server's row identity: nothing here lets a client name it.
--
-- Additive and reversible:
--   drop index public.chat_messages_sender_client_idx;
--   alter table public.chat_messages drop column client_id;
-- A null `client_id` is every message written before today, and the assistant's
-- and system lines keep writing null forever.

alter table public.chat_messages
  add column if not exists client_id uuid;

-- Partial on purpose: a null `client_id` is "the server named this one", and two
-- of those must never collide.
create unique index if not exists chat_messages_sender_client_idx
  on public.chat_messages (sender_id, client_id)
  where client_id is not null;

-- A message keeps its identity, and the writer's id for it is part of that: a
-- replay and an edit may not rewrite `client_id` any more than `sender_id`.
create or replace function private.guard_chat_message_columns()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if new.conversation_id <> old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.sender_kind <> old.sender_kind
     or new.created_at <> old.created_at
     or new.reply_to_id is distinct from old.reply_to_id
     or new.client_id is distinct from old.client_id then
    raise exception 'a message keeps its identity' using errcode = '42501';
  end if;

  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;

  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'a deleted message stays deleted' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_chat_message_columns() from public, anon, authenticated;
