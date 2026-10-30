-- ============================================================
-- A reader's own sources: accepted on resolution, capped by plan, pruned when broken (ADR-0106)
--
-- ADR-0105 made submission a promise ("we will work out what this link is") and
-- left the answer going into the public catalogue through an Admin. That is the
-- wrong destination for a personal list: a reader who wants a quiet blog to
-- themselves should not be waiting on a queue, and the catalogue should not
-- grow by ten feeds a day because ten readers tried something.
--
-- So a resolved request now becomes a *private* source for the reader who filed
-- it: `news_user_sources`, invisible to everyone else, fetched for their own
-- digest only. The catalogue keeps its own path — an Admin still decides what
-- every reader is offered — and a `needs_review` row can be sent to either.
--
-- Layout:
--   * `news_user_sources` — one row per reader per feed, with the health the
--     fetch reports back (`failure_count`, `last_checked_at`, `broken`).
--   * `accept_news_private_source` — the worker's one transaction: the private
--     source and the request's approval commit together.
--   * the approval RPC gains `p_destination` (`private` or `catalogue`), so the
--     Admin's queue can answer either way.
--
-- Quota: `news.private.sources` (Free 1, Pro 10) is a `plan_quotas` row and a
-- trigger, like `news.sources`: the readable refusal is the service's, the
-- enforcement is the database's.
--
-- Rollback:
--   drop trigger if exists assert_news_private_source_cap on public.news_user_sources;
--   drop function if exists private.assert_news_private_source_cap();
--   drop function if exists private.touch_news_user_source();
--   drop function if exists public.accept_news_private_source(uuid, text, text);
--   alter table public.news_source_requests drop column if exists user_source_id;
--   drop table if exists public.news_user_sources;
--   delete from public.plan_quotas where key = 'news.private.sources';
--   (re-create the approval RPC from 20261030130000 with its old signature)
-- ============================================================

-- ------------------------------------------------------------
-- The quota: how many private sources a plan may keep
-- ------------------------------------------------------------
insert into public.plan_quotas
  (key, label_ar, visitor_cap, free_cap, pro_cap, sort_order) values
  ('news.private.sources', 'مصادر أخبار خاصّة بك', 0, 1, 10, 30)
on conflict (key) do update
  set label_ar = excluded.label_ar,
      visitor_cap = excluded.visitor_cap,
      free_cap = excluded.free_cap,
      pro_cap = excluded.pro_cap,
      sort_order = excluded.sort_order,
      updated_at = now();

-- ------------------------------------------------------------
-- A reader's own feeds
-- ------------------------------------------------------------
create table if not exists public.news_user_sources (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  -- The proposal that produced it, kept as the audit trail.
  request_id     uuid references public.news_source_requests (id) on delete set null,
  name           text not null check (length(btrim(name)) between 1 and 120),
  -- The *resolved* feed (or Telegram preview), never the link as pasted.
  url            text not null check (url ~* '^https?://'),
  kind           text not null default 'feed' check (kind in ('feed', 'telegram')),
  -- A private source has no Admin to classify it, and the prompt needs both.
  category       text not null default 'other'
    check (category in ('tech', 'politics', 'religion', 'economy', 'world', 'other')),
  region         text not null default 'world' check (region in ('arab', 'islamic', 'world')),
  tier           smallint not null default 2 check (tier in (1, 2)),
  fresh_hours    smallint check (fresh_hours between 1 and 336),
  -- `broken` stops the fetch and is what the owner is told about; nothing is
  -- deleted, so it can be repaired by asking again.
  status         text not null default 'ready' check (status in ('ready', 'broken')),
  failure_count  smallint not null default 0 check (failure_count >= 0),
  last_error     text check (last_error is null or length(last_error) <= 500),
  last_checked_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- One reader cannot hold the same feed twice; two readers may each hold it.
  unique (user_id, url)
);

-- The digest fetch reads ready rows only.
create index if not exists idx_news_user_sources_ready
  on public.news_user_sources (user_id) where status = 'ready';

-- The account page lists one reader's sources, newest first.
create index if not exists idx_news_user_sources_owner
  on public.news_user_sources (user_id, created_at desc);

alter table public.news_user_sources enable row level security;

revoke all on public.news_user_sources from anon;
revoke all on public.news_user_sources from authenticated;
grant select, delete on public.news_user_sources to authenticated;
grant all on public.news_user_sources to service_role;

-- A reader sees and removes their own sources. There is no insert policy: a
-- source is created by the resolver, after the reader's URL has been read, and
-- a reader who could write one would be able to point the fetch anywhere.
drop policy if exists "news_user_sources_own_read" on public.news_user_sources;
create policy "news_user_sources_own_read"
  on public.news_user_sources
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "news_user_sources_own_delete" on public.news_user_sources;
create policy "news_user_sources_own_delete"
  on public.news_user_sources
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "news_user_sources_service_role" on public.news_user_sources;
create policy "news_user_sources_service_role"
  on public.news_user_sources
  for all
  to service_role
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- The plan's ceiling, enforced where a row is created
-- ------------------------------------------------------------
create or replace function private.assert_news_private_source_cap()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_admin boolean;
  v_plan text;
  v_cap integer;
  v_held integer;
