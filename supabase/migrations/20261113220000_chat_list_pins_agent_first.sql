-- ============================================================
-- The assistant is the first row of the list, always
--
-- The tab is where a member meets the product, and the assistant is what the
-- product is sold on. Leaving it to `last_message_at` buried it under every
-- conversation that happened to be newer, so the entry that answers questions
-- was the one a member had to scroll for.
--
-- The pin is order, not rank: `list_chat_threads` sorts the agent conversation
-- before everything else and then keeps the existing last-message order. No
-- column, no flag, no state to keep in step — `kind = 'agent'` is already the
-- fact, and a member has at most one such thread (ADR-0113).
--
-- The client repeats the rule in `chats-panel.tsx`, so a device holding a list
-- read from before this migration still draws the assistant first.
--
-- Rollback: re-run the `create or replace` from `20261103090000_chats.sql`.
-- ============================================================

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
 order by (c.kind = 'agent') desc, c.last_message_at desc nulls last, c.created_at desc;
$$;

revoke all on function public.list_chat_threads() from public, anon;
grant execute on function public.list_chat_threads() to authenticated;
