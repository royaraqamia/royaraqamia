-- ============================================================
-- Drop the generated columns a cancelled attempt left behind
--
-- `20261119120000_mcp_catalog_curation.sql` timed out while rewriting the
-- catalogue for its stored generated columns. `20261119160000_mcp_catalog_curation.sql`
-- added the plain columns the store actually reads and deliberately left the
-- debris in place, because dropping it is a rewrite nobody wanted in the gate's
-- path. The linked project still carries all of it:
--
--   * `icon_url`  — generated `coalesce(probe_icon_url, registry_icon_url)`;
--   * `icon_mime` — generated `coalesce(probe_icon_mime, registry_icon_mime)`;
--   * `store_key` — generated `lpad(coalesce(featured_rank, 999999), 6, '0') || ':' || registry_name`;
--   * `idx_mcp_catalog_servers_store` — the partial index built on `store_key`.
--
-- Nothing reads them. The service resolves
-- `icon_override ?? probe_icon_url ?? registry_icon_url` and orders by
-- `featured_rank, registry_name` through `idx_mcp_catalog_servers_store_order`;
-- no constraint references the three columns; no view, function or test names
-- them. What they still cost is a full rewrite of tens of thousands of `jsonb`
-- rows on every migration that touches the table, and a generated column nobody
-- selects is a schema that lies about what the store reads.
--
-- Why this file needs a human: `scripts/check-migration-safety.mjs` refuses a
-- `drop column` for the unattended push, and that refusal is the point of the
-- gate rather than an obstacle to route around. A person reads this file and
-- applies it:
--
--   supabase link --project-ref <ref> && supabase db push
--
-- Each `drop column` rewrites the table once (Postgres rewrites per statement,
-- so the three share one `alter table`), which is why the timeout below matches
-- the one the curation migration needed.
--
-- Rollback: none worth having. All three values are derived — the two icon
-- columns from the pair the service already reads, `store_key` from the two
-- columns the store already orders by — and re-adding them would reproduce the
-- rewrite this file exists to remove. The plain columns and the current index
-- are added by `20261119160000` and are untouched here.
-- ============================================================

set statement_timeout = '10min';

-- Drop the old index first. Dropping `store_key` would take it anyway, but a
-- statement's side effects should not be what decides the order two statements
-- run in, and the index is the cheaper half of the work.
drop index if exists public.idx_mcp_catalog_servers_store;

-- One statement, one rewrite: the three columns are all stored generated
-- columns, and splitting them would rewrite the catalogue three times.
alter table public.mcp_catalog_servers
  drop column if exists store_key,
  drop column if exists icon_url,
  drop column if exists icon_mime;
