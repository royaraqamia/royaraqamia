-- ============================================================
-- A pasted URL is resolved into a feed after the fact (ADR-0105)
--
-- A reader does not know what RSS is. The form used to refuse anything that did
-- not answer with a feed *while they waited*, which turned "which link do I
-- have?" into a failed submission. The promise is now inverted: any http(s) URL
-- is accepted, stored as `resolving`, and a worker resolves it into a fetchable
-- feed (a site's autodiscovered RSS, a YouTube channel's own feed, a Telegram
-- channel's public preview) or marks it `needs_review` with the reason.
--
-- The states a row moves through:
--
--   resolving    just filed; the worker has not answered yet
--   ready        resolved to a feed the fetch can read; an Admin still decides
--   needs_review the worker could not convert it (Facebook, X, Instagram, a page
--                with no feed) — an Admin pastes the real feed URL to resolve it
--   approved     an Admin accepted it; `news_sources` now holds the fetch row
--   rejected     an Admin refused it
--
-- `resolving`, `ready` and `needs_review` are "open" for both partial unique
-- indexes: one open request per reader and per URL, exactly as `pending` was.
--
-- Backfill: a `pending` row was already probed as a feed, so the URL it carries
-- is its own resolved feed — it becomes `ready` rather than being re-fetched.
-- Every `approved` row predates `resolved_url`, so the feed the Admin approved is
-- the row's `url`.
--
-- Sources gain `kind`, because not every fetchable source is an XML document: a
-- Telegram channel is read through its public preview HTML. `feed` is the
-- default and covers every row that existed.
--
-- Rollback (data first, then shape):
--   alter table public.news_source_requests alter column status set default 'pending';
--   update public.news_source_requests set status = 'pending'
--    where status in ('resolving', 'ready', 'needs_review');
--   alter table public.news_source_requests drop constraint if exists news_source_requests_status_check;
--   alter table public.news_source_requests add constraint news_source_requests_status_check
--     check (status in ('pending', 'approved', 'rejected'));
--   drop function if exists public.approve_news_source_request(
--     uuid, text, text, text, text, text, smallint, text, uuid, text);
--   (re-create the previous body from 20261025100000_approve_news_source_request.sql)
--   alter table public.news_sources drop column if exists kind;
--   alter table public.news_source_requests
--     drop column if exists kind,
--     drop column if exists resolved_url,
--     drop column if exists failure,
--     drop column if exists failure_detail,
--     drop column if exists attempts,
--     drop column if exists resolved_at;
-- ============================================================

-- ------------------------------------------------------------
-- What the worker filled in
-- ------------------------------------------------------------
alter table public.news_source_requests
  add column if not exists kind text check (kind in ('feed', 'telegram')),
  add column if not exists resolved_url text check (resolved_url is null or resolved_url ~* '^https?://'),
  add column if not exists failure text check (failure in ('unsupported', 'no-feed', 'unreachable')),
  add column if not exists failure_detail text
    check (failure_detail is null or length(failure_detail) <= 500),
  add column if not exists attempts smallint not null default 0,
  add column if not exists resolved_at timestamptz;

-- How a fetchable source is read: an XML feed, or a Telegram channel preview.
alter table public.news_sources
  add column if not exists kind text not null default 'feed'
    check (kind in ('feed', 'telegram'));

-- ------------------------------------------------------------
-- The status machine
-- ------------------------------------------------------------
alter table public.news_source_requests
  drop constraint if exists news_source_requests_status_check;

-- `pending` meant "probed and waiting"; every such row really is a feed.
update public.news_source_requests
   set status = 'ready',
       kind = 'feed',
       resolved_url = url,
       resolved_at = now()
 where status = 'pending';

-- An approval predates `resolved_url`; the URL the Admin approved is the feed.
update public.news_source_requests
   set kind = 'feed',
       resolved_url = url
 where status = 'approved'
   and resolved_url is null;

alter table public.news_source_requests
  add constraint news_source_requests_status_check
  check (status in ('resolving', 'ready', 'needs_review', 'approved', 'rejected'));

-- The column's own default follows the new first state, so an insert that omits
-- `status` is a filed proposal rather than an invalid row.
alter table public.news_source_requests
  alter column status set default 'resolving';

-- A row an Admin may approve has to name the feed it approves; `resolving` and
-- `needs_review` are the states where that is exactly what is still missing.
alter table public.news_source_requests
  drop constraint if exists news_source_requests_resolved_url_required;
alter table public.news_source_requests
  add constraint news_source_requests_resolved_url_required
  check (status not in ('ready', 'approved') or resolved_url is not null);

-- ------------------------------------------------------------
-- "Open" is three states now, not one
-- ------------------------------------------------------------
drop index if exists public.uq_news_source_requests_open_user;
create unique index uq_news_source_requests_open_user
  on public.news_source_requests (user_id)
  where status in ('resolving', 'ready', 'needs_review');

drop index if exists public.uq_news_source_requests_open_url;
create unique index uq_news_source_requests_open_url
  on public.news_source_requests (url)
  where status in ('resolving', 'ready', 'needs_review');

-- The worker's own read: the oldest unresolved rows first.
create index if not exists idx_news_source_requests_resolving
  on public.news_source_requests (created_at)
  where status = 'resolving';

-- A reader files a `resolving` row and nothing else; the worker writes with the
-- service role, so the new columns are not something a session can set.
drop policy if exists "news_source_requests_own_insert" on public.news_source_requests;
create policy "news_source_requests_own_insert"
  on public.news_source_requests
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id and status = 'resolving');

