-- ============================================================
-- The MCP catalogue, phase 2: the mirror learns to answer
--
-- `20261114110000_mcp_marketplace_foundation.sql` created
-- `mcp_catalog_servers` and left it empty. This file gives the table the three
-- things a screen needs from it: a search index, a recorded verdict about
-- whether a row can actually be connected, and a place to remember how far a
-- full pass through the registry got.
--
-- Why the pass needs remembering: measured on 2026-11-10, the registry answers
-- `?version=latest` with more than thirty thousand rows at 100 per page, and a
-- full sweep does not finish inside a serverless invocation. So the sync is a
-- resumable pass rather than one request: it pages until its own deadline, saves
-- the cursor, and continues on the next run. `mcp_catalog_sync_state` is that
-- cursor, plus the evidence a later run needs to know whether a pass finished.
--
-- Why the verdict is stored rather than computed: probing eleven popular servers
-- (recorded in `docs/specs/mcp-marketplace.md`) found four that publish no
-- usable authorization metadata. A member must learn that before she taps the
-- row, not from a refusal after it, so the answer is a column with a timestamp.
-- It is filled on demand, for the rows a screen actually draws — probing a
-- catalogue of thousands to answer a question about twenty is the wrong bill.
--
-- Rollback: drop the two indexes, the generated column, the three probe columns,
-- then the state table.
-- ============================================================

-- ------------------------------------------------------------
-- The verdict: can this row be connected?
-- ------------------------------------------------------------

alter table public.mcp_catalog_servers
  add column if not exists connectable boolean,
  add column if not exists connectable_reason text,
  add column if not exists probed_at timestamptz;

-- `null` is its own answer: nobody has asked this server yet, and the screen says
-- so rather than guessing either way.
alter table public.mcp_catalog_servers
  drop constraint if exists mcp_catalog_servers_connectable_reason_check;

alter table public.mcp_catalog_servers
  add constraint mcp_catalog_servers_connectable_reason_check
  check (
    connectable_reason is null
    or connectable_reason in ('no_metadata', 'no_registration', 'blocked')
  );

-- A verdict without a time is a guess with a timestamp's authority.
alter table public.mcp_catalog_servers
  drop constraint if exists mcp_catalog_servers_probe_stamp_check;

alter table public.mcp_catalog_servers
  add constraint mcp_catalog_servers_probe_stamp_check
  check (connectable is null or probed_at is not null);

-- ------------------------------------------------------------
-- Search: one generated column, one trigram index
-- ------------------------------------------------------------
--
-- The catalogue is English and the overrides are Arabic, so the searched text is
-- both: a member who types «نوشن» after an admin fills `name_ar` finds the row,
-- and one who types `notion` finds it before anyone does. `registry_name` is in
-- the text too, because `com.supabase/mcp` is what a technical member types.
--
-- A generated column rather than an expression index so the repository can ask
-- one column with `ilike` and PostgREST can use the index; an `or()` across five
-- columns would not.

alter table public.mcp_catalog_servers
  add column if not exists search_text text
  generated always as (
    lower(
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(name_ar, '') || ' ' ||
      coalesce(description_ar, '') || ' ' ||
      registry_name
    )
  ) stored;

-- Partial, because every member-facing read asks exactly these two predicates:
-- a blocked or retired row is not in the catalogue, so indexing it would be an
-- index of rows nobody may see.
create index if not exists idx_mcp_catalog_servers_search
  on public.mcp_catalog_servers
  using gin (search_text extensions.gin_trgm_ops)
  where status = 'active' and blocked_at is null;

-- The on-demand probe reads "the unprobed rows of this page first", and a row
-- probed long ago is due again.
create index if not exists idx_mcp_catalog_servers_probe
  on public.mcp_catalog_servers (probed_at asc nulls first)
  where status = 'active' and blocked_at is null;

-- ------------------------------------------------------------
-- The pass through the registry
-- ------------------------------------------------------------
--
-- One row, one key. A second row would be a second cursor, and two cursors
-- paging the same registry is two mirrors.

create table if not exists public.mcp_catalog_sync_state (
  id text primary key check (id = 'registry'),
  -- Where the pass stopped. Null means "no pass in flight".
  cursor text,
  -- When the current (or last) full pass began. The rows it did not return are
  -- the rows the registry no longer serves, and only a completed pass may say so.
  pass_started_at timestamptz,
  pass_completed_at timestamptz,
  -- Rows this pass has ingested so far. A pass that ends after a handful of rows
  -- is a registry outage, not an empty registry, and must not mark anything
  -- deleted.
  pass_rows integer not null default 0,
  last_run_at timestamptz,
  last_run_rows integer not null default 0,
  last_error text
);

alter table public.mcp_catalog_sync_state enable row level security;

revoke all on public.mcp_catalog_sync_state from anon, authenticated;
grant all on public.mcp_catalog_sync_state to service_role;

create policy "mcp_catalog_sync_state_service_role"
  on public.mcp_catalog_sync_state
  for all
  to service_role
  using (true)
  with check (true);

-- The row is the state; a missing row is the first run.
insert into public.mcp_catalog_sync_state (id)
values ('registry')
on conflict (id) do nothing;
