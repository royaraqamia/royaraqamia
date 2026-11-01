-- ============================================================
-- Chats: conversations, participants, messages, attachments, blocks, reports
-- (ADR-0113)
--
-- One membership model covers all three kinds of conversation:
--
--   direct — request-first. The creator is `active`, the other side is
--            `requested` until they answer, and a unique `direct_key` means two
--            people cannot accumulate parallel threads.
--   group  — the creator is `owner`/`active`; an added member is `invited`
--            until they accept (the same consent a DM request asks for).
--   agent  — the assistant's thread. One participant row (the owner); the
--            assistant speaks through `sender_kind = 'agent'`, so the client
--            draws one list and one thread component, never a second surface.
--
-- `chat_conversations.status` is derived, never written by a client: the
-- participants trigger moves it to `active` when the invited side accepts and
-- to `declined` when they refuse. That is why there is no UPDATE grant on it.
--
-- Reads are RLS-scoped through SECURITY DEFINER helpers in `private` — a policy
-- that queried `chat_participants` from inside `chat_participants` would
-- recurse. No service-role read path exists for messages: ADR-0113 makes staff
-- unable to read a live thread, and the one exception is a `chat_reports`
-- snapshot frozen at the moment of reporting.
--
-- Unread is `participants.last_read_at`, not a per-message receipt row: the
-- list needs "is anything newer than my watermark", and a receipt row per
-- message per member is the wrong shape for a group of 32.
--
-- Additive: six tables, helpers, five triggers, the storage quota and the
-- publication. Every statement re-runs harmlessly.
--
-- Rollback:
--   drop function if exists public.list_chat_threads();
--   drop function if exists public.report_chat_conversation(uuid, text, uuid);
--   drop function if exists private.chat_thread_snapshot(uuid);
--   drop function if exists private.enforce_chat_attachment_quota();
--   drop function if exists private.guard_chat_message_columns();
--   drop function if exists private.chat_direct_key(uuid);
--   drop function if exists private.chat_conversation_status();
--   drop function if exists private.chat_has_conversation_access(uuid, uuid);
--   drop function if exists private.chat_is_participant(uuid, uuid);
--   drop function if exists private.chat_can_write(uuid, uuid);
--   drop table if exists public.chat_reports;
--   drop table if exists public.chat_blocks;
--   drop table if exists public.chat_attachments;
--   drop table if exists public.chat_messages;
--   drop table if exists public.chat_participants;
--   drop table if exists public.chat_conversations;
-- ============================================================

-- ------------------------------------------------------------
-- Conversations
-- ------------------------------------------------------------

create table if not exists public.chat_conversations (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null default 'direct'
                    check (kind in ('direct', 'group', 'agent')),
  -- Group name. Null for direct and agent threads, which are named after the
  -- other side or the assistant.
  title           text check (title is null or char_length(title) between 1 and 80),
  created_by      uuid not null references public.users (id) on delete cascade,
  status          text not null default 'requested'
                    check (status in ('requested', 'active', 'declined', 'archived')),
  -- Sorted member ids, written by the participants trigger; the unique index
  -- is what stops a second direct thread between the same two people.
  direct_key      text,
  accepted_at     timestamptz,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (kind <> 'group' or title is not null)
);

create unique index if not exists chat_direct_key_idx
  on public.chat_conversations (direct_key)
  where direct_key is not null;

create index if not exists idx_chat_conversations_last_message
  on public.chat_conversations (last_message_at desc nulls last, created_at desc);

-- ------------------------------------------------------------
-- Participants
-- ------------------------------------------------------------

