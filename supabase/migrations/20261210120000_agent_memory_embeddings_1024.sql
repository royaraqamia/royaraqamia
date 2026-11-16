-- ============================================================
-- Recall at the provider's own width (ADR-0185 decision 6; ADR-0190
-- decision 2's 1024; #1550)
--
-- `agent_memory_embeddings` was created at `vector(1536)` for a model this
-- deployment never had. ADR-0190 measured what it does have: Cloudflare
-- Workers AI `@cf/baai/bge-m3`, at 1024, because a multilingual model on the
-- account that already hosts R2 is the one this deployment can reach. The two
-- numbers cannot meet: the client refused to call a provider whose answer the
-- index cannot hold, so every turn answered `null` and recall was lexical by
-- absence rather than by choice.
--
-- The fix is the one ADR-0185 decision 6 reserves for a dimension change - a
-- new table generation and a backfill, never an in-place reindex:
--
-- 1. **This file is the new generation.** `agent_memory_embeddings_1024` and
--    `agent_memory_nearest_1024` hold and rank 1024-wide vectors, with the same
--    row, the same cascade, the same policy, the same grants and the same
--    toggles as the 1536 pair. The width is in the name because it is the
--    generation, and two widths in one table would be two vector spaces in one
--    index.
--
-- 2. **The old generation stays readable.** `agent_memory_embeddings` and its
--    function are untouched here: dropping them before `npm run
--    embeddings:backfill` reports `done` would destroy the only copy of a vector
--    the new table has not built yet. The drop is a separate change, after the
--    backfill, and it needs a person (the apply gate refuses destructive DDL
--    unattended).
--
-- 3. **One work list, moved to the new table.** `agent_embedding_pending` keeps
--    its name and its meaning - a live fact with no vector, or a vector older
--    than the fact - and now asks the new table. That is what makes the backfill
--    idempotent: a written row leaves the view, so a second run embeds nothing.
--
-- 4. **Forgetting covers both generations.** Until the drop, a forgotten fact
--    deletes its vector from both tables: the member's promise is that the
--    vector is gone, not that it is gone from whichever table code reads today.
--
-- Rollback: drop the new table and its function, and point
-- `EMBEDDING_GENERATION` back at the 1536 pair; the old generation was never
-- modified.
--   drop function if exists public.agent_memory_nearest_1024(uuid, extensions.vector, integer, uuid, text);
--   drop table if exists public.agent_memory_embeddings_1024;
-- ============================================================

create extension if not exists vector with schema extensions;

create table if not exists public.agent_memory_embeddings_1024 (
  id                uuid primary key default gen_random_uuid(),
  -- The member, denormalised so a recall query filters one account without a
  -- join, and so the account deletion reaches these rows even if the fact is
  -- already gone.
  user_id           uuid not null references auth.users (id) on delete cascade,
  memory_id         uuid not null references public.agent_memories (id) on delete cascade,
  -- Which model answered. Two models' vectors are not comparable, so this is how
  -- a mixed table is spotted rather than guessed at.
  model             text not null,
  -- The `agent_memories.updated_at` this vector was built from. A fact edited
  -- after the fact is stale: the pending view queues it again.
  source_updated_at timestamptz not null,
  embedding         extensions.vector(1024) not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint agent_memory_embeddings_1024_model check (length(btrim(model)) between 1 and 80),
  -- One vector per fact: a re-run of the backfill replaces the row instead of
  -- adding a second answer to the same question.
  constraint agent_memory_embeddings_1024_memory unique (memory_id)
);

comment on table public.agent_memory_embeddings_1024 is
  'One pgvector embedding per saved fact at the provider''s 1024 width (ADR-0185 decision 6, ADR-0190, #1550). Owner-readable, service-role-written.';
comment on column public.agent_memory_embeddings_1024.embedding is
  'vector(1024): the width is the generation. A model of another width needs a new table and a backfill, never an in-place reindex.';
comment on column public.agent_memory_embeddings_1024.source_updated_at is
  'The agent_memories.updated_at the vector was built from. Older than the fact means stale, and the pending view queues it again.';
comment on column public.agent_memory_embeddings_1024.model is
  'The embedding model that answered. Vectors from two models are not comparable.';

-- The nearest-neighbour index the recall query uses. Cosine distance because
-- embeddings are compared by direction, not magnitude, and the operator class
-- names the type's own ordering - which is why it is dimension-aware.
create index if not exists idx_agent_memory_embeddings_1024_vector
  on public.agent_memory_embeddings_1024
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- The foreign key's own index (#1086): an account deletion must find these rows
-- without reading the table, and a recall query filters on the member first.
create index if not exists idx_agent_memory_embeddings_1024_user
  on public.agent_memory_embeddings_1024 (user_id);