-- ------------------------------------------------------------
-- Approval: `ready` or `needs_review`, and the feed is now a decision
-- ------------------------------------------------------------
-- The return type grows (kind, resolved_url, failure, failure_detail, attempts,
-- resolved_at), and a function's OUT columns cannot be replaced in place.
drop function if exists public.approve_news_source_request(
  uuid, text, text, text, text, text, smallint, text, uuid);

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
  p_kind text default 'feed'
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
  source_id text
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_request public.news_source_requests%rowtype;
  v_constraint text;
begin
  -- The row lock is the serialisation point: a second approval of this request
  -- waits here and then reads a decided status instead of writing a second
  -- source.
  select * into v_request
    from public.news_source_requests r
   where r.id = p_request_id
     for update;

  if not found then
    raise exception 'news source request not found' using errcode = 'P0002';
  end if;

  -- `resolving` is not decidable yet, and a decided row is final.
  if v_request.status not in ('ready', 'needs_review') then
    raise exception 'news source request is not open for a decision' using errcode = 'NS002';
  end if;

  if p_source_url is null or p_source_url !~* '^https?://' then
    raise exception 'an approved source needs the feed it is fetched from' using errcode = 'NS004';
  end if;

  begin
    insert into public.news_sources (
      id,
      name,
      url,
      kind,
      category,
      region,
      tier,
      request_id,
      approved_by
    ) values (
      p_source_id,
      p_source_name,
      p_source_url,
      p_kind,
      p_category,
      p_region,
      p_tier,
      p_request_id,
      p_reviewed_by
    );
  exception
    when unique_violation then
      -- The index that refused says which collision this is: the feed is already
      -- approved, or the id was taken between the catalogue read and this call.
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'news_sources_url_key' then
        raise exception 'this feed already has an approved source' using errcode = 'NS003';
      end if;
      raise exception 'the source id is taken' using errcode = 'NS001';
  end;

  update public.news_source_requests r
     set status = 'approved',
         -- The Admin may have pasted the feed a `needs_review` row lacked, and
         -- the decision is what makes it the resolved one.
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

  return query
    select r.id,
           r.url,
           r.name,
           r.status,
           r.kind,
           r.resolved_url,
           r.failure,
           r.failure_detail,
           r.attempts,
           r.resolved_at,
           r.category,
           r.region,
           r.tier,
           r.note,
           r.created_at,
           r.reviewed_at,
           r.source_id
      from public.news_source_requests r
     where r.id = p_request_id;
end;
$$;

-- Admin-only, and only through the service-role client that `withAdminUser`
-- guards: an approval decides another reader's record, so no session role may
-- call it even for its own request.
revoke all on function public.approve_news_source_request(
  uuid, text, text, text, text, text, smallint, text, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_news_source_request(
  uuid, text, text, text, text, text, smallint, text, uuid, text) to service_role;

comment on column public.news_source_requests.kind is
  'How the resolved source is fetched: an XML feed, or a Telegram channel preview (ADR-0105).';
comment on column public.news_source_requests.failure is
  'Why the worker could not convert the URL; null unless the row is needs_review.';
comment on column public.news_sources.kind is
  'How the fetch reads this source: an XML feed, or a Telegram channel preview (ADR-0105).';
