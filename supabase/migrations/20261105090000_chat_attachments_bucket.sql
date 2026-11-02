-- ============================================================
-- Chat attachments: a private bucket, guarded by the same membership (ADR-0113)
--
-- `20261103090000_chats.sql` put the attachment table and its caps in place but
-- no bucket, no upload and no download. This adds the storage half:
--
--   * `chat-attachments` is private, caps a file at 25 MB and allows any type —
--     "attach any file" is the product decision, so the bucket is not an
--     allowlist. The type rule lives one layer out, in what is rendered:
--     `chatAttachmentIsInlineImage` in `shared/contracts/chat.ts`.
--   * Object paths are `{conversationId}/{uuid}/{fileName}`, so the first folder
--     is the thread and a policy can read it without asking the table.
--   * Every storage policy asks the same question the table's policies ask:
--     `private.chat_is_participant(<first folder>, auth.uid())`. A path outside a
--     thread the caller belongs to is refused, so a guessed object name is not a
--     read.
--   * The table's `storage_path` is checked against its message's conversation,
--     because the signed URL is minted by the caller's own session: without the
--     check a member could name another thread's object and let the storage
--     policy decide, which is a rule in one place instead of two.
--   * A tombstone deletes its rows, and the rows are deletable by their uploader
--     (a delete policy and a grant, which #811 left out).
--
-- Rollback:
--   drop policy if exists "Members read chat attachments" on storage.objects;
--   drop policy if exists "Members upload chat attachments" on storage.objects;
--   drop policy if exists "Uploaders delete chat attachments" on storage.objects;
--   drop policy if exists "Uploaders delete their attachment rows" on public.chat_attachments;
--   revoke delete on public.chat_attachments from authenticated;
--   drop function if exists private.guard_chat_attachment_path();
--   drop function if exists private.chat_attachment_conversation(text);
--   delete from storage.buckets where id = 'chat-attachments';
-- ============================================================

-- ------------------------------------------------------------
-- The bucket
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  26214400, -- 25 MB, the same number the table's check enforces
  null      -- any file type: the product decision, not an oversight
)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Reading the conversation out of an object name
-- ------------------------------------------------------------

-- `{conversationId}/…/{fileName}` -> that uuid, or null when the first folder is
-- not one. A null reaches `chat_is_participant` as "no thread", which is false,
-- so a malformed path can never grant a read.
create or replace function private.chat_attachment_conversation(p_object_name text)
returns uuid
language sql
immutable
set search_path = 'storage, public'
as $$
  select case
           when (storage.foldername(p_object_name))[1]
                ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then (storage.foldername(p_object_name))[1]::uuid
         end;
$$;

revoke all on function private.chat_attachment_conversation(text)
  from public, anon, authenticated;
grant execute on function private.chat_attachment_conversation(text) to authenticated;

-- ------------------------------------------------------------
-- Storage policies
-- ------------------------------------------------------------

drop policy if exists "Members read chat attachments" on storage.objects;
create policy "Members read chat attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and private.chat_is_participant(
      private.chat_attachment_conversation(name),
      (select auth.uid())
    )
  );

-- The uploader's own folder is the thread's, so membership is the whole rule:
-- the table's insert policy is what ties the object to a message the caller
-- wrote, and the path guard below refuses a name that points elsewhere.
drop policy if exists "Members upload chat attachments" on storage.objects;
create policy "Members upload chat attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and private.chat_is_participant(
      private.chat_attachment_conversation(name),
      (select auth.uid())
    )
  );

-- A tombstone removes its objects. The rule is the same one that guards the
-- read: a member of the thread acts inside it, and nobody outside it does. The
-- rows are the stricter half — only their uploader may delete those.
drop policy if exists "Uploaders delete chat attachments" on storage.objects;
create policy "Uploaders delete chat attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and private.chat_is_participant(
      private.chat_attachment_conversation(name),
      (select auth.uid())
    )
  );

-- ------------------------------------------------------------
-- The row's path names its own conversation
-- ------------------------------------------------------------

create or replace function private.guard_chat_attachment_path()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_conversation uuid;
  v_segments     text[];
begin
  select m.conversation_id
    into v_conversation
    from public.chat_messages m
   where m.id = new.message_id;

  if v_conversation is null then
    raise exception 'the attachment names no message' using errcode = '42501';
  end if;

  v_segments := string_to_array(new.storage_path, '/');

  -- exactly `{conversationId}/{uuid}/{fileName}`: three segments, the first the
  -- message's thread, the other two non-empty. A flat folder per thread also
  -- means a fileName carrying a slash is refused rather than silently nested.
  if array_length(v_segments, 1) <> 3
     or v_segments[1] is distinct from v_conversation::text
     or coalesce(v_segments[2], '') = ''
     or coalesce(v_segments[3], '') = '' then
    raise exception 'an attachment lives in its conversation folder' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_chat_attachment_path() from public, anon, authenticated;

create or replace trigger trg_chat_attachment_path
  before insert on public.chat_attachments
  for each row execute function private.guard_chat_attachment_path();

-- ------------------------------------------------------------
-- A message may be its files alone
-- ------------------------------------------------------------

-- 20261103090000_chats.sql checked "a body, or a tombstone", which also forbade
-- the attachment-only message the contract already allows — files with no words.
-- A column check cannot see `chat_attachments` (they are written after the
-- message), so the rule lives where it can be checked: `ChatMessageSendSchema`'s
-- refinement and `ChatService.sendMessage`'s "text or a file, never neither".
do $$
declare
  v_constraint text;
begin
  select conname
    into v_constraint
    from pg_constraint
   where conrelid = 'public.chat_messages'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%body IS NOT NULL%';

  if v_constraint is not null then
    execute format('alter table public.chat_messages drop constraint %I', v_constraint);
  end if;
end;
$$;

-- ------------------------------------------------------------
-- A tombstone can delete its own rows
-- ------------------------------------------------------------

drop policy if exists "Uploaders delete their attachment rows" on public.chat_attachments;
create policy "Uploaders delete their attachment rows"
  on public.chat_attachments for delete
  to authenticated
  using ( uploader_id = (select auth.uid()) );

grant delete on public.chat_attachments to authenticated;

-- ------------------------------------------------------------
-- What the composer shows against the 1 GB cap
-- ------------------------------------------------------------

-- The quota trigger sums every row the uploader has, including rows in threads
-- they have since left; a read of the table cannot, because those rows are no
-- longer readable. This answers the same question as the trigger, for one
-- member — the caller — and nobody else.
create or replace function public.chat_attachment_bytes_used()
returns bigint
language sql
stable
security definer
set search_path = 'public'
as $$
  select coalesce(sum(a.byte_size), 0)::bigint
    from public.chat_attachments a
   where a.uploader_id = (select auth.uid());
$$;

revoke all on function public.chat_attachment_bytes_used() from public, anon;
grant execute on function public.chat_attachment_bytes_used() to authenticated;