create table if not exists public.chat_participants (
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  role            text not null default 'member' check (role in ('owner', 'member')),
  -- requested → the DM partner has not answered yet.
  -- invited   → a group you were added to has not been accepted yet.
  -- active    → in the thread. left/declined are terminal.
  status          text not null default 'active'
                    check (status in ('requested', 'invited', 'active', 'declined', 'left')),
  invited_by      uuid references public.users (id) on delete set null,
  last_read_at    timestamptz,
  joined_at       timestamptz,
  created_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- The chat list and the unread badge both open with "my threads".
create index if not exists idx_chat_participants_user
  on public.chat_participants (user_id, conversation_id)
  where status in ('active', 'requested', 'invited');

-- A direct thread's key is written as its member rows arrive, so the unique
-- index above can refuse the second one.
create or replace function private.chat_direct_key(p_conversation_id uuid)
returns text
language sql
stable
security definer
set search_path = 'public'
as $$
  select string_agg(p.user_id::text, '|' order by p.user_id::text)
    from public.chat_participants p
   where p.conversation_id = p_conversation_id
     and p.status in ('requested', 'invited', 'active');
$$;

revoke all on function private.chat_direct_key(uuid) from public, anon, authenticated;

-- The conversation follows its members:
--
--   direct — open only once the requested side answers (a threading that opens
--            before consent would deliver a stranger's messages).
--   group / agent — open as soon as the creator is in it; an invited member
--            reads nothing until they accept, because reads need `active`.
create or replace function private.chat_conversation_status()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_conversation uuid := coalesce(new.conversation_id, old.conversation_id);
  v_kind         text;
  v_key          text;
  v_active       integer;
  v_pending      integer;
  v_declined     integer;
  v_next         text;
begin
  select c.kind into v_kind
    from public.chat_conversations c
   where c.id = v_conversation;

  select count(*) filter (where status = 'active'),
         count(*) filter (where status in ('requested', 'invited')),
         count(*) filter (where status = 'declined')
    into v_active, v_pending, v_declined
    from public.chat_participants
   where conversation_id = v_conversation;

  if v_kind = 'direct' then
    v_key := private.chat_direct_key(v_conversation);
    update public.chat_conversations
       set direct_key = v_key
     where id = v_conversation
       and direct_key is distinct from v_key;

    -- `active` needs the requested side to have answered: with a `requested`
    -- row still present the thread stays a request, which is what keeps the
    -- other side's messages unreadable until they accept.
    v_next := case
      when v_declined > 0 then 'declined'
      when v_pending > 0 then 'requested'
      when v_active > 0 then 'active'
      else 'archived'
    end;
  else
    v_next := case
      when v_active > 0 then 'active'
      when v_pending > 0 then 'requested'
      else 'archived'
    end;
  end if;

  update public.chat_conversations
     set status = v_next,
         accepted_at = case when v_next = 'active' then coalesce(accepted_at, now()) else accepted_at end,
         updated_at = now()
   where id = v_conversation
     and status is distinct from v_next;

  return null;
end;
$$;

revoke all on function private.chat_conversation_status() from public, anon, authenticated;

create or replace trigger trg_chat_participants_status
  after insert or update of status or delete on public.chat_participants
  for each row execute function private.chat_conversation_status();

-- ------------------------------------------------------------
-- Messages
-- ------------------------------------------------------------

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  -- Null for the assistant and for system lines; `sender_kind` says which.
  sender_id       uuid references public.users (id) on delete set null,
  sender_kind     text not null default 'user' check (sender_kind in ('user', 'agent', 'system')),
  -- Null is allowed only for a tombstone or an attachment-only message.
  body            text check (body is null or char_length(body) <= 4000),
  reply_to_id     uuid references public.chat_messages (id) on delete set null,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  check (sender_kind <> 'user' or sender_id is not null),
  check (body is not null or deleted_at is not null)
);

-- The thread read pages newest-first on a keyset.
create index if not exists idx_chat_messages_thread
  on public.chat_messages (conversation_id, created_at desc, id desc);

-- The unread count is "rows newer than my watermark".
create index if not exists idx_chat_messages_unread
  on public.chat_messages (conversation_id, created_at)
  where deleted_at is null;

-- A reply preview is one row, never a scan of the thread.
create index if not exists idx_chat_messages_reply
  on public.chat_messages (reply_to_id)
  where reply_to_id is not null;

-- Editing rewrites `body` only. Everything that identifies the message is
-- immutable, `edited_at` is the server's, and a tombstone is final.
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
     or new.reply_to_id is distinct from old.reply_to_id then
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

create or replace trigger trg_chat_messages_columns
  before update on public.chat_messages
  for each row execute function private.guard_chat_message_columns();

-- One trigger keeps the list's ordering key honest; no client writes it.
create or replace function private.chat_touch_last_message()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.deleted_at is null then
    update public.chat_conversations
       set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at),
           updated_at = now()
     where id = new.conversation_id;
  end if;
  return null;
