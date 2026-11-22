-- The two public counters answer only for public rows (#1690)
--
-- `post_engagement_counts` and `follow_counts` are `security definer` and keep
-- their `anon` grant: the edge tables are not readable signed-out, so the
-- function is the only way a visitor draws a number. That makes the predicate
-- inside the function the access control, not the caller's own filter.
--
-- Run with `supabase test db` against the local stack - see README.md. The
-- whole file rolls back; fixtures use `session_replication_role = replica` so
-- post and follow triggers stay out of the way.

begin;

create extension if not exists pgtap;

select plan(12);

-- ---------------------------------------------------------------------------
-- Fixtures: one public row of each kind, and one of every kind that is not
-- public. All of them carry edges, so a leak is a wrong number, not an empty
-- aggregate that could be explained away.
-- ---------------------------------------------------------------------------

set local session_replication_role = replica;

insert into public.users (id, email, username, verified, is_hidden)
values
  (
    '00000000-0000-0000-0000-00000000c101',
    'counter-visible@example.invalid',
    'counter-visible',
    true,
    false
  ),
  (
    '00000000-0000-0000-0000-00000000c102',
    'counter-member@example.invalid',
    'counter-member',
    true,
    false
  ),
  (
    '00000000-0000-0000-0000-00000000c103',
    'counter-hidden@example.invalid',
    'counter-hidden',
    true,
    true
  ),
  (
    '00000000-0000-0000-0000-00000000c104',
    'counter-unverified@example.invalid',
    'counter-unverified',
    false,
    false
  );

insert into public.posts (id, author_id, slug, content, status, published_at, community_visible, deleted_at)
values
  (
    '00000000-0000-0000-0000-00000000c201',
    '00000000-0000-0000-0000-00000000c101',
    'counter-live',
    'live',
    'published',
    now(),
    true,
    null
  ),
  (
    '00000000-0000-0000-0000-00000000c202',
    '00000000-0000-0000-0000-00000000c101',
    'counter-draft',
    'draft',
    'draft',
    null,
    true,
    null
  ),
  (
    '00000000-0000-0000-0000-00000000c203',
    '00000000-0000-0000-0000-00000000c101',
    'counter-community-hidden',
    'hidden post',
    'published',
    now(),
    false,
    null
  ),
  (
    '00000000-0000-0000-0000-00000000c204',
    '00000000-0000-0000-0000-00000000c101',
    'counter-future',
    'future',
    'published',
    now() + interval '1 day',
    true,
    null
  ),
  (
    '00000000-0000-0000-0000-00000000c205',
    '00000000-0000-0000-0000-00000000c101',
    'counter-tombstone',
    'deleted',
    'published',
    now(),
    true,
    now()
  );

insert into public.post_likes (post_id, user_id)
values
  ('00000000-0000-0000-0000-00000000c201', '00000000-0000-0000-0000-00000000c101'),
  ('00000000-0000-0000-0000-00000000c201', '00000000-0000-0000-0000-00000000c102'),
  ('00000000-0000-0000-0000-00000000c202', '00000000-0000-0000-0000-00000000c101'),
  ('00000000-0000-0000-0000-00000000c202', '00000000-0000-0000-0000-00000000c102'),
  ('00000000-0000-0000-0000-00000000c203', '00000000-0000-0000-0000-00000000c101'),
  ('00000000-0000-0000-0000-00000000c204', '00000000-0000-0000-0000-00000000c101'),
  ('00000000-0000-0000-0000-00000000c205', '00000000-0000-0000-0000-00000000c101');

insert into public.post_comments (id, post_id, author_id, body, deleted_at)
values
  (
    '00000000-0000-0000-0000-00000000c301',
    '00000000-0000-0000-0000-00000000c201',
    '00000000-0000-0000-0000-00000000c102',
    'live',
    null
  ),
  (
    '00000000-0000-0000-0000-00000000c302',
    '00000000-0000-0000-0000-00000000c201',
    '00000000-0000-0000-0000-00000000c102',
    'deleted',
    now()
  ),
  (
    '00000000-0000-0000-0000-00000000c303',
    '00000000-0000-0000-0000-00000000c202',
    '00000000-0000-0000-0000-00000000c102',
    'draft comment',
    null
  );

insert into public.follows (follower_id, followee_id)
values
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000c101'),
  ('00000000-0000-0000-0000-00000000c104', '00000000-0000-0000-0000-00000000c101'),
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c102'),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000c103'),
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c104');

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- The grant stays: these are the numbers a signed-out feed and profile draw
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('anon', 'public.post_engagement_counts(uuid[])', 'execute'),
  'anon keeps execute on post_engagement_counts'
);

