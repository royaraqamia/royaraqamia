-- ============================================================
-- Finish the agent page's index and the raw side table
--
-- Two measurements from the first apply of 20261221000000, both on production:
--
--   * the agent page used the plain partial index at 209 shared buffers
--     (215 with the cold reads), just over the 200-buffer budget. Including the
--     columns the page draws makes it an index-only scan: 18 buffers, 1.7 ms.
--   * the side table had 46,392 rows against 46,393 catalog rows: the one row
--     whose registry entry carried no document was skipped by the backfill's
--     `raw is not null`. A side table is a pair, so it gets that row too.
--
-- The rename is safe on a replay without the temporary index: `create index if
-- not exists` builds the final index there. On this project the index has
-- already been built under the temporary name, so no second build is needed.
-- ============================================================

drop index if exists public.idx_mcp_catalog_servers_agent_candidates;

alter index if exists public.idx_mcp_catalog_servers_agent_cover_test
  rename to idx_mcp_catalog_servers_agent_candidates;

create index if not exists idx_mcp_catalog_servers_agent_candidates
  on public.mcp_catalog_servers (verified_at asc nulls first, probed_at asc nulls first, registry_name)
  include (
    title, title_override, description, name_ar, description_ar, remote_url, remote_override,
    status, auth_mode, probe_auth_mode, connectable, connectable_reason, icon_override,
    probe_icon_url, registry_icon_url
  )
  where status = 'active' and blocked_at is null;

insert into public.mcp_catalog_server_raw (registry_name, raw)
select c.registry_name, null::jsonb
from public.mcp_catalog_servers c
left join public.mcp_catalog_server_raw r on r.registry_name = c.registry_name
where r.registry_name is null;

analyze public.mcp_catalog_servers;