end;
$$;

revoke all on function private.chat_touch_last_message() from public, anon, authenticated;

create or replace trigger trg_chat_messages_last_message
  after insert on public.chat_messages
  for each row execute function private.chat_touch_last_message();

-- ------------------------------------------------------------
-- Attachments
-- ------------------------------------------------------------

create table if not exists public.chat_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.chat_messages (id) on delete cascade,
  uploader_id  uuid not null references public.users (id) on delete cascade,
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) between 1 and 200),
  mime_type    text not null check (char_length(mime_type) between 1 and 120),
  -- 25 MB per file, 1 GB per member: the ADR-0113 caps. A count cap is the
  -- wrong unit here, so the total is summed rather than counted.
  byte_size    bigint not null check (byte_size > 0 and byte_size <= 26214400),
  created_at   timestamptz not null default now()
);

create index if not exists idx_chat_attachments_message
  on public.chat_attachments (message_id);

create index if not exists idx_chat_attachments_uploader
  on public.chat_attachments (uploader_id);

create or replace function private.enforce_chat_attachment_quota()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_used bigint;
begin
  select coalesce(sum(a.byte_size), 0)
    into v_used
    from public.chat_attachments a
   where a.uploader_id = new.uploader_id;

  if v_used + new.byte_size > 1073741824 then
    raise exception 'chat attachment storage is full' using errcode = '53400';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_chat_attachment_quota() from public, anon, authenticated;

create or replace trigger trg_chat_attachments_quota
  before insert on public.chat_attachments
  for each row execute function private.enforce_chat_attachment_quota();

-- ------------------------------------------------------------
-- Blocks and reports
-- ------------------------------------------------------------