select ok(
  has_function_privilege('anon', 'public.follow_counts(uuid[])', 'execute'),
  'anon keeps execute on follow_counts'
);

-- ---------------------------------------------------------------------------
-- Every call below is the call a visitor makes with the publishable key
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{}', true);
set local role anon;

select results_eq(
  $$
    select post_id, like_count, comment_count
      from public.post_engagement_counts(array['00000000-0000-0000-0000-00000000c201'::uuid])
  $$,
  $$
    values (
      '00000000-0000-0000-0000-00000000c201'::uuid,
      2::bigint,
      1::bigint
    )
  $$,
  'a published visible post answers its live like and comment numbers'
);

select is(
  (
    select count(*)::integer
      from public.post_engagement_counts(array['00000000-0000-0000-0000-00000000c202'::uuid])
  ),
  0,
  'a draft with two likes and a live comment answers no row'
);

select is(
  (
    select count(*)::integer
      from public.post_engagement_counts(array['00000000-0000-0000-0000-00000000c203'::uuid])
  ),
  0,
  'a published post hidden from the community answers no row'
);

select is(
  (
    select count(*)::integer
      from public.post_engagement_counts(array['00000000-0000-0000-0000-00000000c204'::uuid])
  ),
  0,
  'a published post whose published_at is in the future answers no row'
);

select is(
  (
    select count(*)::integer
      from public.post_engagement_counts(array['00000000-0000-0000-0000-00000000c205'::uuid])
  ),
  0,
  'a tombstoned published post answers no row'
);

select results_eq(
  $$
    select post_id
      from public.post_engagement_counts(array[
        '00000000-0000-0000-0000-00000000c201'::uuid,
        '00000000-0000-0000-0000-00000000c202'::uuid,
        '00000000-0000-0000-0000-00000000c203'::uuid,
        '00000000-0000-0000-0000-00000000c204'::uuid,
        '00000000-0000-0000-0000-00000000c205'::uuid
      ])
  $$,
  $$ values ('00000000-0000-0000-0000-00000000c201'::uuid) $$,
  'a mixed batch answers only the public post'
);

select results_eq(
  $$
    select user_id, followers, following
      from public.follow_counts(array['00000000-0000-0000-0000-00000000c101'::uuid])
  $$,
  $$
    values (
      '00000000-0000-0000-0000-00000000c101'::uuid,
      2::bigint,
      1::bigint
    )
  $$,
  'a listed member answers the same follower and following numbers as the profile'
);

select is(
  (
    select count(*)::integer
      from public.follow_counts(array['00000000-0000-0000-0000-00000000c103'::uuid])
  ),
  0,
  'a hidden member answers no row, even with edges'
);

select is(
  (
    select count(*)::integer
      from public.follow_counts(array['00000000-0000-0000-0000-00000000c104'::uuid])
  ),
  0,
  'an unconfirmed member answers no row, even with edges'
);

select results_eq(
  $$
    select user_id
      from public.follow_counts(array[
        '00000000-0000-0000-0000-00000000c101'::uuid,
        '00000000-0000-0000-0000-00000000c103'::uuid,
        '00000000-0000-0000-0000-00000000c104'::uuid
      ])
  $$,
  $$ values ('00000000-0000-0000-0000-00000000c101'::uuid) $$,
  'a mixed batch answers only the listed member'
);

reset role;

select * from finish();

rollback;
