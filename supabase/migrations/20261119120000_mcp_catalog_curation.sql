-- ============================================================
-- The MCP catalogue becomes a store, not a mirror
--
-- `20261116150000_mcp_catalog_mirror.sql` made every active registry row
-- visible and measured on demand. That is the right shape for a mirror and the
-- wrong shape for a store: a public registry has tens of thousands of rows,
-- anyone may publish one, and the first page is alphabetical (`ac.*`, `ai.*`,
-- `app.*`) rather than useful. A member cannot tell Vercel from a stranger's
-- weekend project, and a row nobody has probed yet reads as untrustworthy.
--
-- This file gives the table what a curated store needs:
--
--   * `icon_url` / `icon_mime` — the brand mark, captured from the registry's
--     `icons` or the server's RFC 9728 `logo_uri`. The browser never fetches a
--     third party directly; `/mcp/icon` proxies it from this column.
--   * `title_override` — the Latin name the store draws when the registry's own
--     `title` is empty (`com.vercel/vercel-mcp`) or worse than the brand.
--   * `verified_at` — the admin's vouch. A row is in the store only when this is
--     set, it is connectable (`connectable is true`), it is active and it is not
--     blocked. Verification is a decision, not a measurement: the probe says the
--     server answers, this says we stand behind it.
--   * `verification_withdrawn_at` — the record that stops the launch set from
--     re-verifying a row an admin deliberately took out.
--   * `featured_rank` — the order the store draws. Lower first, null last.
--   * `store_key` — featured rank and registry name in one sortable key, so the
--     existing single-column cursor keeps working. A two-key cursor interpolated
--     into a PostgREST `or()` is the filter-syntax hazard
--     `backend/shared/postgrest-or-filter.ts` exists for.
--
-- `connectable_reason` also gains `unreachable`: a server that timed out is not
-- a server that publishes no metadata, and saying so is what the admin needs to
-- decide whether to try again.
--
-- Rollback: drop the two indexes and the three generated columns, drop the added
-- columns, restore the old `connectable_reason` constraint.
-- ============================================================

-- ------------------------------------------------------------
-- The brand mark
-- ------------------------------------------------------------
--
-- Two sources, never overwriting each other: the registry's `icons` are rewritten
-- on every sync, and the RFC 9728 `logo_uri` is written by the probe. A single
-- `icon_url` column would let a daily sync erase the mark the probe found (Vercel
-- publishes one and its registry row publishes none), so the two live apart and
-- the read column is generated from them. The probe wins because it is the
-- server's own machine-readable statement about itself.

alter table public.mcp_catalog_servers
  add column if not exists registry_icon_url text,
  add column if not exists registry_icon_mime text,
  add column if not exists probe_icon_url text,
  add column if not exists probe_icon_mime text;

-- The registry's `title` is often empty (`com.vercel/vercel-mcp` publishes no
-- title) or the publisher's phrasing. The admin writes the brand here; the sync
-- keeps writing the registry's own `title` beside it, so neither overwrites the
-- other.
alter table public.mcp_catalog_servers
  add column if not exists title_override text;

alter table public.mcp_catalog_servers
  add column if not exists icon_url text
  generated always as (coalesce(probe_icon_url, registry_icon_url)) stored;

alter table public.mcp_catalog_servers
  add column if not exists icon_mime text
  generated always as (coalesce(probe_icon_mime, registry_icon_mime)) stored;

-- The proxy only ever answers an image, so a row whose stored mime is not one is
-- a row with no usable mark rather than a file served with our origin.
alter table public.mcp_catalog_servers
  drop constraint if exists mcp_catalog_servers_icon_mime_check;

alter table public.mcp_catalog_servers
  add constraint mcp_catalog_servers_icon_mime_check
  check (
    coalesce(probe_icon_mime, registry_icon_mime) is null
    or coalesce(probe_icon_mime, registry_icon_mime) in (
      'image/png',
      'image/svg+xml',
      'image/jpeg',
      'image/webp',
      'image/x-icon'
    )
  );

-- ------------------------------------------------------------
-- Verification: the store's only admission rule
-- ------------------------------------------------------------

alter table public.mcp_catalog_servers
  add column if not exists verified_at timestamptz;

-- Why a withdrawal has its own stamp: the launch set below is verified by the
-- sync until an admin says otherwise. Without this column, an admin's unverify
-- would be undone by the next run, and the vouch would not be theirs.
alter table public.mcp_catalog_servers
  add column if not exists verification_withdrawn_at timestamptz;

-- A rank is a position, not a score; null is "not featured" and sorts last.
alter table public.mcp_catalog_servers
  add column if not exists featured_rank integer;

alter table public.mcp_catalog_servers
  drop constraint if exists mcp_catalog_servers_featured_rank_check;

alter table public.mcp_catalog_servers
  add constraint mcp_catalog_servers_featured_rank_check
  check (featured_rank is null or featured_rank between 0 and 999999);

-- One sortable key, so the cursor stays one column. `featured_rank` first, a
-- sentinel for "not featured", then the registry's own key as the tie-breaker.
alter table public.mcp_catalog_servers
  add column if not exists store_key text
  generated always as (
    lpad(coalesce(featured_rank, 999999)::text, 6, '0') || ':' || registry_name
  ) stored;

-- The store's one query: verified, connectable, active, unblocked, in store
-- order. Partial, because a row outside that predicate is not on the screen.
create index if not exists idx_mcp_catalog_servers_store
  on public.mcp_catalog_servers (store_key asc)
  where status = 'active'
    and blocked_at is null
    and verified_at is not null
    and connectable is true;

-- A verified row is probed again even when no member draws it: a server that
-- goes down must stop being offered, and a server that comes back must return.
create index if not exists idx_mcp_catalog_servers_reprobe
  on public.mcp_catalog_servers (probed_at asc nulls first)
  where status = 'active' and blocked_at is null and verified_at is not null;

-- ------------------------------------------------------------
-- One more reason a row cannot be connected
-- ------------------------------------------------------------

alter table public.mcp_catalog_servers
  drop constraint if exists mcp_catalog_servers_connectable_reason_check;

alter table public.mcp_catalog_servers
  add constraint mcp_catalog_servers_connectable_reason_check
  check (
    connectable_reason is null
    or connectable_reason in ('no_metadata', 'no_registration', 'blocked', 'unreachable')
  );
