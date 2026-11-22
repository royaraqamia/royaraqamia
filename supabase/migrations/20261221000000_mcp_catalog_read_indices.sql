-- ============================================================
-- Price a catalogue read by the store, not by the mirror
--
-- The mirror holds ~46k registry rows but the store can draw ~50 of them.
-- Three of the four reads had no index for their predicate and walked the
-- whole heap (measured 2026-11-22: coverage 6,994 ms / 9,547 buffers, agent
-- page 1,127 ms / 9,593 buffers, admin Arabic search 241 ms / 9,550 buffers).
-- The registry's own JSON averaged 882 B of the table's 1,714 B heap row and
-- only the Admin Console's remote picker ever read it.
--
-- This file does three things:
--   1. moves `raw` to `mcp_catalog_server_raw`, written by the same sync and
--      read only by the picker, and drops it from the scanned heap;
--   2. gives each remaining read a partial index matching its exact predicate,
--      so its plan is a range over tens of rows instead of a scan of the mirror;
--   3. replaces the partial trigram index, which the admin list could not use
--      (its predicate is `status <> 'deleted'`, not the store's two predicates),
--      with one spanning the table. It is the same index, pointed at the query
--      that exists; measured 1.6 ms / 17 buffers on the Arabic search.
--
-- The two counts in `catalogCoverage()` are served by the two tiny partial
-- indexes below rather than by a maintained counter: the count is then bounded
-- by the eligible rows (~50), not by the mirror, and there is no second source
-- of truth to drift from the rows a human verifies.
--
-- Why this file needs a human: one `drop column` rewrites the table. The
-- unattended apply gate is meant to refuse that (docs/supabase.md); a person
-- reads this file and applies it. `vacuum (full, analyze)` is a separate
-- statement because VACUUM cannot run inside the push's transaction; without
-- it the dropped column's bytes are still counted in pg_total_relation_size.
--
-- Rollback: recreate `raw` on the mirror and copy it back from the side table,
-- then recreate the old partial trigram index. The new indices can be dropped
-- without losing data.
-- ============================================================

set statement_timeout = '10min';

-- ------------------------------------------------------------
-- The registry's own document, off the scanned heap
-- ------------------------------------------------------------

create table if not exists public.mcp_catalog_server_raw (
  registry_name text primary key
    references public.mcp_catalog_servers (registry_name) on delete cascade,
  raw jsonb
);

alter table public.mcp_catalog_server_raw enable row level security;

revoke all on public.mcp_catalog_server_raw from anon, authenticated;
grant all on public.mcp_catalog_server_raw to service_role;

create policy "mcp_catalog_server_raw_service_role"
  on public.mcp_catalog_server_raw
  for all
  to service_role
  using (true)
  with check (true);

insert into public.mcp_catalog_server_raw (registry_name, raw)
select registry_name, raw
from public.mcp_catalog_servers
where raw is not null
on conflict (registry_name) do update set raw = excluded.raw;

alter table public.mcp_catalog_servers drop column if exists raw;

-- ------------------------------------------------------------
-- One index per read
-- ------------------------------------------------------------

-- The agent's page: unverified first, then the least recently probed.
create index if not exists idx_mcp_catalog_servers_agent_candidates
  on public.mcp_catalog_servers (verified_at asc nulls first, probed_at asc nulls first, registry_name)
  where status = 'active' and blocked_at is null;

-- The two coverage counts. The first predicate is the icon OR the console's
-- listing uses too; no single btree could serve it before the index carried it.
create index if not exists idx_mcp_catalog_servers_coverage_eligible
  on public.mcp_catalog_servers (registry_name)
  where status = 'active' and blocked_at is null and connectable
    and (icon_override is not null or probe_icon_url is not null or registry_icon_url is not null);

create index if not exists idx_mcp_catalog_servers_coverage_published
  on public.mcp_catalog_servers (registry_name)
  where status = 'active' and blocked_at is null and connectable and verified_at is not null;

-- The console's keyset page includes deprecated and blocked rows, but never
-- the ones the registry retired.
create index if not exists idx_mcp_catalog_servers_admin_list
  on public.mcp_catalog_servers (registry_name)
  where status <> 'deleted';

-- The old GIN index covered only `status = 'active' and blocked_at is null`,
-- which is why the console's Arabic search never used it. Same name, wider
-- predicate: the member store and the admin list share one trigram path.
drop index if exists public.idx_mcp_catalog_servers_search;

create index if not exists idx_mcp_catalog_servers_search
  on public.mcp_catalog_servers
  using gin (search_text extensions.gin_trgm_ops);

analyze public.mcp_catalog_servers;