create table if not exists public.chat_blocks (
  blocker_id uuid not null references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- A report carries the thread as it read at the moment of reporting, frozen:
-- staff read the snapshot and never the live conversation (ADR-0113).
create table if not exists public.chat_reports (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.chat_conversations (id) on delete cascade,
  reporter_id      uuid not null references public.users (id) on delete cascade,
  reported_user_id uuid references public.users (id) on delete set null,
  reason           text not null check (char_length(reason) between 1 and 500),
  snapshot         jsonb not null,
  status           text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at       timestamptz not null default now()
);

create index if not exists idx_chat_reports_open
  on public.chat_reports (created_at desc)
  where status = 'open';

-- ------------------------------------------------------------
-- Row-visibility helpers
-- ------------------------------------------------------------

-- These read the tables above, so they come after them: a `language sql` body is
-- checked when the function is created, and a migration has to replay on an
-- empty database (a preview branch does exactly that).

-- Anything the caller must still see in the list: a pending request they have
-- to answer, a thread they are in, and a refused direct request (so the sender
-- reads «رُفض» instead of the thread silently vanishing).
create or replace function private.chat_has_conversation_access(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
      from public.chat_participants p
     where p.conversation_id = p_conversation_id
       and p.user_id = p_user_id
       and p.status in ('requested', 'invited', 'active', 'declined')
  );
$$;

-- A member who is in the thread: accepted the invite, still active. Message
-- and attachment reads use this, so a pending request reads no messages.
create or replace function private.chat_is_participant(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
      from public.chat_participants p
      join public.chat_conversations c on c.id = p.conversation_id
     where p.conversation_id = p_conversation_id
       and p.user_id = p_user_id
       and p.status = 'active'
       and c.status = 'active'
  );
$$;

revoke all on function private.chat_has_conversation_access(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.chat_is_participant(uuid, uuid)
  from public, anon, authenticated;

-- Posting needs the membership test *and* no block on either side. The block
-- half has to run here: a policy evaluates `chat_blocks` with the caller's own
-- RLS, so the caller can never see the row in which they are the blocked one,
-- and the check would silently do nothing.
create or replace function private.chat_can_write(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select private.chat_is_participant(p_conversation_id, p_user_id)
     and not exists (
       select 1
         from public.chat_participants peer
         join public.chat_blocks b
           on b.blocker_id = peer.user_id
          and b.blocked_id = p_user_id
        where peer.conversation_id = p_conversation_id
          and peer.user_id <> p_user_id
     );
$$;

revoke all on function private.chat_can_write(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Row level security
-- ------------------------------------------------------------

alter table public.chat_conversations enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_attachments enable row level security;
alter table public.chat_blocks enable row level security;
alter table public.chat_reports enable row level security;

-- Conversations: a member reads their own threads; the creator opens one and
-- nobody updates it (the status is the participants trigger's).
drop policy if exists "Members read their conversations" on public.chat_conversations;
create policy "Members read their conversations"
  on public.chat_conversations for select
  to authenticated
  using ( private.chat_has_conversation_access(id, (select auth.uid())) );

drop policy if exists "Members open a conversation" on public.chat_conversations;
create policy "Members open a conversation"
  on public.chat_conversations for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and status in ('requested', 'active')
    and (kind <> 'group' or title is not null)
  );

-- Participants: you read the roster of your threads; you add members only to a
-- thread you are active in; you may only move your own row (accept, decline,
-- leave) and stamp your own read watermark.
drop policy if exists "Members read the roster" on public.chat_participants;
create policy "Members read the roster"
  on public.chat_participants for select
  to authenticated
  using ( private.chat_has_conversation_access(conversation_id, (select auth.uid())) );

drop policy if exists "Members add a participant" on public.chat_participants;
create policy "Members add a participant"
  on public.chat_participants for insert
  to authenticated
  with check (
    private.chat_is_participant(conversation_id, (select auth.uid()))
    -- You may put yourself in as an active member; anyone else joins as a
    -- request or an invite, never straight into the thread.
    and (user_id = (select auth.uid()) or status in ('requested', 'invited'))
  );

drop policy if exists "A participant answers for themselves" on public.chat_participants;
create policy "A participant answers for themselves"
  on public.chat_participants for update
  to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

drop policy if exists "A participant removes themselves" on public.chat_participants;
create policy "A participant removes themselves"
  on public.chat_participants for delete
  to authenticated
  using ( user_id = (select auth.uid()) );

-- Messages: read inside a thread you are in; write as yourself and only while
-- unblocked; edit your own for fifteen minutes; tombstone your own. No hard
-- delete is granted.
drop policy if exists "Members read their messages" on public.chat_messages;
create policy "Members read their messages"
  on public.chat_messages for select
  to authenticated
  using ( private.chat_is_participant(conversation_id, (select auth.uid())) );

drop policy if exists "Members write their own messages" on public.chat_messages;
create policy "Members write their own messages"
  on public.chat_messages for insert
  to authenticated
  with check (
    sender_kind = 'user'
    and sender_id = (select auth.uid())
    and private.chat_can_write(conversation_id, (select auth.uid()))
  );

drop policy if exists "Members edit their own messages" on public.chat_messages;
create policy "Members edit their own messages"
  on public.chat_messages for update
  to authenticated
  using (
    sender_id = (select auth.uid())
    and created_at > now() - interval '15 minutes'
    and deleted_at is null
  )
  with check ( sender_id = (select auth.uid()) );

-- Attachments belong to a message the caller wrote, and are read with it.
drop policy if exists "Members read attachments" on public.chat_attachments;
create policy "Members read attachments"
  on public.chat_attachments for select
  to authenticated
  using (
    exists (
      select 1
        from public.chat_messages m
       where m.id = message_id
         and private.chat_is_participant(m.conversation_id, (select auth.uid()))
    )
  );

drop policy if exists "Members attach to their own message" on public.chat_attachments;
create policy "Members attach to their own message"
  on public.chat_attachments for insert
  to authenticated
  with check (
    uploader_id = (select auth.uid())
    and exists (
      select 1
        from public.chat_messages m
       where m.id = message_id
         and m.sender_id = (select auth.uid())
         and m.created_at > now() - interval '15 minutes'
         and private.chat_is_participant(m.conversation_id, (select auth.uid()))
    )
  );

-- Blocks: private to the blocker.
drop policy if exists "Blocked lists are private" on public.chat_blocks;
create policy "Blocked lists are private"
  on public.chat_blocks for select
  to authenticated
  using ( blocker_id = (select auth.uid()) );

drop policy if exists "Members block for themselves" on public.chat_blocks;
create policy "Members block for themselves"
  on public.chat_blocks for insert
  to authenticated
  with check ( blocker_id = (select auth.uid()) );

drop policy if exists "Members unblock for themselves" on public.chat_blocks;
create policy "Members unblock for themselves"
  on public.chat_blocks for delete
  to authenticated
  using ( blocker_id = (select auth.uid()) );

-- Reports: the reporter reads their own; staff read every report, and only the
-- snapshot inside it. `private.is_admin()` already decides staff.
drop policy if exists "Reporters read their report" on public.chat_reports;
create policy "Reporters read their report"
  on public.chat_reports for select
  to authenticated
  using ( reporter_id = (select auth.uid()) or private.is_admin() );

drop policy if exists "Reporters file a report" on public.chat_reports;
create policy "Reporters file a report"
  on public.chat_reports for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and private.chat_is_participant(conversation_id, (select auth.uid()))
  );

-- ------------------------------------------------------------
-- Reporting: the snapshot is built here, not supplied by the caller
-- ------------------------------------------------------------

create or replace function private.chat_thread_snapshot(p_conversation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = 'public'
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'senderId', m.sender_id,
        'senderKind', m.sender_kind,
        'body', coalesce(m.body, ''),
        'createdAt', m.created_at,
        'deleted', m.deleted_at is not null
      )
      order by m.created_at
    ),
    '[]'::jsonb
  )
  from (
    select *
      from public.chat_messages
     where conversation_id = p_conversation_id
     order by created_at desc
     limit 50
  ) m;
$$;

revoke all on function private.chat_thread_snapshot(uuid) from public, anon, authenticated;

/**
 * Files a report and freezes the last fifty messages into it. The caller
 * supplies only the reason; the evidence, the reporter and the reported side
 * are resolved here, so a client cannot file an empty or doctored report.
 */
create or replace function public.report_chat_conversation(
  p_conversation_id uuid,
  p_reason text,
  p_reported_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if not private.chat_is_participant(p_conversation_id, v_uid) then
    raise exception 'not a member of this conversation' using errcode = '42501';
  end if;

  if p_reported_user_id is not null and p_reported_user_id = v_uid then
    raise exception 'a report names the other side' using errcode = '22023';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'a report carries a reason' using errcode = '22023';
  end if;

  insert into public.chat_reports (
    conversation_id, reporter_id, reported_user_id, reason, snapshot
  ) values (
    p_conversation_id,
    v_uid,
    p_reported_user_id,
    btrim(p_reason),
    private.chat_thread_snapshot(p_conversation_id)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.report_chat_conversation(uuid, text, uuid) from public, anon;
grant execute on function public.report_chat_conversation(uuid, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- The list read: one round trip per open of the tab
-- ------------------------------------------------------------

/**
 * Every thread the caller can see, with the three facts a list row draws —
 * the last line, its attachments, and how much of it is unread — resolved in
 * the database rather than as one query per thread from the app.
 *
 * `security invoker` on purpose: RLS on the three tables decides the rows, so
 * the function adds a projection, never a bypass.
 */
create or replace function public.list_chat_threads()
returns table (
  id uuid,
  kind text,
  title text,
  status text,
  created_at timestamptz,
  last_message_at timestamptz,
  unread_count integer,
  last_message_body text,
  last_message_sender_kind text,
  last_message_created_at timestamptz,
  last_message_has_attachments boolean,
  counterpart_id uuid,
  my_status text,
  my_role text,
  my_last_read_at timestamptz
)
language sql
stable
security invoker
set search_path = 'public'
as $$
  select
    c.id,
    c.kind,
    c.title,
    c.status,
    c.created_at,
    c.last_message_at,
    coalesce((
      select count(*)::integer
        from public.chat_messages m
       where m.conversation_id = c.id
         and m.deleted_at is null
         and m.sender_id is distinct from me.user_id
         and (me.last_read_at is null or m.created_at > me.last_read_at)
    ), 0),
    last.body,
    last.sender_kind,
    last.created_at,
    exists (select 1 from public.chat_attachments a where a.message_id = last.id),
    other.user_id,
    me.status,
    me.role,
    me.last_read_at
  from public.chat_participants me
  join public.chat_conversations c on c.id = me.conversation_id
  left join lateral (
    select p.user_id
      from public.chat_participants p
     where p.conversation_id = c.id
       and p.user_id <> me.user_id
     order by p.created_at
     limit 1
  ) other on true
  left join lateral (
    select m.id, m.body, m.sender_kind, m.created_at
      from public.chat_messages m
     where m.conversation_id = c.id
       and m.deleted_at is null
     order by m.created_at desc
     limit 1
  ) last on true
 where me.user_id = (select auth.uid())
   and me.status in ('requested', 'invited', 'active', 'declined')
 order by c.last_message_at desc nulls last, c.created_at desc;
$$;

revoke all on function public.list_chat_threads() from public, anon;
grant execute on function public.list_chat_threads() to authenticated;

-- ------------------------------------------------------------
-- Grants (Supabase stopped inheriting them for new public objects)
-- ------------------------------------------------------------

grant select, insert on public.chat_conversations to authenticated;
grant select, insert, update, delete on public.chat_participants to authenticated;
grant select, insert, update on public.chat_messages to authenticated;
grant select, insert on public.chat_attachments to authenticated;
grant select, insert, delete on public.chat_blocks to authenticated;
grant select, insert on public.chat_reports to authenticated;

grant select, insert, update on public.chat_conversations to service_role;
grant select, insert, update, delete on public.chat_participants to service_role;
grant select, insert, update on public.chat_messages to service_role;
grant select, insert, delete on public.chat_attachments to service_role;
grant select, insert, delete on public.chat_blocks to service_role;
grant select, insert, update on public.chat_reports to service_role;

-- ------------------------------------------------------------
-- Realtime: hints only (ADR-0060), published the guarded way
-- ------------------------------------------------------------

do $$
declare
  target text;
  target_has_rls boolean;
begin
  foreach target in array array[
    'chat_conversations',
    'chat_participants',
    'chat_messages'
  ]
  loop
    select c.relrowsecurity
      into target_has_rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = target;

    if target_has_rls is null then
      raise notice 'public.% is not in this database; skipping it', target;
      continue;
    end if;

    if not target_has_rls then
      raise exception
        'Refusing to publish public.% to Realtime: row level security is off',
        target;
    end if;

    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;

comment on table public.chat_conversations is
  'Chat threads (ADR-0113): direct is request-first, groups are by invite, the assistant is a kind.';
comment on table public.chat_messages is
  'Thread messages (ADR-0113): own edits inside 15 minutes, tombstones, never a hard delete.';
comment on table public.chat_reports is
  'Frozen thread snapshots (ADR-0113): staff read the snapshot, never the live thread.';
