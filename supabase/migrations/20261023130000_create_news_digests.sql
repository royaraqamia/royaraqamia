-- ============================================================
-- The daily world-news digest (/news)
--
-- One Digest per Damascus day, written once by the GitHub workflow
-- (.github/workflows/news-digest.yml) with the service role after a model
-- summary of a fixed, repo-versioned source list. Every Digest owns its Stories;
-- the page reads a Digest plus its Stories and filters by category.
--
-- Two tables rather than one JSON blob because the page searches and filters:
-- Arabic has no usable Postgres text-search configuration here, so search is a
-- trigram ILIKE over headline and summary (the pattern of 20260809085258) and the
-- filtering is plain SQL. `digest_date` is unique on purpose : a re-run for the
-- same day replaces that day rather than publishing a second one.
--
-- Nothing is user-authored: the workflow writes with the service role, browsers
-- only read. Reads are public (the page is public and no account gates it), and
-- the retention sweep in 20261023130200 is the only writer that deletes.
--
-- Additive: two new tables, nothing existing is altered. Every statement is
-- written to re-run harmlessly.
--
-- Rollback:
--   drop table if exists public.news_stories;
--   drop table if exists public.news_digests;
-- ============================================================

create table if not exists public.news_digests (
  id            uuid primary key default gen_random_uuid(),
  -- The Damascus calendar day the digest reports on. A date, not a timestamp:
  -- "which day's news is this" is the reader's question, and the workflow's own
  -- clock (03:00 UTC = 06:00 Damascus) is what decides the boundary.
  digest_date   date not null,
  title         text not null,
  -- The two-or-three sentence lede above the story list.
  lede          text not null,
  story_count   smallint not null default 0 check (story_count >= 0),
  -- Which model and which run produced it, so a bad digest can be traced back to
  -- the run that wrote it without reading the Actions log.
  model         text not null,
  run_url       text,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint news_digests_digest_date_key unique (digest_date)
);

create table if not exists public.news_stories (
  id                  uuid primary key default gen_random_uuid(),
  digest_id           uuid not null references public.news_digests (id) on delete cascade,
  -- Where the story sits in its digest; the digest's own ordering, not a ranking
  -- the client recalculates.
  position            smallint not null check (position > 0),
  category            text not null
    check (category in ('tech', 'politics', 'religion', 'economy', 'world', 'other')),
  region              text not null check (region in ('arab', 'islamic', 'world')),
  headline_ar         text not null,
  summary_ar          text not null,
  -- Optional: one line on why the story matters, which is what keeps the digest
  -- from reading as a link list.
  why_it_matters_ar   text,
  -- The feed the story came from, as scripts/news/sources.json names it, so the
  -- source list stays versioned in the repo instead of in a table.
  source_id           text not null,
  source_name         text not null,
  source_url          text not null,
  source_published_at timestamptz,
  created_at          timestamptz not null default now(),
  constraint news_stories_digest_position_key unique (digest_id, position)
);

-- The page reads a day's stories in digest order: one index serves it and the
-- cascade delete the retention sweep performs.
create index if not exists idx_news_stories_digest
  on public.news_stories (digest_id, position);

-- The workflow's cross-day duplicate check reads recent source URLs.
create index if not exists idx_news_stories_source_url
  on public.news_stories (source_url);

-- The search box. A two-column trigram GIN matches `.or(headline_ar.ilike,
-- summary_ar.ilike)`; Postgres does not ship an Arabic text-search configuration,
-- so trigrams are the honest option for partial Arabic words. The opclass is
-- schema-qualified because pg_trgm lives in `extensions` (20261011110000), not in
-- the migration's search path.
create index if not exists idx_news_stories_search_trgm
  on public.news_stories using gin (
    headline_ar extensions.gin_trgm_ops,
    summary_ar extensions.gin_trgm_ops
  );

alter table public.news_digests enable row level security;
alter table public.news_stories enable row level security;

-- Anyone may read the digest (the page is public); only the service role writes.
revoke all on public.news_digests from anon;
revoke all on public.news_digests from authenticated;
grant select on public.news_digests to anon;
grant select on public.news_digests to authenticated;
grant all on public.news_digests to service_role;

revoke all on public.news_stories from anon;
revoke all on public.news_stories from authenticated;
grant select on public.news_stories to anon;
grant select on public.news_stories to authenticated;
grant all on public.news_stories to service_role;

drop policy if exists "news_digests_public_read" on public.news_digests;
create policy "news_digests_public_read"
  on public.news_digests
  for select
  to anon, authenticated
  using (true);

drop policy if exists "news_digests_service_role" on public.news_digests;
create policy "news_digests_service_role"
  on public.news_digests
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "news_stories_public_read" on public.news_stories;
create policy "news_stories_public_read"
  on public.news_stories
  for select
  to anon, authenticated
  using (true);

drop policy if exists "news_stories_service_role" on public.news_stories;
create policy "news_stories_service_role"
  on public.news_stories
  for all
  to service_role
  using (true)
  with check (true);
