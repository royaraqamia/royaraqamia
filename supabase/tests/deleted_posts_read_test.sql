-- A tombstone is not in the public projection of `public.posts` (#1544)
--
-- A delete writes only `deleted_at` (backend/repositories/blogpress/posts.ts),
-- so a published post keeps `status = 'published'` and `community_visible =
-- true` when its author deletes it. The repository filters the tombstone; the
-- SELECT policy is what `anon` reaches through PostgREST with the publishable
-- key, so the public branch has to name it too.
--
-- `20261207130000_hide_deleted_posts_from_public_read.sql` narrows the public
-- branch and leaves the author branch unconditional, which is what keeps
-- `deletePost`'s `update ... returning slug` answering a row. This file pins
-- both halves, and the catalog itself, so a later policy rewrite that drops the
-- tombstone condition fails here rather than in production.
--
-- Run with `supabase test db` against the local stack - see README.md. The whole
-- file rolls back, and the fixtures are seeded with `session_replication_role =
-- replica` so the post triggers stay out of the way.

begin;

create extension if not exists pgtap;

select plan(8);

-- ---------------------------------------------------------------------------
-- The policy: the public branch names the tombstone, and there is only one
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::integer
      from pg_policies
     where schemaname = 'public'
       and tablename = 'posts'
       and cmd = 'SELECT'
       and permissive = 'PERMISSIVE'
  ),
  1,
  'posts carries one permissive SELECT policy'
);

select is(
  (
    select strpos(lower(qual), 'deleted_at is null') > 0
      from pg_policies
     where schemaname = 'public'
       and tablename = 'posts'
       and cmd = 'SELECT'
       and policyname = 'posts_select_own_or_published'
  ),
  true,
  'the public branch of the posts SELECT policy requires deleted_at is null'
);

-- ---------------------------------------------------------------------------
-- Fixtures: a live published post, a published tombstone, a draft tombstone
-- ---------------------------------------------------------------------------

set local session_replication_role = replica;

insert into public.users (id, email, username)
values
  ('00000000-0000-0000-0000-000000001401', 'tombstone-author@example.invalid', 'tombstone-author'),
  ('00000000-0000-0000-0000-000000001402', 'tombstone-stranger@example.invalid', 'tombstone-stranger');

insert into public.posts (id, author_id, slug, content, status, community_visible, deleted_at)
values
  (
    '00000000-0000-0000-0000-000000001411',
    '00000000-0000-0000-0000-000000001401',
    'tombstone-live-published',
    'live',
    'published',
    true,
    null
  ),
  (
    '00000000-0000-0000-0000-000000001412',
    '00000000-0000-0000-0000-000000001401',
    'tombstone-deleted-published',
    'deleted',
    'published',
    true,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000001413',
    '00000000-0000-0000-0000-000000001401',
    'tombstone-deleted-draft',
    'deleted draft',
    'draft',
    false,
    now()
  );

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- anon: the published row only - the tombstone query from the issue answers []
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{}', true);
set local role anon;

select is(
  (
    select count(*)::integer
      from public.posts
     where id = '00000000-0000-0000-0000-000000001411'
  ),
  1,
  'anon reads the live published post'
);

select is(
  (select count(*)::integer from public.posts where deleted_at is not null),
  0,
  'anon reads no tombstoned post, published or not'
);

-- ---------------------------------------------------------------------------
-- A signed-in non-author: the same public projection
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000001402')::text,
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
      from public.posts
     where id = '00000000-0000-0000-0000-000000001412'
  ),
  0,
  'a signed-in non-author reads no deleted published post'
);

select is(
  (
    select count(*)::integer
      from public.posts
     where id = '00000000-0000-0000-0000-000000001411'
  ),
  1,
  'a signed-in non-author still reads the live published post'
);

-- ---------------------------------------------------------------------------
-- The author: their own tombstone, in any state - what deletePost's
-- `update ... returning slug` relies on
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000001401')::text,
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
      from public.posts
     where id = '00000000-0000-0000-0000-000000001412'
  ),
  1,
  'the author still reads their own deleted published post'
);

select is(
  (
    select count(*)::integer
      from public.posts
     where id = '00000000-0000-0000-0000-000000001413'
  ),
  1,
  'the author still reads their own deleted draft'
);

select is(
  (select count(*)::integer from public.posts),
  3,
  'the author reads every post they own, tombstone or not'
);

reset role;

select * from finish();

rollback;
