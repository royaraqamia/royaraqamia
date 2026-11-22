-- ============================================================
-- Public counters answer only for public rows (#1690)
--
-- Both aggregate RPCs are `security definer` and granted to `anon`: the edge
-- tables they read are not readable without an account, so a visitor's only
-- way to draw a number is through the function. Neither body enforced the
-- boundary its own comment promised, though. `post_engagement_counts` counted
-- likes and comments for any id it was handed, including drafts, scheduled or
-- tombstoned posts; `follow_counts` answered for any member row, including one
-- hidden from the directory and one whose address is not confirmed.
--
-- The predicates below are the existing public projections, not new policy:
--
-- - a post is public when it passes the same four conditions the posts SELECT
--   policy and `post_comments`' policy use (20261208130000, 20261212120000);
-- - a member's profile is public when the public profile loader would open it
--   (`backend/loaders/community.ts`: verified and not hidden, ADR-0127), which
--   is also the rule `follow_edge` applies before writing an edge
--   (20261129120000).
--
-- An id outside those projections answers no row, which both callers already
-- read as zero (`post-engagement-repository.ts`, `follows-repository.ts`). The
-- grant stays: signed-out feed cards and profile headers are meant to draw
-- these numbers, and the privilege is not the leak - the missing predicate was.
--
-- Deliberate advisor finding: `anon_security_definer_function_executable`
-- still applies to both functions. Revoking `anon` would delete the public
-- count and send the feed back to per-card authenticated reads; switching to
-- `security invoker` would fail outright because `anon` has no grant on
-- `post_likes`, `post_comments` or `follows`. The predicates above are the
-- boundary, and `supabase/tests/counter_rpc_visibility_test.sql` asserts both
-- directions.
--
-- Rollback: replace each function body with the version in
-- 20261212120000_post_engagement.sql and 20261128120000_community_follows.sql.
-- ============================================================

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
  join public.posts p on p.id = ids.post_id
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
  ) comments on comments.post_id = ids.post_id
 where p.status = 'published'
   and p.community_visible
   and p.deleted_at is null
   and p.published_at <= now();
$$;

comment on function public.post_engagement_counts(uuid[]) is
  'Like and live-comment counts for a set of publicly visible posts, one row per visible id (#1573, #1690).';

revoke all on function public.post_engagement_counts(uuid[]) from public;
grant execute on function public.post_engagement_counts(uuid[]) to anon, authenticated, service_role;

create or replace function public.follow_counts(p_user_ids uuid[])
returns table (user_id uuid, followers bigint, following bigint)
language sql
stable
security definer
set search_path = 'public'
as $$
  select u.id,
         (select count(*) from public.follows f where f.followee_id = u.id),
         (select count(*) from public.follows f where f.follower_id = u.id)
    from public.users u
   where u.id = any(p_user_ids)
     and u.verified is true
     and u.is_hidden is false;
$$;

comment on function public.follow_counts(uuid[]) is
  'Follower and following counts for a set of listed members, in one read. Aggregate only: the lists themselves are RLS-scoped to their owner (#1690).';

revoke all on function public.follow_counts(uuid[]) from public;
grant execute on function public.follow_counts(uuid[]) to anon, authenticated, service_role;