begin
  -- An Admin's own list is not what the plan pays for.
  select coalesce(u.is_admin, false) into v_admin
    from public.users u where u.id = new.user_id;

  if coalesce(v_admin, false) then
    return new;
  end if;

  v_plan := private.effective_plan(new.user_id);

  select case when v_plan = 'pro' then pro_cap else free_cap end into v_cap
    from public.plan_quotas
   where key = 'news.private.sources';

  if v_cap is null then
    return new;
  end if;

  -- Re-adding a feed the reader already holds is an update, not a new slot; the
  -- insert's `on conflict ... do update` still fires this BEFORE INSERT trigger,
  -- so a reader at the cap would otherwise be unable to refresh their own row.
  if exists (
    select 1 from public.news_user_sources s
     where s.user_id = new.user_id and s.url = new.url
  ) then
    return new;
  end if;

  select count(*)::integer into v_held
    from public.news_user_sources s
   where s.user_id = new.user_id;

  if v_held >= v_cap then
    raise exception 'the plan private-source cap is reached'
      using errcode = 'PL001',
            detail = 'news.private.sources',
            hint = v_cap::text;
  end if;

  return new;
end;
$$;

revoke all on function private.assert_news_private_source_cap() from public;
revoke all on function private.assert_news_private_source_cap() from anon;
revoke all on function private.assert_news_private_source_cap() from authenticated;

drop trigger if exists assert_news_private_source_cap on public.news_user_sources;
create trigger assert_news_private_source_cap
  before insert on public.news_user_sources
  for each row execute function private.assert_news_private_source_cap();

create or replace function private.touch_news_user_source()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_news_user_source() from public;
revoke all on function private.touch_news_user_source() from anon;
revoke all on function private.touch_news_user_source() from authenticated;

drop trigger if exists touch_news_user_source on public.news_user_sources;
create trigger touch_news_user_source
  before update on public.news_user_sources
  for each row execute function private.touch_news_user_source();

comment on table public.news_user_sources is
  'A feed one reader added for their own digest. Never part of the shared catalogue, never visible to another reader (ADR-0106).';
comment on column public.news_user_sources.failure_count is
  'Consecutive failed fetches reported by the digest fetch; reset to 0 on the first success.';
comment on column public.news_user_sources.status is
  'broken at three consecutive failures: the fetch stops and the owner is told (ADR-0106).';

-- ------------------------------------------------------------
-- A request may hold several sources now, one per URL
-- ------------------------------------------------------------
alter table public.news_source_requests
  add column if not exists user_source_id uuid
    references public.news_user_sources (id) on delete set null;

-- Both partial indexes are redefined in place. `uq_..._open_user` becomes the
-- real constraint (one open request per reader per URL); `uq_..._open_url` stops
-- being unique, because two readers asking for one feed is now legitimate.
drop index if exists public.uq_news_source_requests_open_user;
create unique index uq_news_source_requests_open_user
  on public.news_source_requests (user_id, url)
  where status in ('resolving', 'ready', 'needs_review');

drop index if exists public.uq_news_source_requests_open_url;
create index uq_news_source_requests_open_url
  on public.news_source_requests (url)
  where status in ('resolving', 'ready', 'needs_review');

comment on index public.uq_news_source_requests_open_user is
  'One open request per reader per URL. It was one open request per reader before ADR-0106.';
comment on index public.uq_news_source_requests_open_url is
  'An ordinary index now: two readers may each add the same feed to their own list.';

