-- ============================================================
-- Post engagement: likes and comments (#1573)
--
-- The community surfaces have drawn a like and a comment cell since the card
-- was written, inert and labelled «قريبًا». This is the schema behind them.
--
-- Two rules shape it:
--
-- 1. **No denormalised counters.** `posts.like_count` would be a second copy of
--    a number that `post_likes` already answers, written by a trigger and
--    drifting the day one write path forgets it. The counts are aggregates over
--    the rows, read in one call per page of cards (`post_engagement_counts`).
--    A counter column can be added later as an optimisation without changing
--    any client: the aggregate and the column must agree, and only one of them
--    is the truth today.
--
-- 2. **One writer per fact.** A client never inserts a like or a comment row
--    directly: writes go through the API, which runs on the service role and
--    rate-limits per member. The tables therefore grant `select` only, and each
--    write function is `security definer` with `execute` for `service_role`
--    alone - it acts as the member id it is handed, so a client role that could
--    call it could write on somebody else's behalf.
--
-- The edge tables carry the identity; the public reads carry numbers and bodies.
-- A like is not enumerable (`select` is own-rows only), a comment is public
-- while its post is published and visible.
--
-- Rollback:
--   drop function if exists public.post_comment_delete(uuid, uuid);
--   drop function if exists public.post_comment_update(uuid, uuid, text);
--   drop function if exists public.post_comment_create(uuid, uuid, text);
--   drop function if exists public.post_engagement_counts(uuid[]);
--   drop function if exists public.post_like(uuid, uuid, boolean);
--   drop table if exists public.post_comments;
--   drop table if exists public.post_likes;
-- ============================================================

-- ---------------------------------------------------------------- likes
create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- The pair is the primary key, so liking twice is the same row rather than an
  -- error and a retried press needs no read in front of it.
  primary key (post_id, user_id)
);

-- "Everything this member liked", newest first. The count aggregate reads
-- `post_id`, so its index is the primary key's own leftmost column.
create index if not exists idx_post_likes_user_created
  on public.post_likes (user_id, created_at desc);

alter table public.post_likes enable row level security;

-- Own rows only: the count is public, the list of who liked is not.
drop policy if exists "Members read their own likes" on public.post_likes;
create policy "Members read their own likes"
  on public.post_likes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.post_likes from public, anon, authenticated;
grant select on public.post_likes to authenticated;
grant all on public.post_likes to service_role;

-- ------------------------------------------------------------- comments
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  -- A delete is a tombstone (ADR-0029): the row keeps its place in the thread
  -- so a reply is never orphaned, and every read filters it out.
  deleted_at timestamptz,
  constraint post_comments_body_length check (char_length(btrim(body)) between 1 and 2000)
);

-- The thread read: one post, newest first, live rows only.
create index if not exists idx_post_comments_post_created
  on public.post_comments (post_id, created_at desc, id desc)
  where deleted_at is null;

-- "Comments this member wrote", for a future profile listing and for the
-- author's own moderation reads.
create index if not exists idx_post_comments_author_created
  on public.post_comments (author_id, created_at desc);

alter table public.post_comments enable row level security;

-- A comment is public exactly while its post is: the same three conditions the
-- posts policy asks, plus the tombstone the comment itself may carry.
drop policy if exists "Published post comments are public" on public.post_comments;
create policy "Published post comments are public"
  on public.post_comments
  for select
  to anon, authenticated
  using (
    deleted_at is null
    and exists (
      select 1
        from public.posts p
       where p.id = post_comments.post_id
         and p.status = 'published'
         and p.community_visible = true
         and p.deleted_at is null
         and p.published_at is not null
         and p.published_at <= now()
    )
  );

revoke all on public.post_comments from public, anon, authenticated;
grant select on public.post_comments to anon, authenticated;
grant all on public.post_comments to service_role;

-- ------------------------------------------------------- write functions

-- One like press: set the edge, answer the new state and the new number.
--
-- Idempotent by construction - `p_like` is the state wanted, not a toggle, so a
-- retried request cannot flip a like back off.
create or replace function public.post_like(
  p_post_id uuid,
  p_user_id uuid,
  p_like boolean
)
returns table (liked boolean, like_count bigint)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_like boolean := coalesce(p_like, true);
  v_post public.posts%rowtype;
begin
  if p_user_id is null then
    raise exception 'post_like: a member is required' using errcode = '28000';
  end if;

  -- Only a post a reader could open may be liked: a draft, a tombstone or a
  -- hidden post is not there to be reacted to.
  select p.* into v_post
    from public.posts p
   where p.id = p_post_id
     and p.status = 'published'
     and p.community_visible = true
     and p.deleted_at is null
   limit 1;

  if v_post.id is null then
    return query select false, 0::bigint;
    return;
  end if;

  if v_like then
    insert into public.post_likes (post_id, user_id)
    values (p_post_id, p_user_id)
    on conflict (post_id, user_id) do nothing;
  else
    delete from public.post_likes
     where post_id = p_post_id
       and user_id = p_user_id;
  end if;

  return query
    select
      exists (
        select 1 from public.post_likes l
         where l.post_id = p_post_id and l.user_id = p_user_id
      ),
      (select count(*) from public.post_likes l where l.post_id = p_post_id);
