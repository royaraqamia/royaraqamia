-- The direct pair key survives a decline and a withdrawal (#841)
--
-- ADR-0113 point 2 makes a direct thread unique by pair: `direct_key` is the
-- sorted pair of member ids, a unique index backs it, and a second attempt
-- answers with the thread that already exists rather than opening a parallel
-- one. 20261103090000_chats.sql derived that key from the roster rows that were
-- still open (`requested`, `invited`, `active`), so the first terminal status
-- collapsed it: a decline left the requester's id alone, and a withdrawal (both
-- rows `left`) left null. The unique index then protected nothing, the pair
-- lookup answered "no thread", and `startDirect` and `preview` opened a second
-- conversation instead of asking again on the old one.
--
-- The key is now the pair whatever the two rows' statuses are, and null unless
-- exactly two rows exist. The two-row guard is load-bearing in both directions:
-- `startDirect` writes the caller's row first, and a one-id key at that moment
-- would collide with another in-flight direct thread; a thread that has lost a
-- roster row stays out of the unique index instead of blocking its pair forever.
--
-- Backfill: every `kind = 'direct'` conversation is re-keyed from the new
-- definition, idempotently. A pair the old collapse let through twice is left
-- untouched rather than failing the migration — the unique index cannot hold
-- both, and merging or deleting the duplicate threads is a non-goal here. The
-- ids (and their pair) are named in a `raise notice` when this migration runs;
-- to list them again:
--
--   select c.id, private.chat_direct_key(c.id) as pair
--     from public.chat_conversations c
--    where c.kind = 'direct'
--      and private.chat_direct_key(c.id) is not null
--      and exists (
--        select 1
--          from public.chat_conversations o
--         where o.id <> c.id
--           and (
--             private.chat_direct_key(o.id) = private.chat_direct_key(c.id)
--             or o.direct_key = private.chat_direct_key(c.id)
--           )
--      );
--
-- Rollback: restore the definition from 20261103090000_chats.sql, then re-run
-- the backfill below with it.

-- ------------------------------------------------------------
-- The key is the pair, at every status
-- ------------------------------------------------------------

create or replace function private.chat_direct_key(p_conversation_id uuid)
returns text
language sql
stable
security definer
set search_path = 'public'
as $$
  select case
           when count(*) = 2 then
             string_agg(p.user_id::text, '|' order by p.user_id::text)
           else null
         end
    from public.chat_participants p
   where p.conversation_id = p_conversation_id;
$$;

revoke all on function private.chat_direct_key(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Backfill the conversations the old definition left unkeyed
-- ------------------------------------------------------------

do $$
declare
  v_skipped text;
begin
  select string_agg(
           format('%s (%s)', c.id, private.chat_direct_key(c.id)),
           ', ' order by private.chat_direct_key(c.id), c.id
         )
    into v_skipped
    from public.chat_conversations c
   where c.kind = 'direct'
     and private.chat_direct_key(c.id) is not null
     and exists (
       select 1
         from public.chat_conversations o
        where o.id <> c.id
          and (
            private.chat_direct_key(o.id) = private.chat_direct_key(c.id)
            or o.direct_key = private.chat_direct_key(c.id)
          )
     );

  if v_skipped is not null then
    raise notice
      'direct pairs the unique index cannot hold twice, left as they were: %',
      v_skipped;
  end if;
end;
$$;

update public.chat_conversations c
   set direct_key = private.chat_direct_key(c.id)
 where c.kind = 'direct'
   and c.direct_key is distinct from private.chat_direct_key(c.id)
   and not exists (
     select 1
       from public.chat_conversations o
      where o.id <> c.id
        and (
          private.chat_direct_key(o.id) = private.chat_direct_key(c.id)
          or o.direct_key = private.chat_direct_key(c.id)
        )
   );