-- ------------------------------------------------------------
-- The worker's one transaction: resolve and accept in the same write
-- ------------------------------------------------------------
create or replace function public.accept_news_private_source(
  p_request_id uuid,
  p_kind text,
  p_resolved_url text
)
returns table (
  id uuid,
  url text,
  name text,
  status text,
  kind text,
  resolved_url text,
  failure text,
  failure_detail text,
  attempts smallint,
  resolved_at timestamptz,
  category text,
  region text,
  tier smallint,
  note text,
  created_at timestamptz,
  reviewed_at timestamptz,
  source_id text,
  user_source_id uuid
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_request public.news_source_requests%rowtype;
  v_source_id uuid;
begin
  if p_kind not in ('feed', 'telegram') then
    raise exception 'unknown source kind' using errcode = 'NS005';
  end if;

  if p_resolved_url is null or p_resolved_url !~* '^https?://' then
    raise exception 'an accepted source needs the feed it is fetched from' using errcode = 'NS004';
  end if;

  select * into v_request
    from public.news_source_requests r
   where r.id = p_request_id
     for update;

  if not found then
    raise exception 'news source request not found' using errcode = 'P0002';
  end if;

  -- Only an unresolved row becomes a source; a decided one is left alone, so a
  -- second worker run is a no-op rather than a second row.
  if v_request.status not in ('resolving', 'ready') then
    raise exception 'news source request is already decided' using errcode = 'NS002';
  end if;

  insert into public.news_user_sources (user_id, request_id, name, url, kind)
  values (v_request.user_id, v_request.id, v_request.name, p_resolved_url, p_kind)
  -- The same feed resolved twice for one reader is one source.
  on conflict (user_id, url) do update set name = excluded.name
  returning id into v_source_id;

  update public.news_source_requests r
     set status = 'approved',
         kind = p_kind,
         resolved_url = p_resolved_url,
         user_source_id = v_source_id,
         attempts = r.attempts + 1,
         resolved_at = coalesce(r.resolved_at, now())
   where r.id = p_request_id;

  return query
    select r.id, r.url, r.name, r.status, r.kind, r.resolved_url, r.failure,
           r.failure_detail, r.attempts, r.resolved_at, r.category, r.region,
           r.tier, r.note, r.created_at, r.reviewed_at, r.source_id,
           r.user_source_id
      from public.news_source_requests r
     where r.id = p_request_id;
end;
$$;

revoke all on function public.accept_news_private_source(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.accept_news_private_source(uuid, text, text) to service_role;

-- ------------------------------------------------------------
-- An Admin answering a needs_review row chooses the destination
-- ------------------------------------------------------------
-- The return type gains `user_source_id`, so the function is replaced rather
-- than redefined in place.
drop function if exists public.approve_news_source_request(
  uuid, text, text, text, text, text, smallint, text, uuid, text);

create or replace function public.approve_news_source_request(
  p_request_id uuid,
  p_source_id text,
  p_source_name text,
  p_source_url text,
  p_category text,
  p_region text,
  p_tier smallint,
  p_note text,
  p_reviewed_by uuid,
  p_kind text default 'feed',
  p_destination text default 'catalogue'
)
returns table (
  id uuid,
  url text,
  name text,
  status text,
  kind text,
  resolved_url text,
  failure text,
  failure_detail text,
  attempts smallint,
  resolved_at timestamptz,
  category text,
  region text,
  tier smallint,
  note text,
  created_at timestamptz,
  reviewed_at timestamptz,
  source_id text,
  user_source_id uuid
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_request public.news_source_requests%rowtype;
  v_constraint text;
  v_user_source_id uuid;
begin
  if p_destination not in ('private', 'catalogue') then
    raise exception 'unknown destination' using errcode = 'NS005';
  end if;

  select * into v_request
    from public.news_source_requests r
   where r.id = p_request_id
     for update;

  if not found then
    raise exception 'news source request not found' using errcode = 'P0002';
  end if;

  if v_request.status not in ('ready', 'needs_review') then
    raise exception 'news source request is not open for a decision' using errcode = 'NS002';
  end if;

  if p_source_url is null or p_source_url !~* '^https?://' then
    raise exception 'an approved source needs the feed it is fetched from' using errcode = 'NS004';
  end if;

  if p_destination = 'private' then
    -- The reader's own list: no slug to choose, no catalogue URL to collide
    -- with. The plan's cap is the trigger's answer.
    insert into public.news_user_sources (user_id, request_id, name, url, kind, category, region, tier)
    values (
      v_request.user_id,
      v_request.id,
      p_source_name,
      p_source_url,
      p_kind,
      p_category,
      p_region,
      p_tier
    )
    on conflict (user_id, url) do update set name = excluded.name
    returning id into v_user_source_id;

    update public.news_source_requests r
       set status = 'approved',
           kind = p_kind,
           resolved_url = p_source_url,
           resolved_at = coalesce(r.resolved_at, now()),
           user_source_id = v_user_source_id,
           category = p_category,
           region = p_region,
           tier = p_tier,
           note = p_note,
           reviewed_by = p_reviewed_by,
           reviewed_at = now()
     where r.id = p_request_id;
  else
    begin
      insert into public.news_sources (
        id, name, url, kind, category, region, tier, request_id, approved_by
      ) values (
        p_source_id, p_source_name, p_source_url, p_kind, p_category, p_region,
        p_tier, p_request_id, p_reviewed_by
      );
    exception
      when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'news_sources_url_key' then
          raise exception 'this feed already has an approved source' using errcode = 'NS003';
        end if;
        raise exception 'the source id is taken' using errcode = 'NS001';
    end;

    update public.news_source_requests r
       set status = 'approved',
           kind = p_kind,
           resolved_url = p_source_url,
           resolved_at = coalesce(r.resolved_at, now()),
           category = p_category,
           region = p_region,
           tier = p_tier,
           note = p_note,
           reviewed_by = p_reviewed_by,
           reviewed_at = now(),
           source_id = p_source_id
     where r.id = p_request_id;
  end if;

  return query
    select r.id, r.url, r.name, r.status, r.kind, r.resolved_url, r.failure,
           r.failure_detail, r.attempts, r.resolved_at, r.category, r.region,
           r.tier, r.note, r.created_at, r.reviewed_at, r.source_id,
           r.user_source_id
      from public.news_source_requests r
     where r.id = p_request_id;
end;
$$;

revoke all on function public.approve_news_source_request(
  uuid, text, text, text, text, text, smallint, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.approve_news_source_request(
  uuid, text, text, text, text, text, smallint, text, uuid, text, text) to service_role;

comment on column public.news_source_requests.user_source_id is
  'The private source an accepted request created, when it was not sent to the catalogue.';
