-- ============================================================
-- The list can say "waiting for you" without a turn in flight
--
-- A proposal is a write the member must confirm, and it outlives the stream
-- that produced it: they can close the panel, reload, or come back tomorrow.
-- Until now the chats tab could only learn about it from a turn the browser
-- still remembered, so a reload forgot a decision that was still waiting.
--
-- `list_chat_threads` now carries `open_actions`, the count of `proposed` rows
-- in the conversation. It is a count rather than a flag because a turn may
-- propose more than one write, and the row draws the same line for one or many.
--
-- The function stays `security invoker`: the action table's own select policy
-- decides which proposals the caller may count (ADR-0173).
--
-- `create or replace` cannot do this: adding an OUT column changes the row type,
-- and Postgres refuses that with 42P13 rather than silently redefining the
-- contract. The function is therefore dropped and recreated. Nothing else in
-- the database depends on it — the repository reaches it through the Data API's
-- RPC grant, which is restored at the end of this file — and it has not been
-- applied anywhere, so the drop costs no history.
--
-- Rollback:
--   drop function if exists public.list_chat_threads();
--   re-run the `create or replace` from
--     20261113240000_chat_list_pins_agent_first.sql;
--   drop index if exists public.idx_chat_agent_actions_open;
-- ============================================================

-- The count is per conversation and only ever reads `proposed` rows: a partial
-- index keeps it from scanning every resolved action in a long-lived thread.
create index if not exists idx_chat_agent_actions_open
  on public.chat_agent_actions (conversation_id)
  where status = 'proposed';

drop function if exists public.list_chat_threads();

create function public.list_chat_threads()
returns table (
  id uuid,
  kind text,
  title text,
  status text,
  created_at timestamptz,
  last_message_at timestamptz,
  unread_count integer,
  open_actions integer,
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
    coalesce((
      select count(*)::integer
        from public.chat_agent_actions a
       where a.conversation_id = c.id
         and a.status = 'proposed'
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
 order by (c.kind = 'agent') desc, c.last_message_at desc nulls last, c.created_at desc;
$$;

revoke all on function public.list_chat_threads() from public, anon;
grant execute on function public.list_chat_threads() to authenticated;
