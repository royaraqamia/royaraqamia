-- Postgres does not index a foreign-key column automatically, so a delete or an
-- update of an `mcp_catalog_servers` row scans `mcp_connections` for the rows
-- `on delete restrict` has to block. The Supabase performance advisor
-- (`unindexed_foreign_keys`) reported exactly that column (#1327):
--
--   - `mcp_connections.registry_name` — `mcp_catalog_servers.registry_name`,
--     on delete restrict. The three indexes the marketplace migration created
--     all lead with `user_id`, so none of them can serve the parent-side check;
--     `idx_mcp_connections_user_catalog` is `(user_id, registry_name)` and stays
--     as it is, because it serves `findLiveConnection`, not the FK.
--
-- The table is small today, which is exactly why this is cheap now: it is purely
-- additive, changes no constraint, column or RLS policy, and no existing query
-- text depends on it.
--
-- Rollback:
--   drop index if exists public.idx_mcp_connections_registry_name;

create index if not exists idx_mcp_connections_registry_name
  on public.mcp_connections (registry_name);