end;
$$;

revoke all on function public.post_like(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.post_like(uuid, uuid, boolean) to service_role;

comment on function public.post_like(uuid, uuid, boolean) is
  'Set one member''s like on one public post and answer (liked, like_count). Service-role only: it acts as the member id it is handed (#1573).';

-- One page's numbers, in one call.
--
-- A feed of nine cards must not cost eighteen reads. `stable` so PostgREST and
-- the planner may treat it as a read; the ids the caller does not name are
-- simply absent from the answer, which every client reads as zero.
create or replace function public.post_engagement_counts(p_post_ids uuid[])
returns table (post_id uuid, like_count bigint, comment_count bigint)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    ids.post_id,
    coalesce(likes.total, 0)::bigint,
    coalesce(comments.total, 0)::bigint
  from unnest(p_post_ids) as ids(post_id)
  left join (
    select l.post_id, count(*) as total
      from public.post_likes l
     where l.post_id = any (p_post_ids)
     group by l.post_id
  ) likes on likes.post_id = ids.post_id
  left join (
    select c.post_id, count(*) as total
      from public.post_comments c
     where c.post_id = any (p_post_ids)
       and c.deleted_at is null
     group by c.post_id
  ) comments on comments.post_id = ids.post_id;
$$;

-- Public numbers: the same figures are on the page the visitor is reading.
revoke all on function public.post_engagement_counts(uuid[]) from public;
grant execute on function public.post_engagement_counts(uuid[]) to anon, authenticated, service_role;

comment on function public.post_engagement_counts(uuid[]) is
  'Like and live-comment counts for a set of posts, one row per requested id (#1573).';

-- One comment write, answering the row and the post's new number so the thread
-- updates from the write instead of asking again.
create or replace function public.post_comment_create(
  p_post_id uuid,
  p_author_id uuid,
  p_body text
)
returns table (id uuid, created_at timestamptz, comment_count bigint)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_post public.posts%rowtype;
  v_row public.post_comments%rowtype;
begin
  if p_author_id is null then
    raise exception 'post_comment_create: a member is required' using errcode = '28000';
  end if;

  if v_body = '' then
    raise exception 'post_comment_create: an empty comment' using errcode = '22023';
  end if;

  if char_length(v_body) > 2000 then
    raise exception 'post_comment_create: the comment is too long' using errcode = '22001';
  end if;

  select p.* into v_post
    from public.posts p
   where p.id = p_post_id
     and p.status = 'published'
     and p.community_visible = true
     and p.deleted_at is null
   limit 1;

  if v_post.id is null then
    return;
  end if;

  insert into public.post_comments (post_id, author_id, body)
  values (p_post_id, p_author_id, v_body)
  returning * into v_row;

  return query
    select v_row.id, v_row.created_at,
           (select count(*) from public.post_comments c
             where c.post_id = p_post_id and c.deleted_at is null);
end;
$$;

revoke all on function public.post_comment_create(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.post_comment_create(uuid, uuid, text) to service_role;

comment on function public.post_comment_create(uuid, uuid, text) is
  'Write one comment on a public post and answer its id, its stamp and the post''s live-comment count (#1573). Service-role only.';

-- An edit is the author's own, and the row it edits must still be live.
create or replace function public.post_comment_update(
  p_comment_id uuid,
  p_author_id uuid,
  p_body text
)
returns table (id uuid, body text, edited_at timestamptz)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_row public.post_comments%rowtype;
begin
  if v_body = '' or char_length(v_body) > 2000 then
    raise exception 'post_comment_update: the body is not a comment' using errcode = '22023';
  end if;

  update public.post_comments c
     set body = v_body,
         edited_at = now()
   where c.id = p_comment_id
     and c.author_id = p_author_id
     and c.deleted_at is null
  returning * into v_row;

  if v_row.id is null then
    return;
  end if;

  return query select v_row.id, v_row.body, v_row.edited_at;
end;
$$;

revoke all on function public.post_comment_update(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.post_comment_update(uuid, uuid, text) to service_role;

comment on function public.post_comment_update(uuid, uuid, text) is
  'Edit one live comment the member wrote, and answer the row it rewrote (#1573). Service-role only.';

-- A delete tombstones, and answers the post's count so the button settles.
create or replace function public.post_comment_delete(
  p_comment_id uuid,
  p_author_id uuid
)
returns table (post_id uuid, comment_count bigint)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_post_id uuid;
begin
  update public.post_comments c
     set deleted_at = now()
   where c.id = p_comment_id
     and c.author_id = p_author_id
     and c.deleted_at is null
  returning c.post_id into v_post_id;

  if v_post_id is null then
    return;
  end if;

  return query
    select v_post_id,
           (select count(*) from public.post_comments c
             where c.post_id = v_post_id and c.deleted_at is null);
end;
$$;

revoke all on function public.post_comment_delete(uuid, uuid) from public, anon, authenticated;
grant execute on function public.post_comment_delete(uuid, uuid) to service_role;

comment on function public.post_comment_delete(uuid, uuid) is
  'Tombstone one live comment the member wrote, and answer the post''s new live-comment count (#1573). Service-role only.';
