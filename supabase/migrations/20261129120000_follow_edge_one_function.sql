-- ============================================================
-- The follow write is one function (#1374)
--
-- A follow press took ~1.7 s warm and an unfollow ~2.0 s. The write path made
-- six or seven network hops in sequence - resolve the handle, read the block,
-- check the limiter, insert, read the viewer for the notification body, then
-- the counts aggregate - and every one of them is a round trip between the
-- serverless function and Postgres.
--
-- None of those reads needs its answer in JavaScript. "Does this handle name a
-- member the directory lists", "has either side blocked the other", "write the
-- edge once" and "what are the numbers now" are one statement's work, and one
-- call answers all four. The rate limit stays outside, in the service: it
-- decides whether a write may happen at all, so it has to finish first - and
-- Upstash is not reachable from Postgres.
--
-- Security definer, EXECUTE granted to service_role alone: the function acts as
-- the `p_follower_id` it is handed, so a client role that could call it could
-- follow on somebody else's behalf. The route already runs on the admin client
-- for the adjacent reason - it sees hidden and unconfirmed rows in order to
-- refuse them, which the public directory's reads filter out.
--
-- Rollback:
--   drop function if exists public.follow_edge(uuid, text, boolean);
-- ============================================================

create or replace function public.follow_edge(
  p_follower_id uuid,
  p_username text,
  p_follow boolean
)
returns table (
  outcome text,
  target_id uuid,
  wrote boolean,
  viewer_name text,
  viewer_username text,
  target_followers bigint,
  target_following bigint
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_target public.users%rowtype;
  v_follow boolean := coalesce(p_follow, true);
  v_outcome text := 'ok';
  v_blocked boolean := false;
  v_wrote boolean := false;
  v_rows integer;
  v_viewer_name text;
  v_viewer_username text;
  v_followers bigint;
  v_following bigint;
begin
  -- "Not a member the directory lists" answers the same not_found as "no such
  -- handle": a hidden or unconfirmed row must not be distinguishable from an
  -- absent one here, or this call becomes the way to find them.
  select u.*
    into v_target
    from public.users u
   where u.username = lower(btrim(p_username))
   limit 1;

  if v_target.id is null or v_target.verified is not true or v_target.is_hidden is true then
    return query
      select 'not_found'::text, null::uuid, false, null::text, null::text, 0::bigint, 0::bigint;
    return;
  end if;

  if v_target.id = p_follower_id then
    v_outcome := 'self';
  elsif v_follow then
    -- A block in either direction forbids the edge. Blocking already severs an
    -- existing edge in trg_sever_follows_on_block; this is about the write.
    select exists (
      select 1
        from public.blocks b
       where (b.blocker_id = p_follower_id and b.blocked_id = v_target.id)
          or (b.blocker_id = v_target.id and b.blocked_id = p_follower_id)
    )
      into v_blocked;

    if v_blocked then
      v_outcome := 'blocked';
    end if;
  end if;

  if v_outcome = 'ok' then
    if v_follow then
      -- The pair is the primary key, so the conflict is the repeat: a call that
      -- writes no row is one whose recipient has been told already. Two
      -- concurrent follows of one pair still insert once, and exactly one of
      -- them is told it is new.
      insert into public.follows (follower_id, followee_id)
      values (p_follower_id, v_target.id)
      on conflict (follower_id, followee_id) do nothing;

      get diagnostics v_rows = row_count;
      v_wrote := v_rows > 0;

      -- Only the call that wrote the edge names the follower: the notification
      -- is the one thing about a follow that needs the viewer's row at all.
      if v_wrote then
        select u.name, u.username
          into v_viewer_name, v_viewer_username
          from public.users u
         where u.id = p_follower_id;
      end if;
    else
      delete from public.follows
       where follower_id = p_follower_id
         and followee_id = v_target.id;
    end if;
  end if;

  -- After the write, so the header updates from this answer instead of asking
  -- again. The same two numbers `follow_counts` aggregates, for one member.
  select (select count(*) from public.follows f where f.followee_id = v_target.id),
         (select count(*) from public.follows f where f.follower_id = v_target.id)
    into v_followers, v_following;

  return query
    select v_outcome, v_target.id, v_wrote, v_viewer_name, v_viewer_username, v_followers, v_following;
end;
$$;

-- Service role only. `revoke ... from public` is the grant Postgres would
-- otherwise leave open: a function is executable by PUBLIC unless it says so.
revoke all on function public.follow_edge(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.follow_edge(uuid, text, boolean) to service_role;

comment on function public.follow_edge(uuid, text, boolean) is
  'Resolve the handle, refuse a self/blocked/hidden target, write or remove the edge and answer the target''s counts, in one call (#1374). Service-role only: it acts as the follower it is given.';
