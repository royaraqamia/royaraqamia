-- ============================================================
-- What a connected app's tools mean (#1917, ADR-0223)
--
-- The router that decides which remote tools ride a turn compared the member's
-- Arabic words with the server's English tool names by exact word, so the two
-- sides never met: 321 enabled tools in production, 0 `mcp.call` usage events,
-- every `last_used_at` null, and one grant created and revoked without a use.
--
-- The fix keeps the 16-tool cap and gives the router a second signal: the tool's
-- vector, so a question and a tool can be close in meaning whatever language
-- either is in. Two things are fixed here:
--
-- 1. **Where a tool's vector lives.** Beside the tools, at the deployment's 1024
--    width (`agent_memory_embeddings_1024`, ADR-0190 decision 2), one row per
--    `(connection_id, tool_name)` so a re-sync replaces rather than adds. The
--    row carries the model and a hash of the text it was built from: a vector
--    from another model is not comparable, and a description the server rewrote
--    is a stale vector the backfill re-embeds.
-- 2. **How a turn reads it.** `mcp_tool_nearest_1024` ranks the member's own
--    tools for a query vector the turn already has. The turn reads at most 32
--    similarities — a few bytes each — instead of shipping 321 x 1024 floats to
--    the application, which is what reading the vectors into the router would
--    cost on every message.
--
-- No HNSW index on purpose: the catalog a turn ranks is hundreds of rows, not
-- millions, so Postgres' exact ordering is cheaper than building and maintaining
-- an approximate index and always right. A member with enough tools to need one
-- is a measurement this table has not seen.
--
-- There is no policy for a member: like `mcp_connection_tools`, these rows are
-- the server's, written and read with the service role only.
--
-- Rollback: drop the function and the table. The tool rows and every connection
-- are untouched; the router falls back to vocabulary alone, which is what it
-- answers with when no embedding provider is configured.
--   drop function if exists public.mcp_tool_nearest_1024(uuid[], extensions.vector, integer);
--   drop table if exists public.mcp_connection_tool_embeddings_1024;
-- ============================================================

create table if not exists public.mcp_connection_tool_embeddings_1024 (
  connection_id uuid not null,
  tool_name     text not null,
  -- The model that answered. Two models' vectors are not comparable, and the
  -- nearest query filters on this rather than guessing at a mixed table.
  model         text not null,
  -- sha256 of the text below and the model: a renamed tool or a rewritten
  -- description is different text, so the backfill knows to replace the vector.
  source_hash   text not null,
  embedding     extensions.vector(1024) not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint mcp_connection_tool_embeddings_1024_pkey
    primary key (connection_id, tool_name),
  -- The tool the vector describes: a server that drops a tool takes its vector
  -- with it, and a tool that was never stored cannot have one.
  constraint mcp_connection_tool_embeddings_1024_tool
    foreign key (connection_id, tool_name)
    references public.mcp_connection_tools (connection_id, tool_name)
    on delete cascade,
  constraint mcp_connection_tool_embeddings_1024_model
    check (length(btrim(model)) between 1 and 80),
  constraint mcp_connection_tool_embeddings_1024_hash
    check (source_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.mcp_connection_tool_embeddings_1024 is
  'One pgvector embedding per connected app tool at the deployment''s 1024 width (ADR-0223, #1917). Written by the connect flow and the backfill, read only through mcp_tool_nearest_1024.';
comment on column public.mcp_connection_tool_embeddings_1024.source_hash is
  'sha256 of the embedded text and model. A tool whose text moved is stale, and the backfill re-embeds it.';
comment on column public.mcp_connection_tool_embeddings_1024.embedding is
  'vector(1024): the width is the generation. A model of another width needs a new table and a backfill.';

-- The foreign key's own index: the nearest query filters on the member's
-- connections, and a cascade delete must find these rows without reading the
-- table.
create index if not exists idx_mcp_connection_tool_embeddings_1024_connection
  on public.mcp_connection_tool_embeddings_1024 (connection_id);

drop trigger if exists trg_mcp_connection_tool_embeddings_1024_updated_at
  on public.mcp_connection_tool_embeddings_1024;
create trigger trg_mcp_connection_tool_embeddings_1024_updated_at
  before update on public.mcp_connection_tool_embeddings_1024
  for each row execute function public.update_updated_at();

-- Service role only, the same boundary `mcp_connection_tools` draws.
alter table public.mcp_connection_tool_embeddings_1024 enable row level security;
revoke all on public.mcp_connection_tool_embeddings_1024 from anon, authenticated;
grant all on public.mcp_connection_tool_embeddings_1024 to service_role;

-- ------------------------------------------------------------
-- The reader a turn uses
-- ------------------------------------------------------------
create or replace function public.mcp_tool_nearest_1024(
  p_connection_ids uuid[],
  p_query extensions.vector,
  p_limit integer default 32
)
returns table (
  connection_id uuid,
  tool_name     text,
  similarity    double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    e.connection_id,
    e.tool_name,
    1 - (e.embedding <=> p_query) as similarity
  from public.mcp_connection_tool_embeddings_1024 e
  join public.mcp_connection_tools t
    on t.connection_id = e.connection_id
   and t.tool_name = e.tool_name
  where e.connection_id = any (p_connection_ids)
    and t.enabled
  order by e.embedding <=> p_query
  -- Bounded like the memory reader: a caller cannot ask for more than a turn
  -- could ever declare, and the router caps at 16 anyway.
  limit greatest(1, least(coalesce(p_limit, 32), 64));
$$;

comment on function public.mcp_tool_nearest_1024(uuid[], extensions.vector, integer) is
  'The tools of one member''s connections nearest to a query vector at the 1024 generation, with the cosine of each (ADR-0223). The query vector comes from the turn: a message is embedded once, and the router reads the answer.';

revoke all on function public.mcp_tool_nearest_1024(uuid[], extensions.vector, integer)
  from public, anon, authenticated;
grant execute on function public.mcp_tool_nearest_1024(uuid[], extensions.vector, integer)
  to service_role;
