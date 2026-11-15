-- ============================================================
-- Recall answers inside a scope (ADR-0182 decision 3, #1510)
--
-- The function #1425 wrote returns the k nearest live facts for one member, and
-- that is not the question a turn asks. A `thread`-scoped fact is memory of its
-- own thread; an `account` fact is memory of every thread; a `product` fact is
-- memory of every thread of that product. Ranking without the scope is how a
-- fact saved in one conversation ends up quoted in another.
--
-- The signature grows by the two keys the filter needs, both defaulted so a
-- three-argument call still means "account facts only". Postgres cannot replace
-- a signature in place, and two overloads would make a three-argument call
-- ambiguous, so the old function is dropped first. Nothing but the repository
-- this pull request updates calls it, and no view or policy depends on it.
--
-- The query vector is still passed in and never fetched here (#1425): the turn
-- produces it once, and this function spends no provider.
-- ============================================================

drop function if exists public.agent_memory_nearest(uuid, extensions.vector, integer);

create or replace function public.agent_memory_nearest(
  p_user_id uuid,
  p_query extensions.vector,
  p_limit integer default 6,
  p_thread_id uuid default null,
  p_product text default null
)
returns table (
  memory_id  uuid,
  text       text,
  similarity double precision,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    m.id as memory_id,
    m.text,
    1 - (e.embedding <=> p_query) as similarity,
    m.updated_at
  from public.agent_memory_embeddings e
  join public.agent_memories m on m.id = e.memory_id
  where e.user_id = p_user_id
    and m.deleted_at is null
    and (
      m.scope = 'account'
      -- A product fact is recalled only where the turn knows the product, and
      -- only for that product: an unknown product is not every product.
      or (m.scope = 'product' and p_product is not null and m.product = p_product)
      -- A thread fact never leaves its own thread.
      or (m.scope = 'thread' and p_thread_id is not null and m.thread_id = p_thread_id)
    )
  order by e.embedding <=> p_query
  limit greatest(1, least(coalesce(p_limit, 6), 24));
$$;

comment on function public.agent_memory_nearest(uuid, extensions.vector, integer, uuid, text) is
  'The k nearest active facts for one member, inside the thread and product the turn is in, by cosine similarity. The query vector comes from the caller: a turn never embeds its own read path.';

revoke all on function public.agent_memory_nearest(uuid, extensions.vector, integer, uuid, text)
  from public, anon;
grant execute on function public.agent_memory_nearest(uuid, extensions.vector, integer, uuid, text)
  to authenticated, service_role;

-- rollback: drop this five-argument function and re-apply
-- supabase/migrations/20261203120000_agent_memory_embeddings.sql, which creates
-- the three-argument `agent_memory_nearest` and its grants.
