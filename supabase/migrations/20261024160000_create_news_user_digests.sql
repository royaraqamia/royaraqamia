-- ============================================================
-- A reader's own daily digest, generated from their source selection
--
-- Stage 3 (ADR-0079). The shared digest stays exactly as it is: one fetch, one
-- prompt, one validator. A reader who opts in gets a *second*, smaller digest
-- built from the same fetched candidates, restricted to their sources, written
-- after the shared one by the same workflow. This is per-recipient output of one
-- published artifact, not a second fetch: no feed is read twice and no URL is
-- invented, because the same validator gates both.
--
-- Opt-in is a column on the selection, not a new table: `personal_enabled` is
-- false until the reader asks, so nobody is charged for a digest they never
-- requested. Generation is metered at publish time (`news.digest.generate`,
-- 5 credits) — a run that produces nothing costs nothing.
--
-- Retention matches the shared digest: 30 Damascus days, then deleted by the
-- sweep this migration schedules.
--
-- Additive: one column, two tables, one function, one cron job. Every statement
-- is written to re-run harmlessly.
--
-- Rollback:
--   select cron.unschedule('news-user-digests-sweep');
--   drop function if exists public.sweep_news_user_digests();
--   drop table if exists public.news_user_stories;
--   drop table if exists public.news_user_digests;
--   alter table public.news_source_preferences drop column if exists personal_enabled;
--   delete from public.usage_action_costs where action_key = 'news.digest.generate';
-- ============================================================

-- ------------------------------------------------------------
-- Opt-in
-- ------------------------------------------------------------
alter table public.news_source_preferences
  add column if not exists personal_enabled boolean not null default false;

comment on column public.news_source_preferences.personal_enabled is
  'True once the reader asked for a digest of their own; the nightly run reads it.';

-- ------------------------------------------------------------
-- One digest per reader per day
-- ------------------------------------------------------------
create table if not exists public.news_user_digests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  digest_date   date not null,
  title         text not null,
  lede          text not null,
  story_count   smallint not null default 0 check (story_count >= 0),
  model         text not null,
  run_url       text,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  -- A re-run for the same reader and day replaces that row rather than adding one.
  constraint news_user_digests_user_date_key unique (user_id, digest_date)
);

create table if not exists public.news_user_stories (
  id                  uuid primary key default gen_random_uuid(),
  digest_id           uuid not null references public.news_user_digests (id) on delete cascade,
  position            smallint not null check (position > 0),
  category            text not null
    check (category in ('tech', 'politics', 'religion', 'economy', 'world', 'other')),
  region              text not null check (region in ('arab', 'islamic', 'world')),
  headline_ar         text not null,
  summary_ar          text not null,
  why_it_matters_ar   text,
  source_id           text not null,
  source_name         text not null,
  source_url          text not null,
  source_published_at timestamptz,
  created_at          timestamptz not null default now(),
  constraint news_user_stories_digest_position_key unique (digest_id, position)
);

-- The page reads one reader's latest digest, then its stories.
create index if not exists idx_news_user_digests_user
  on public.news_user_digests (user_id, digest_date desc);

create index if not exists idx_news_user_stories_digest
  on public.news_user_stories (digest_id, position);

alter table public.news_user_digests enable row level security;
alter table public.news_user_stories enable row level security;

-- Own rows only. No admin policy and no anon read: a personal digest says what
-- one reader chose to read, which is not an operator's business.
revoke all on public.news_user_digests from anon, authenticated;
revoke all on public.news_user_stories from anon, authenticated;
grant select on public.news_user_digests to authenticated;
grant select on public.news_user_stories to authenticated;
grant all on public.news_user_digests to service_role;
grant all on public.news_user_stories to service_role;

drop policy if exists "news_user_digests_own_read" on public.news_user_digests;
create policy "news_user_digests_own_read"
  on public.news_user_digests
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "news_user_stories_own_read" on public.news_user_stories;
create policy "news_user_stories_own_read"
  on public.news_user_stories
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.news_user_digests d
      where d.id = news_user_stories.digest_id
        and d.user_id = (select auth.uid())
    )
  );

drop policy if exists "news_user_digests_service_role" on public.news_user_digests;
create policy "news_user_digests_service_role"
  on public.news_user_digests
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "news_user_stories_service_role" on public.news_user_stories;
create policy "news_user_stories_service_role"
  on public.news_user_stories
  for all
  to service_role
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- Metering: one generated personal digest costs 5 credits
-- ------------------------------------------------------------
insert into public.usage_action_costs (action_key, label_ar, cost, sort_order)
values ('news.digest.generate', 'إنشاء مُلخَّص شخصي', 5, 140)
on conflict (action_key) do nothing;

-- ------------------------------------------------------------
-- Thirty-day retention, the same rule as the shared digest
-- ------------------------------------------------------------
create or replace function public.sweep_news_user_digests()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  delete from public.news_user_digests
  where digest_date < (now() at time zone 'Asia/Damascus')::date - 30;
end;
$fn$;

revoke execute on function public.sweep_news_user_digests()
  from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'news-user-digests-sweep') then
    perform cron.schedule(
      'news-user-digests-sweep',
      '30 4 * * *',
      $$select public.sweep_news_user_digests()$$
    );
  end if;
end;
$do$;
