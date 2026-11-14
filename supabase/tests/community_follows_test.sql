-- Assertions for the one writer of `public.follows` (#1379).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- `public.follow_edge` decides every rule a follow has: the follower, the
-- directory check (verified, not hidden), a block in either direction and the
-- write itself. The table's own INSERT/DELETE grants let a signed-in client
-- POST or DELETE through the Data API with its own JWT, where the policies only
-- checked `follower_id` - no block, no directory, no rate limit.
--
-- Everything below runs as the role the request would use, so a refusal is the
-- grant answering the request a client makes, and the whole file rolls back.
-- `follow_edge` itself is exercised on the service role, the way the service
-- calls it.

begin;

create extension if not exists pgtap;

select plan(29);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

set local session_replication_role = replica;

insert into public.users (id, email, username, verified, is_hidden)
values
  (
    '00000000-0000-0000-0000-00000000f101',
    'ff-viewer@example.invalid',
    'ff-viewer',
    true,
    false
  ),
  (
    '00000000-0000-0000-0000-00000000f102',
    'ff-author@example.invalid',
    'ff-author',
    true,
    false
  ),
  (
    '00000000-0000-0000-0000-00000000f103',
    'ff-blocked@example.invalid',
    'ff-blocked',
    true,
    false
  ),
  (
    '00000000-0000-0000-0000-00000000f104',
    'ff-hidden@example.invalid',
    'ff-hidden',
    true,
    true
  ),
  (
    '00000000-0000-0000-0000-00000000f105',
    'ff-unverified@example.invalid',
    'ff-unverified',
    false,
    false
  );

-- The viewer has blocked this member, so the edge is forbidden in either
-- direction while the block row exists.
insert into public.blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000f103');

-- One published, community-visible post by the member the viewer will follow.
-- The feed assertion needs a row the view can return.
insert into public.posts (id, author_id, slug, status, published_at, community_visible)
values (
  '00000000-0000-0000-0000-00000000f201',
  '00000000-0000-0000-0000-00000000f102',
  'ff-followed-post',
  'published',
  now(),
  true
);

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- The write privilege is gone, and the read is not
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('authenticated', 'public.follows', 'insert'),
  'authenticated has no table-wide INSERT on follows'
);

select ok(
  not has_table_privilege('authenticated', 'public.follows', 'update'),
  'authenticated has no table-wide UPDATE on follows'
);

select ok(
  not has_table_privilege('authenticated', 'public.follows', 'delete'),
  'authenticated has no table-wide DELETE on follows'
);

select ok(
  not has_table_privilege('anon', 'public.follows', 'insert'),
  'anon has no table-wide INSERT on follows'
);

select ok(
  not has_table_privilege('anon', 'public.follows', 'update'),
  'anon has no table-wide UPDATE on follows'
);

select ok(
  not has_table_privilege('anon', 'public.follows', 'delete'),
  'anon has no table-wide DELETE on follows'
);

select ok(
  not has_table_privilege('anon', 'public.follows', 'select'),
  'anon has no table-wide SELECT on follows, which no guest surface reads'
);

select ok(
  has_table_privilege('authenticated', 'public.follows', 'select'),
  'authenticated keeps SELECT for security_invoker following_feed'
);

select ok(
  has_table_privilege('service_role', 'public.follows', 'insert'),
  'service_role keeps INSERT, which public.follow_edge writes with'
);

select ok(
  has_table_privilege('service_role', 'public.follows', 'delete'),
  'service_role keeps DELETE, which an unfollow needs'
);

select is(
  (
    select count(*)::integer
      from pg_policies
     where schemaname = 'public'
       and tablename = 'follows'
       and cmd in ('INSERT', 'DELETE')
  ),
  2,
  'the insert and delete policies stay as defence in depth'
);

select ok(
  not has_function_privilege('anon', 'public.follow_edge(uuid,text,boolean)', 'execute'),
  'anon cannot call the one writer'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.follow_edge(uuid,text,boolean)',
    'execute'
  ),
  'authenticated cannot call the one writer that acts as the follower it is given'
);

select ok(
  has_function_privilege('service_role', 'public.follow_edge(uuid,text,boolean)', 'execute'),
  'service_role can call the one writer'
);

