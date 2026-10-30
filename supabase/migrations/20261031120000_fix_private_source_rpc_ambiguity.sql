-- ============================================================
-- The two source RPCs could not read their own conflict target
--
-- `accept_news_private_source` and the private branch of
-- `approve_news_source_request` both write `news_user_sources` with
-- `on conflict (user_id, url) do update`. Their RETURNS TABLE declares `url` as
-- an OUT parameter, so inside the body `url` is a PL/pgSQL variable as well as a
-- column — and the conflict target is an expression list, where Postgres refuses
-- to guess:
--
--   42702: column reference "url" is ambiguous
--          It could refer to either a PL/pgSQL variable or a table column.
--
-- Every private-source write failed with that error. The catalogue branch never
-- touches `news_user_sources`, which is why it kept working, and why the unit
-- tests (which stub the RPC away) could not see it: the defect lived in the
-- statement the stub replaced.
--
-- Found by `scripts/news/smoke-private-sources.mjs` against the deployment, on
-- the first run of the path that had ever reached Postgres.
--
-- The fix is the directive Postgres provides for exactly this: `use_column`
-- reads an ambiguous bare identifier as the column. The OUT parameter names are
-- the API's field names, so renaming them would rename the response.
--
-- Rollback: re-create both functions from 20261030150000 (without the
-- directive), which restores the ambiguity.
-- ============================================================

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
#variable_conflict use_column
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

  if v_request.status not in ('resolving', 'ready') then
    raise exception 'news source request is already decided' using errcode = 'NS002';
  end if;

  insert into public.news_user_sources (user_id, request_id, name, url, kind)
  values (v_request.user_id, v_request.id, v_request.name, p_resolved_url, p_kind)
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
#variable_conflict use_column
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

revoke all on function public.accept_news_private_source(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.accept_news_private_source(uuid, text, text) to service_role;

revoke all on function public.approve_news_source_request(
  uuid, text, text, text, text, text, smallint, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.approve_news_source_request(
  uuid, text, text, text, text, text, smallint, text, uuid, text, text) to service_role;

comment on function public.accept_news_private_source(uuid, text, text) is
  'The resolver''s one transaction: resolve and accept a request as a private source (ADR-0106).';
