-- ============================================================
-- The 1536 generation leaves, after its backfill (ADR-0200 decision 5; #1554)
--
-- `agent_memory_embeddings` was created at `vector(1536)` for a model this
-- deployment never had, and `20261210120000` built its successor at the width
-- the provider answers. That file kept the old pair readable on purpose: dropping
-- it before `npm run embeddings:backfill` reports `done` would have destroyed the
-- only vectors the deployment had.
--
-- The backfill is done: `agent_embedding_pending` reads the 1024 table and
-- returns no fact, so a second run embeds nothing, and the 1536 table holds no
-- vector any live fact needs. Nothing in the runtime names it either -
-- `EMBEDDING_GENERATION` points at the 1024 pair, and the only code that still
-- touched the old table was the forget pair below.
--
-- What runs here:
--
-- 1. **The old function, then the old table.** The function reads the table, so
--    it goes first; the table's own index, policy and trigger go with it.
-- 2. **The forget pair, rewritten for one generation.** Their bodies named
--    `public.agent_memory_embeddings` explicitly, so the drop would have made
--    every forget button raise `relation does not exist` at runtime. This file
--    replaces them in the same transaction as the drop, so the button never has
--    a window in which its table is gone and its body still names it.
--
-- Not touched: `agent_memories`, `agent_memory_settings`, their policies, the
-- 1024 table and its function, and the pending view.
--
-- Rollback: the drop cannot restore vectors. Recreating the empty 1536 pair is
-- `20261203120000`'s create, and `20261208120000`'s forget bodies would have to
-- come back with it; the data is gone either way, so the real rollback is the
-- 1024 generation, which this file does not touch.
--   -- (no restore of data; re-run 20261203120000 to recreate the empty table)
-- ============================================================

drop function if exists public.agent_memory_nearest(uuid, extensions.vector, integer, uuid, text);

drop table if exists public.agent_memory_embeddings;

-- ============================================================
-- Forgetting, at one generation
--
-- The bodies are `20261210120000`'s with the second delete removed: there is no
-- longer a second table to delete from. The ownership predicate is unchanged, so
-- this stays a member's own row and never a door around the policies.
-- ============================================================

create or replace function public.agent_memory_forget(p_memory_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_user uuid := auth.uid();
  v_forgotten boolean := false;
begin
  if v_user is null then
    raise exception 'forbidden';
  end if;

  delete from public.agent_memory_embeddings_1024 e
  using public.agent_memories m
  where e.memory_id = m.id
    and m.id = p_memory_id
    and m.user_id = v_user;

  update public.agent_memories
     set deleted_at = now()
   where id = p_memory_id
     and user_id = v_user
     and deleted_at is null;

  v_forgotten := found;
  return v_forgotten;
end;
$fn$;

comment on function public.agent_memory_forget(uuid) is
  'Forgets one of the caller''s facts: soft-deletes the row and deletes its embedding in one transaction. Answers whether a live fact was forgotten.';

revoke all on function public.agent_memory_forget(uuid) from public, anon;
grant execute on function public.agent_memory_forget(uuid) to authenticated, service_role;

create or replace function public.agent_memory_forget_thread(p_thread_id uuid)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_user uuid := auth.uid();
  v_forgotten integer := 0;
begin
  if v_user is null then
    raise exception 'forbidden';
  end if;

  delete from public.agent_memory_embeddings_1024 e
  using public.agent_memories m
  where e.memory_id = m.id
    and m.thread_id = p_thread_id
    and m.user_id = v_user
    and m.deleted_at is null;

  update public.agent_memories
     set deleted_at = now()
   where thread_id = p_thread_id
     and user_id = v_user
     and deleted_at is null;

  v_forgotten := found;
  return v_forgotten;
end;
$fn$;

comment on function public.agent_memory_forget_thread(uuid) is
  'Forgets every live thread fact of the caller in one conversation, and their embeddings, in one transaction. Answers how many facts were forgotten.';

revoke all on function public.agent_memory_forget_thread(uuid) from public, anon;
grant execute on function public.agent_memory_forget_thread(uuid) to authenticated, service_role;
