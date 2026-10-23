-- ============================================================
-- A reader may propose a feed; an Admin decides, and only then is it fetched
--
-- Stage 2 of the news source work (ADR-0078). The reviewed list in
-- `data/news/sources.json` stays the base the workflow fetches. `news_sources`
-- holds only the *additions* an Admin approved, and `scripts/news/lib.mjs`
-- merges the two, so approving a source is a row, not a deploy — while the
-- guarantee that every fetched feed was reviewed first is unchanged (ADR-0076).
--
-- A request is an intake record, not a feed: the URL is probed before it enters
-- the queue (must be an http(s) URL that answers with RSS/Atom items), but the
-- probe is not the approval. `pending` is the only status a reader writes, and
-- they can hold one at a time.
--
-- Additive: two new tables, nothing existing is altered. Every statement is
-- written to re-run harmlessly.
--
-- Rollback:
--   drop table if exists public.news_source_requests;
--   drop table if exists public.news_sources;
-- ============================================================

-- ------------------------------------------------------------
-- Approved additions to the catalogue
-- ------------------------------------------------------------
create table if not exists public.news_sources (
  -- The id a story is published with (`source_id`), so it is a slug and stable.
  id           text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  name         text not null check (length(btrim(name)) between 1 and 120),
  url          text not null check (url ~* '^https?://'),
  category     text not null
    check (category in ('tech', 'politics', 'religion', 'economy', 'world', 'other')),
  region       text not null check (region in ('arab', 'islamic', 'world')),
  tier         smallint not null default 2 check (tier in (1, 2)),
  -- The window the fetch accepts an item in; null means the default 48 hours.
  fresh_hours  smallint check (fresh_hours between 1 and 336),
  -- Disabling is the way back without deleting a source that published stories.
  enabled      boolean not null default true,
  request_id   uuid,
  approved_by  uuid references auth.users (id) on delete set null,
  approved_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- The fetch reads only enabled rows; one index serves it and the advisory.
create index if not exists idx_news_sources_enabled
  on public.news_sources (enabled) where enabled;

alter table public.news_sources enable row level security;

-- Public read: the picker offers an approved source to every reader, signed in
-- or not, exactly like the repo list. Writes are the Admin's, through the
-- service role (no write policy; the service role bypasses RLS).
revoke all on public.news_sources from anon;
revoke all on public.news_sources from authenticated;
grant select on public.news_sources to anon;
grant select on public.news_sources to authenticated;
grant all on public.news_sources to service_role;

drop policy if exists "news_sources_public_read" on public.news_sources;
create policy "news_sources_public_read"
  on public.news_sources
  for select
  to anon, authenticated
  using (enabled);

drop policy if exists "news_sources_service_role" on public.news_sources;
create policy "news_sources_service_role"
  on public.news_sources
  for all
  to service_role
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- Reader proposals
-- ------------------------------------------------------------
create table if not exists public.news_source_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- The canonicalized feed URL, so the same feed typed twice is the same row.
  url          text not null check (url ~* '^https?://'),
  name         text not null check (length(btrim(name)) between 1 and 120),
  status       text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  -- Filled in at approval: the defaults the Admin confirmed for the prompt.
  category     text check (category in ('tech', 'politics', 'religion', 'economy', 'world', 'other')),
  region       text check (region in ('arab', 'islamic', 'world')),
  tier         smallint check (tier in (1, 2)),
  -- Why it was rejected, or a note for the queue.
  note         text check (note is null or length(note) <= 500),
  reviewed_by  uuid references auth.users (id) on delete set null,
  reviewed_at  timestamptz,
  source_id    text references public.news_sources (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- One open request per reader, and no two open requests for one feed. Both are
-- partial: decided rows stay as the record of what happened.
create unique index if not exists uq_news_source_requests_open_user
  on public.news_source_requests (user_id) where status = 'pending';

create unique index if not exists uq_news_source_requests_open_url
  on public.news_source_requests (url) where status = 'pending';

create index if not exists idx_news_source_requests_status
  on public.news_source_requests (status, created_at desc);

alter table public.news_source_requests enable row level security;

revoke all on public.news_source_requests from anon;
revoke all on public.news_source_requests from authenticated;
grant select, insert on public.news_source_requests to authenticated;
grant all on public.news_source_requests to service_role;

-- A reader sees and files only their own proposal; there is no update policy,
-- so `pending` is the only status a reader can write, and no delete, so the
-- record of a decision cannot be removed by its subject.
drop policy if exists "news_source_requests_own_read" on public.news_source_requests;
create policy "news_source_requests_own_read"
  on public.news_source_requests
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "news_source_requests_own_insert" on public.news_source_requests;
create policy "news_source_requests_own_insert"
  on public.news_source_requests
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending');

drop policy if exists "news_source_requests_service_role" on public.news_source_requests;
create policy "news_source_requests_service_role"
  on public.news_source_requests
  for all
  to service_role
  using (true)
  with check (true);
