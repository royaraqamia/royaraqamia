-- ============================================================
-- Publishing a News Digest is one transaction (#602)
--
-- `scripts/news/publish-digest.mjs` used to write a day's digest across four
-- independent PostgREST requests: upsert the digest with `story_count = 0`,
-- delete its stories, insert the new ones, then patch `story_count`. PostgREST
-- has no transaction across requests, so a failure after the delete — a network
-- error, an expired connection, a story row the constraints refuse — left the
-- day's digest in place with no stories, or left the *previously published*
-- digest's stories deleted. The workflow deliberately supports a manual re-run
-- for a failed day, so that path aims at an existing good digest as well as a
-- fresh one, and losing the good one is the worse half.
--
-- The ordering did keep a digest from claiming stories it did not have; it could
-- not keep a digest from losing stories it did have. Only one transaction can.
--
-- `publish_news_digest` does the whole write at once:
--
--   1. upsert `news_digests` by `digest_date`, so a re-run keeps the same day's
--      row and its id rather than publishing a second digest;
--   2. delete that digest's existing stories;
--   3. insert the supplied stories against the digest id;
--   4. set `story_count` to the number of rows step 3 inserted;
--   5. return the digest id and that count.
--
-- A failure anywhere — including one story row failing a check or the unique
-- `(digest_id, position)` — rolls all four steps back, so the digest a reader
-- sees is either the previous day's publication or the new one, never a digest
-- with zero stories and never a half-replaced story list.
--
-- The upsert's conflict path takes the row lock, which is also the serialisation
-- point: two runs for the same day queue on it, and the second one replaces the
-- first's stories instead of interleaving a delete and an insert with them.
--
-- Rollback:
--   drop function if exists public.publish_news_digest(jsonb, jsonb);
-- ============================================================

create or replace function public.publish_news_digest(p_digest jsonb, p_stories jsonb)
returns table (
  digest_id uuid,
  story_count integer
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_digest_id uuid;
  v_count integer;
begin
  if p_digest is null
     or jsonb_typeof(p_digest) <> 'object'
     or jsonb_typeof(p_stories) is distinct from 'array'
  then
    raise exception 'a digest object and a stories array are required'
      using errcode = '22023';
  end if;

  insert into public.news_digests (
    digest_date, title, lede, story_count, model, run_url, published_at
  ) values (
    (p_digest ->> 'digest_date')::date,
    p_digest ->> 'title',
    p_digest ->> 'lede',
    0,
    p_digest ->> 'model',
    p_digest ->> 'run_url',
    coalesce((p_digest ->> 'published_at')::timestamptz, now())
  )
  on conflict (digest_date) do update
    set title = excluded.title,
        lede = excluded.lede,
        model = excluded.model,
        run_url = excluded.run_url,
        published_at = excluded.published_at,
        story_count = 0
  returning id into v_digest_id;

  -- The re-run path: the day's stories are replaced wholesale, inside the same
  -- transaction as the delete, so an insert that fails brings them back.
  delete from public.news_stories s where s.digest_id = v_digest_id;

  insert into public.news_stories (
    digest_id,
    position,
    category,
    region,
    headline_ar,
    summary_ar,
    why_it_matters_ar,
    source_id,
    source_name,
    source_url,
    source_published_at
  )
  select
    v_digest_id,
    (s ->> 'position')::smallint,
    s ->> 'category',
    s ->> 'region',
    s ->> 'headline_ar',
    s ->> 'summary_ar',
    nullif(s ->> 'why_it_matters_ar', ''),
    s ->> 'source_id',
    s ->> 'source_name',
    s ->> 'source_url',
    nullif(s ->> 'source_published_at', '')::timestamptz
  from jsonb_array_elements(p_stories) as s;

  get diagnostics v_count = row_count;

  update public.news_digests d
     set story_count = v_count
   where d.id = v_digest_id;

  return query select v_digest_id, v_count;
end;
$$;

-- The publishing workflow is the only writer: it runs with the service role.
-- No session role may call it, so a signed-in reader cannot rewrite the day's
-- news with a `POST /rpc/publish_news_digest`.
revoke all on function public.publish_news_digest(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_news_digest(jsonb, jsonb) to service_role;