-- ---------------------------------------------------------------------------
-- A member cannot write the graph straight through the Data API
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000f101')::text,
  true
);

set local role authenticated;

-- The policy predicate would hold - the follower is the caller and the target
-- is a listed member - so this is the grant refusing, not a row the policy
-- would have rejected.
select throws_ok(
  $$
    insert into public.follows (follower_id, followee_id)
    values (
      '00000000-0000-0000-0000-00000000f101',
      '00000000-0000-0000-0000-00000000f102'
    )
  $$,
  '42501',
  null,
  'a member cannot POST a follow through the Data API'
);

select throws_ok(
  $$
    delete from public.follows
     where follower_id = '00000000-0000-0000-0000-00000000f101'
  $$,
  '42501',
  null,
  'a member cannot DELETE a follow through the Data API'
);

select is(
  (select count(*)::integer from public.following_feed),
  0,
  'the feed reads for a member with no follows'
);

reset role;

-- ---------------------------------------------------------------------------
-- The one writer follows, does not double-write, and unfollows
-- ---------------------------------------------------------------------------

set local role service_role;

select results_eq(
  $$
    select outcome, wrote, target_id
      from public.follow_edge(
        '00000000-0000-0000-0000-00000000f101',
        'ff-author',
        true
      )
  $$,
  $$ values ('ok'::text, true, '00000000-0000-0000-0000-00000000f102'::uuid) $$,
  'service_role follows a listed member through follow_edge'
);

reset role;

select is(
  (
    select count(*)::integer
      from public.follows
     where follower_id = '00000000-0000-0000-0000-00000000f101'
       and followee_id = '00000000-0000-0000-0000-00000000f102'
  ),
  1,
  'the follow wrote the edge'
);

set local role authenticated;

select is(
  (select count(*)::integer from public.following_feed),
  1,
  'the security_invoker feed returns the followee''s post'
);

reset role;

set local role service_role;

select results_eq(
  $$
    select outcome, wrote
      from public.follow_edge(
        '00000000-0000-0000-0000-00000000f101',
        'ff-author',
        true
      )
  $$,
  $$ values ('ok'::text, false) $$,
  'a second follow is the same edge, and does not report a new write'
);

select results_eq(
  $$
    select outcome, wrote
      from public.follow_edge(
        '00000000-0000-0000-0000-00000000f101',
        'ff-author',
        false
      )
  $$,
  $$ values ('ok'::text, false) $$,
  'service_role unfollows through follow_edge'
);

reset role;

select is(
  (
    select count(*)::integer
      from public.follows
     where follower_id = '00000000-0000-0000-0000-00000000f101'
  ),
  0,
  'the pair is written once and removed once'
);

set local role authenticated;

select is(
  (select count(*)::integer from public.following_feed),
  0,
  'the feed loses the post when the edge is gone'
);

reset role;

-- ---------------------------------------------------------------------------
-- The refusals live in the one writer
-- ---------------------------------------------------------------------------

set local role service_role;

select results_eq(
  $$
    select outcome, wrote
      from public.follow_edge(
        '00000000-0000-0000-0000-00000000f101',
        'ff-hidden',
        true
      )
  $$,
  $$ values ('not_found'::text, false) $$,
  'a hidden member is refused as not_found'
);

select results_eq(
  $$
    select outcome, wrote
      from public.follow_edge(
        '00000000-0000-0000-0000-00000000f101',
        'ff-unverified',
        true
      )
  $$,
  $$ values ('not_found'::text, false) $$,
  'an unconfirmed member is refused as not_found'
);

select results_eq(
  $$
    select outcome, wrote
      from public.follow_edge(
        '00000000-0000-0000-0000-00000000f101',
        'ff-blocked',
        true
      )
  $$,
  $$ values ('blocked'::text, false) $$,
  'a block in either direction forbids the edge'
);

select results_eq(
  $$
    select outcome, wrote
      from public.follow_edge(
        '00000000-0000-0000-0000-00000000f101',
        'ff-viewer',
        true
      )
  $$,
  $$ values ('self'::text, false) $$,
  'a member cannot follow themselves'
);

reset role;

select is(
  (select count(*)::integer from public.follows),
  0,
  'none of the refused attempts wrote a row'
);

select * from finish();

rollback;
