-- ============================================================
-- Approving a source request is one transaction (#572)
--
-- `NewsSourceAdminService.approve` used to write two rows in two requests: the
-- Approved Source, then the request's decision. Nothing tied them together, so a
-- failure between the two left an approved source whose request was still
-- `pending`; retrying recomputed the slug from a catalogue that already held the
-- orphan, inserted `<base>-2` for the same URL, and the picker could offer a
-- source whose stories the fetch's URL dedupe would always drop.
--
-- `approve_news_source_request` does both writes in one transaction: it locks the
-- request row, refuses anything but `pending`, inserts the source, moves the
-- request to `approved` and returns the decided row. A failure anywhere rolls
-- back both halves, so the request is still `pending` and the retry is safe.
--
-- Typed refusals, so the service can answer the Admin instead of a 500:
--   P0002 — no such request
--   NS001 — the source id is taken (the caller retries with the next suffix)
--   NS002 — the request was already decided
--   NS003 — this feed already has an approved source
--
-- Rollback:
--   drop function if exists public.approve_news_source_request(
--     uuid, text, text, text, text, text, smallint, text, uuid);
--   drop index if exists public.news_sources_url_key;
-- ============================================================

-- One feed, one Approved Source. The approval RPC is the only writer, so the
-- index is what makes a second row for a URL impossible even if two approvals
-- for the same feed run at once.
create unique index if not exists news_sources_url_key on public.news_sources (url);

create or replace function public.approve_news_source_request(
  p_request_id uuid,
  p_source_id text,
  p_source_name text,
  p_source_url text,
  p_category text,
  p_region text,
  p_tier smallint,
  p_note text,
  p_reviewed_by uuid
)
returns table (
  id uuid,
  url text,
  name text,
  status text,
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

  if v_request.status <> 'pending' then
    raise exception 'news source request was already decided' using errcode = 'NS002';
  end if;

  begin
    insert into public.news_sources (
      id,
      name,
      url,
      category,
      region,
      tier,
      request_id,
      approved_by
    ) values (
      p_source_id,
      p_source_name,
      p_source_url,
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
  uuid, text, text, text, text, text, smallint, text, uuid) from public, anon, authenticated;
grant execute on function public.approve_news_source_request(
  uuid, text, text, text, text, text, smallint, text, uuid) to service_role;
