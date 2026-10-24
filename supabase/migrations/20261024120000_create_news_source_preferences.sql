-- ============================================================
-- A reader's own news sources (/news → /account/news)
--
-- The daily digest is one shared, validated artifact (ADR-0076): this table
-- never changes what the workflow fetches, only which of the published stories a
-- signed-in reader sees. It stores the ids of the sources they kept, not the
-- hidden ones, so a source approved later (stage 2) is visible by default rather
-- than silently hidden from every reader who saved a selection before it existed.
--
-- A reader with no row, or with an empty selection, sees the full digest; the
-- page also falls back to the full digest when a selection leaves fewer than
-- NEWS_PERSONAL_MIN_STORIES stories, so a reader can never filter their way into
-- an empty morning. The ids are validated against the catalogue in
-- `data/news/sources.json` (plus approved additions) before the write, so a bad
-- id cannot hide anything; the catalogue is deliberately not duplicated here.
--
-- Additive: one new table, nothing existing is altered. Every statement is
-- written to re-run harmlessly.
--
-- Rollback:
--   drop table if exists public.news_source_preferences;
-- ============================================================

create table if not exists public.news_source_preferences (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  -- The sources this reader kept. Empty means "everything", which is also what
  -- an absent row means: the default is the digest the workflow published.
  source_ids  text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  -- A ceiling, not a catalogue: the digest is drawn from far fewer sources, and
  -- an unbounded array is an unbounded write.
  constraint news_source_preferences_source_ids_len check (cardinality(source_ids) <= 64)
);

comment on table public.news_source_preferences is
  'Per-reader source selection for /news; filters the shared digest, never the fetch.';

alter table public.news_source_preferences enable row level security;

-- Own-row only, like every other per-user table (20260807150000). Admins have no
-- business reading one reader's selection, so there is no admin policy.
drop policy if exists "news_source_preferences_own_read" on public.news_source_preferences;
create policy "news_source_preferences_own_read"
  on public.news_source_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "news_source_preferences_own_insert" on public.news_source_preferences;
create policy "news_source_preferences_own_insert"
  on public.news_source_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "news_source_preferences_own_update" on public.news_source_preferences;
create policy "news_source_preferences_own_update"
  on public.news_source_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.news_source_preferences from anon;
grant select, insert, update on public.news_source_preferences to authenticated;
