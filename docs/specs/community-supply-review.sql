-- The community supply review (#1952). Run read-only:
--   npx supabase db query --linked -f docs/specs/community-supply-review.sql
-- The thresholds and how to read the result are in community-supply-review.md.

-- Q1: distinct authors with a published post (threshold: 3)
select count(distinct author_id) as authors
from public.posts
where status = 'published'
  and deleted_at is null;

-- Q2: posts by source kind, new posts only (threshold: artifact >= 30 %)
select coalesce(source_kind, 'hand') as source, count(*) as posts
from public.posts
where created_at >= now() - interval '60 days'
group by 1
order by posts desc;

-- Q3: artifact drafts that became posts (reversal: > 80 % never publish)
select
  coalesce(source_kind, 'hand') as source,
  count(*) filter (where status = 'published') as published,
  count(*) filter (where status in ('draft', 'scheduled')) as still_draft,
  count(*) filter (where deleted_at is not null) as deleted
from public.posts
where created_at >= now() - interval '60 days'
group by 1
order by 1;

-- Q4: live comments per published post (threshold: at least 1 on any post)
select
  p.id,
  p.slug,
  p.source_kind,
  count(c.id) as comments
from public.posts p
left join public.post_comments c
  on c.post_id = p.id and c.deleted_at is null
where p.status = 'published'
  and p.deleted_at is null
group by p.id, p.slug, p.source_kind
order by comments desc, p.published_at desc;

-- Q5: follow edges per active member
select
  u.id,
  u.username,
  count(f.follower_id) as followers
from public.users u
left join public.follows f on f.followee_id = u.id
where u.verified
  and not u.is_hidden
  and u.last_seen_at >= now() - interval '30 days'
group by u.id, u.username
order by followers desc, u.username;
