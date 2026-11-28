# Community supply review (60 days)

The artifact door and the supply-first roster (#1952) are a bet with a review
date, not a permanent design. Sixty days after it ships, these five named
queries answer whether the bet paid: distinct authors, where posts came from,
whether artifact drafts became posts, comments per post, and how many follow
edges the active members carry. Run them read-only with:

```bash
npx supabase db query --linked -f docs/specs/community-supply-review.sql
```

Every `source_kind` that is null is a post written in the composer, which is the
comparison group: the artifact door is kept only while its posts are opened and
published at least as often as hand-written ones.

## Q1 — Distinct published authors

The threshold is **3** (from 1). Below it the roster stays limited to authors.

```sql
-- Q1: distinct authors with a published post
select count(distinct author_id) as authors
from public.posts
where status = 'published'
  and deleted_at is null;
```

## Q2 — Posts by source kind

The threshold is **30 % or more** of new posts originating from a note or an
answer (`note` + `answer` over all posts created in the window).

```sql
-- Q2: posts by source kind, new posts only
select coalesce(source_kind, 'hand') as source, count(*) as posts
from public.posts
where created_at >= now() - interval '60 days'
group by 1
order by posts desc;
```

## Q3 — Drafts published versus abandoned

This is the reversal signal: **more than 80 % of artifact drafts never
publishing** means the door is a funnel, not supply.

```sql
-- Q3: artifact drafts that became posts
select
  coalesce(source_kind, 'hand') as source,
  count(*) filter (where status = 'published') as published,
  count(*) filter (where status in ('draft', 'scheduled')) as still_draft,
  count(*) filter (where deleted_at is not null) as deleted
from public.posts
where created_at >= now() - interval '60 days'
group by 1
order by 1;
```

## Q4 — Comments per post

The threshold is **at least 1** comment on any post (from 0).

```sql
-- Q4: live comments per published post
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
```

## Q5 — Follow edges per active member

Reads the social half: whether the roster's follow control produces edges now
that it only names authors. `last_seen_at` is ADR 0212's stamp; a member who has
not opened the site in 30 days is not an active member for this count.

```sql
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
```

## How to read the result

- **Keep the door** when Q1 reaches 3, Q2 is at least 30 %, and Q3's published
  share clears 20 %.
- **Reverse it** when artifact posts are opened at a lower rate than hand-written
  ones over the same window, or when more than 80 % of artifact drafts never
  publish. The community then returns to being a publication with no social
  affordances, and the roster filter (Q1) is the only part that stays.
