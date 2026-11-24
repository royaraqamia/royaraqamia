-- ============================================================
-- The chats list is one page, and the badge is one aggregate
--
-- `list_chat_threads()` returned every conversation a member ever had, with
-- four correlated subqueries per row. The bell read the whole list only to sum
-- a badge, and an open panel re-read it every 30 seconds to keep a presence dot
-- honest (#1803). Both pays were unbounded, so the read grew with history even
-- though the surface shows a page.
--
-- Two changes here:
--
--   1. `chat_unread_count()` is the badge's own read: one sum over the member's
--      participant rows, with no last-line, attachment or counterpart work.
--   2. `list_chat_threads(limit, before, before_id)` is a keyset page. The
--      assistant row is pinned first (20261113240000), so it is returned only
--      on the first page; the cursor is the rest of the order,
--      `(last_message_at, id)` descending with no-message rows last. A
--      `coalesce` to `-infinity` makes the null tail reachable by the same
--      predicate that pages the rest. The limit is clamped to 1..2000: an API
--      caller is capped at 100 by the controller, while an internal thread-open
--      lookup may scan further than one panel page. Either way a caller cannot
--      turn this back into an unbounded read.
--
-- Both functions stay `security invoker`: RLS on the three tables still decides
-- which rows exist for the caller, and the Data API reaches them through the
-- grants at the end of this file.
--
-- `create or replace` cannot change the list's signature (or add an OUT
-- column), so the old zero-argument function is dropped rather than left
-- callable alongside the bounded one.
--
-- Rollback:
--   drop function if exists public.chat_unread_count();
--   drop function if exists public.list_chat_threads(integer, timestamptz, uuid);
--   re-run the `create function public.list_chat_threads()` body from
--     20261127120000_chat_list_open_actions.sql;
--   grant execute on function public.list_chat_threads() to authenticated;
-- ============================================================

-- The badge: one number, not one row per conversation with the list's extras.
create or replace function public.chat_unread_count()
returns integer
language sql
stable
security invoker
set search_path = 'public'
as $$
  select coalesce(sum(per_thread), 0)::integer
  from (
    select coalesce((
      select count(*)::integer
        from public.chat_messages m
       where m.conversation_id = me.conversation_id
         and m.deleted_at is null
         and m.sender_id is distinct from me.user_id
         and (me.last_read_at is null or m.created_at > me.last_read_at)
    ), 0) as per_thread
    from public.chat_participants me
   where me.user_id = (select auth.uid())
     and me.status in ('requested', 'invited', 'active', 'declined')
  ) unread;
$$;

revoke all on function public.chat_unread_count() from public, anon;
grant execute on function public.chat_unread_count() to authenticated;

-- The old signature is revoked before the drop, so a caller holding a stale
-- grant cannot keep invoking the unbounded form during a partial deploy.
revoke all on function public.list_chat_threads() from public, anon;
drop function if exists public.list_chat_threads();

create function public.list_chat_threads(
  p_limit integer default 50,
  p_before timestamptz default null,
  p_before_id uuid default null
)
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
    and (
      p_before is null
      or (
        c.kind <> 'agent'
        and (coalesce(c.last_message_at, '-infinity'::timestamptz), c.id)
            < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
    )
  order by (c.kind = 'agent') desc,
           coalesce(c.last_message_at, '-infinity'::timestamptz) desc,
           c.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 2000);
$$;

revoke all on function public.list_chat_threads(integer, timestamptz, uuid) from public, anon;
grant execute on function public.list_chat_threads(integer, timestamptz, uuid) to authenticated;
