-- ============================================================
-- Recall has a distance measure (ADR-0185 decisions 1, 4, 6; ADR-0182
-- decision 3; #1425)
--
-- `agent_memories` holds what the member asked the assistant to remember. This
-- file adds the other half the recall layer needs: a vector per fact, in
-- pgvector, in the deployment's own database, beside the row it describes.
--
-- Four decisions this file enforces, each here rather than in whatever service
-- happens to write it first:
--
-- 1. **The width is the generation.** `embedding` is `vector(1536)`, so a model
--    that answers another width cannot be stored at all - Postgres refuses the
--    write instead of mixing two vector spaces in one index. A dimension change
--    is therefore a new table generation and a backfill, never an in-place
--    reindex (decision 6). The index below is dimension-aware by construction.
--
-- 2. **The vector dies with its row, and with the account.** `memory_id`
--    cascades from `agent_memories`, so forgetting a fact erases what recall
--    could have injected, and `user_id` cascades from `auth.users` for the same
--    reason `agent_memories` does. There is exactly one embedding per fact:
--    `unique (memory_id)` is what makes a backfill idempotent rather than
--    additive.
--
-- 3. **A vector is written, never fetched on a turn's read path.** Nothing here
--    calls a provider; the pending view below is the work list the write path
--    and the backfill read, and a fact whose `updated_at` moved past its
--    vector's `source_updated_at` is stale and queued again.
--
-- 4. **A failure is invisible to the member.** No key, no model, a width that
--    differs from this table's, or a provider that refuses means recall falls
--    back to lexical. The operator reads the warning; the member reads nothing.
--
-- The sources: a saved fact today. The rolling thread summary arrives with the
-- table that holds it (#1426), as an additive column and one more branch in the
-- pending view - not as a column nothing can fill.
--
-- Rollback:
--   drop view if exists public.agent_embedding_pending;
--   drop function if exists public.agent_memory_nearest(uuid, extensions.vector, integer);
--   drop table if exists public.agent_memory_embeddings;
--   (the extension `vector` stays: it belongs to the deployment, not this file)
-- ============================================================

-- pgvector, in the non-exposed schema, the way `pg_trgm` was moved there
-- (20261011110000): an extension in `public` is an advisor finding and a public
-- namespace the Data API can reach.
create extension if not exists vector with schema extensions;

create table if not exists public.agent_memory_embeddings (
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
  embedding         extensions.vector(1536) not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint agent_memory_embeddings_model check (length(btrim(model)) between 1 and 80),
  -- One vector per fact: a re-run of the backfill replaces the row instead of
  -- adding a second answer to the same question.
  constraint agent_memory_embeddings_memory unique (memory_id)
);

comment on table public.agent_memory_embeddings is
  'One pgvector embedding per saved fact, written when the fact is written and deleted with it (ADR-0182, ADR-0185). Owner-readable, service-role-written.';
comment on column public.agent_memory_embeddings.embedding is
  'vector(1536): the width is the generation. A model of another width needs a new table and a backfill, never an in-place reindex.';
comment on column public.agent_memory_embeddings.source_updated_at is
  'The agent_memories.updated_at the vector was built from. Older than the fact means stale, and the pending view queues it again.';
comment on column public.agent_memory_embeddings.model is
  'The embedding model that answered. Vectors from two models are not comparable.';

-- The nearest-neighbour index the recall query uses. Cosine distance because
-- embeddings are compared by direction, not magnitude, and the operator class
-- names the type's own ordering - which is why it is dimension-aware: a
-- 768-wide vector cannot be stored here, let alone indexed.
create index if not exists idx_agent_memory_embeddings_vector
  on public.agent_memory_embeddings
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- The foreign key's own index (#1086): an account deletion must find these rows
-- without reading the table, and a recall query filters on the member first.
create index if not exists idx_agent_memory_embeddings_user
  on public.agent_memory_embeddings (user_id);

alter table public.agent_memory_embeddings enable row level security;

-- A member may read their own vectors and nobody else's - the same boundary
-- `agent_memories` draws (decision 7), so recall can run in the member's session
-- instead of adding a service-role read path.
drop policy if exists "Members read their own embeddings" on public.agent_memory_embeddings;
create policy "Members read their own embeddings"
  on public.agent_memory_embeddings for select
  to authenticated
  using ( user_id = (select auth.uid()) );

-- No insert, update or delete policy on purpose: a member must not be able to
-- forge a vector, and the row is written and replaced by the service role
-- (the write path and the backfill). Deleting the fact deletes it, by cascade.

revoke all on public.agent_memory_embeddings from anon, authenticated;
grant select on public.agent_memory_embeddings to authenticated;
-- The write path and the backfill run on the service role. It bypasses row level
-- security, not privileges.
grant all on public.agent_memory_embeddings to service_role;

drop trigger if exists trg_agent_memory_embeddings_updated_at on public.agent_memory_embeddings;
create trigger trg_agent_memory_embeddings_updated_at
  before update on public.agent_memory_embeddings
  for each row execute function public.update_updated_at();

-- ============================================================
-- The work list, as a view rather than a query in each caller
--
-- Two things must agree about what "pending" means: the write path (one fact,
-- right after it is written) and the backfill (everything, in batches). Saying it
-- once means a fact can never be embedded twice for one write, and never skipped
-- because the other path had a different idea of stale.
--
-- `security_invoker` so the view answers for its caller: the service role sees
-- every member's work, a member's own session would see their own.
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
left join public.agent_memory_embeddings e on e.memory_id = m.id
where m.deleted_at is null
  and (e.id is null or e.source_updated_at < m.updated_at)
order by m.updated_at, m.id;

comment on view public.agent_embedding_pending is
  'Facts with no vector, or a vector older than the fact. The write path and the backfill both read this; service role only.';

-- Stable order, so a limited batch read is resumable: what was written leaves the
-- view, and the next read starts at the next fact rather than at the top again.
revoke all on public.agent_embedding_pending from anon, authenticated;
grant select on public.agent_embedding_pending to service_role;

-- ============================================================
-- The read side: the k nearest facts for one member
--
-- `security invoker` on purpose. Both tables are owner-only by RLS, so the
-- member's own session can call this and the service role can too - the function
-- adds ordering, not authority. A definer version would be a door around the
-- policies this file just drew.
--
-- The query vector is passed in, never fetched here: the turn's read path does
-- not call an embedding model (decision 5). A caller with no vector has no
-- recall, which is a lexical turn, not an error.
-- ============================================================

create or replace function public.agent_memory_nearest(
  p_user_id uuid,
  p_query extensions.vector,
  p_limit integer default 6
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
  order by e.embedding <=> p_query
  limit greatest(1, least(coalesce(p_limit, 6), 24));
$$;

comment on function public.agent_memory_nearest(uuid, extensions.vector, integer) is
  'The k nearest active facts for one member, by cosine similarity, with the source row. The query vector comes from the caller: a turn never embeds its own read path.';

revoke all on function public.agent_memory_nearest(uuid, extensions.vector, integer) from public, anon;
grant execute on function public.agent_memory_nearest(uuid, extensions.vector, integer)
  to authenticated, service_role;