alter table public.agent_memory_embeddings_1024 enable row level security;

-- A member may read their own vectors and nobody else's - the same boundary
-- `agent_memories` draws, so recall can run in the member's session instead of
-- adding a service-role read path.
drop policy if exists "Members read their own embeddings" on public.agent_memory_embeddings_1024;
create policy "Members read their own embeddings"
  on public.agent_memory_embeddings_1024 for select
  to authenticated
  using ( user_id = (select auth.uid()) );

-- No insert, update or delete policy on purpose: a member must not be able to
-- forge a vector, and the row is written and replaced by the service role
-- (the write path and the backfill). Deleting the fact deletes it, by cascade.

revoke all on public.agent_memory_embeddings_1024 from anon, authenticated;
grant select on public.agent_memory_embeddings_1024 to authenticated;
-- The write path and the backfill run on the service role. It bypasses row level
-- security, not privileges.
grant all on public.agent_memory_embeddings_1024 to service_role;

drop trigger if exists trg_agent_memory_embeddings_1024_updated_at
  on public.agent_memory_embeddings_1024;
create trigger trg_agent_memory_embeddings_1024_updated_at
  before update on public.agent_memory_embeddings_1024
  for each row execute function public.update_updated_at();

-- ============================================================
-- The work list, moved to the new generation
--
-- Same view name and same columns, so the write path and the backfill keep one
-- definition of "waiting" and the repository does not learn a second name. It
-- reads the new table, so a fact embedded after this file is not queued again,
-- and every fact the old generation held is queued once.
-- ============================================================

create or replace view public.agent_embedding_pending
with (security_invoker = true) as
select
  'fact'::text        as source_kind,
  m.id                as source_id,
  m.user_id           as user_id,
  m.text              as body,
  m.updated_at        as source_updated_at
from public.agent_memories m
left join public.agent_memory_embeddings_1024 e on e.memory_id = m.id
where m.deleted_at is null
  and (e.id is null or e.source_updated_at < m.updated_at)
order by m.updated_at, m.id;

comment on view public.agent_embedding_pending is
  'Facts with no vector, or a vector older than the fact, in the current generation. The write path and the backfill both read this; service role only.';

-- Stable order, so a limited batch read is resumable: what was written leaves the
-- view, and the next read starts at the next fact rather than at the top again.
revoke all on public.agent_embedding_pending from anon, authenticated;
grant select on public.agent_embedding_pending to service_role;

-- ============================================================
-- The read side: the k nearest facts for one member, from this generation
--
-- `security invoker` on purpose. Both tables are owner-only by RLS, so the
-- member's own session can call this and the service role can too - the function
-- adds ordering, not authority.
--
-- The body is `20261208120000`'s, unchanged except for the table it reads: the
-- scores, the floor's inputs and the toggles' rules are the ones already
-- measured, and a generation change is not a reason to rank differently.
-- ============================================================

create or replace function public.agent_memory_nearest_1024(
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
  from public.agent_memory_embeddings_1024 e
  join public.agent_memories m on m.id = e.memory_id
  left join public.agent_memory_settings s on s.user_id = p_user_id
  where e.user_id = p_user_id
    and m.deleted_at is null
    and (
      (m.scope = 'account' and coalesce(s.account_enabled, true))
      -- A product fact is recalled only where the turn knows the product, and
      -- only for that product: an unknown product is not every product.
      or (
        m.scope = 'product'
        and p_product is not null
        and m.product = p_product
        and coalesce(s.product_enabled, true)
      )
      -- A thread fact never leaves its own thread.
      or (
        m.scope = 'thread'
        and p_thread_id is not null
        and m.thread_id = p_thread_id
        and coalesce(s.thread_enabled, true)
      )
    )
  order by e.embedding <=> p_query
  limit greatest(1, least(coalesce(p_limit, 6), 24));
$$;

comment on function public.agent_memory_nearest_1024(uuid, extensions.vector, integer, uuid, text) is
  'The k nearest active facts for one member at the 1024 generation, inside the thread and product the turn is in, skipping any scope the member switched off. The query vector comes from the caller: a turn never embeds its own read path.';

revoke all on function public.agent_memory_nearest_1024(uuid, extensions.vector, integer, uuid, text)
  from public, anon;
grant execute on function public.agent_memory_nearest_1024(uuid, extensions.vector, integer, uuid, text)
  to authenticated, service_role;

-- ============================================================
-- Forgetting, across both generations
--
-- The bodies are `20261208120000`'s with one more delete: until the 1536
-- generation is dropped, a vector it holds is still a vector of a fact the
-- member forgot. The ownership predicate is the same on every delete, so this
-- stays a member's own row and never a door around the policies.
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

  delete from public.agent_memory_embeddings e
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

  delete from public.agent_memory_embeddings e
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
