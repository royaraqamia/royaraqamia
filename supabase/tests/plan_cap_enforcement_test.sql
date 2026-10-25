-- Assertions for the plan caps and the post publication rules (#526).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- The fixtures deliberately skip the Auth schema: a cap only needs a `user_id`
-- the plan resolver can answer for, and `private.plan_window` treats an unknown
-- uuid as `free`. Rows are therefore seeded with `session_replication_role =
-- replica`, which switches the foreign keys and the very triggers under test
-- off, and then the role goes back to `origin` for the assertions.
--
-- Every write below is either expected to be refused or happens inside the
-- transaction this file rolls back, so nothing is left behind.
--
-- A cap refusal carries SQLSTATE `PL001` (a code of this project's own, so a
-- server-side job can tell it from a real constraint failure), and a client
-- write to a server-owned post column is `42501`.

begin;

create extension if not exists pgtap;

select plan(28);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

-- Three owners: 'capped' sits exactly on the free habits cap, 'admin' sits on
-- it with the admin exemption, 'author' owns the posts.
select set_config('test.capped', '00000000-0000-0000-0000-00000000ca01', true);
select set_config('test.admin', '00000000-0000-0000-0000-00000000ca02', true);
select set_config('test.author', '00000000-0000-0000-0000-00000000ca03', true);
select set_config('test.other', '00000000-0000-0000-0000-00000000ca04', true);

set local session_replication_role = replica;

insert into public.users (id, email, username, is_admin)
values
  ('00000000-0000-0000-0000-00000000ca02', 'cap-admin@example.invalid', 'cap-admin', true),
  ('00000000-0000-0000-0000-00000000ca03', 'cap-author@example.invalid', 'cap-author', false),
  ('00000000-0000-0000-0000-00000000ca04', 'cap-other@example.invalid', 'cap-other', false);

-- Five live habits (the free cap) plus one tombstone, for both capped owners.
insert into public.habits (id, user_id, name)
select gen_random_uuid(), '00000000-0000-0000-0000-00000000ca01'::uuid, 'habit-' || n
from generate_series(1, 5) as n;

insert into public.habits (id, user_id, name, deleted_at)
values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-00000000ca01',
  'habit-tombstone',
  now()
);

insert into public.habits (id, user_id, name)
select gen_random_uuid(), '00000000-0000-0000-0000-00000000ca02'::uuid, 'admin-habit-' || n
from generate_series(1, 5) as n;

-- Ten published posts (the free cap) and one draft, for the author.
insert into public.posts (id, author_id, slug, content, status, published_at, community_visible)
select
  ('00000000-0000-0000-0000-0000000ca1' || lpad(n::text, 2, '0'))::uuid,
  '00000000-0000-0000-0000-00000000ca03'::uuid,
  'cap-published-' || n,
  'body',
  'published',
  now(),
  true
from generate_series(1, 10) as n;

insert into public.posts (id, author_id, slug, content, status)
values (
  '00000000-0000-0000-0000-000000000a01',
  '00000000-0000-0000-0000-00000000ca03',
  'cap-draft',
  'body',
  'draft'
);

-- A draft owned by somebody else, for the cross-account transition check.
insert into public.posts (id, author_id, slug, content, status)
values (
  '00000000-0000-0000-0000-000000000a02',
  '00000000-0000-0000-0000-00000000ca04',
  'other-draft',
  'body',
  'draft'
);

-- Two more drafts for the same account, for the published-date checks (#552):
-- the account owns one published post, so both fit under the free cap.
insert into public.posts (id, author_id, slug, content, status)
values
  (
    '00000000-0000-0000-0000-000000000a03',
    '00000000-0000-0000-0000-00000000ca04',
    'other-second-draft',
    'body',
    'draft'
  ),
  (
    '00000000-0000-0000-0000-000000000a04',
    '00000000-0000-0000-0000-00000000ca04',
    'other-bulk-draft',
    'body',
    'draft'
  );

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- Counting
-- ---------------------------------------------------------------------------

reset role;

select is(
  private.owned_item_count('00000000-0000-0000-0000-00000000ca01', 'habits'),
  5,
  'the count excludes the tombstone'
);

-- ---------------------------------------------------------------------------
-- Habits: the free cap is five
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ca01","email":"cap-capped@example.invalid"}',
  true
);

set local role authenticated;

select throws_ok(
  $$insert into public.habits (id, user_id, name)
    values (gen_random_uuid(), '00000000-0000-0000-0000-00000000ca01', 'sixth')$$,
  'PL001',
  null,
  'a sixth habit is refused at the free cap'
);

select lives_ok(
  $$update public.habits set name = 'renamed'
     where user_id = '00000000-0000-0000-0000-00000000ca01' and name = 'habit-1'$$,
  'editing an owned row that already holds a slot is not a new slot'
);

select throws_ok(
  $$update public.habits set deleted_at = null
     where user_id = '00000000-0000-0000-0000-00000000ca01' and name = 'habit-tombstone'$$,
  'PL001',
  null,
  'reviving a tombstone at the cap is refused'
);

select lives_ok(
  $$update public.habits set deleted_at = now()
     where user_id = '00000000-0000-0000-0000-00000000ca01' and name = 'habit-2'$$,
  'deleting a row still works at the cap'
);

select lives_ok(
  $$update public.habits set deleted_at = null
     where user_id = '00000000-0000-0000-0000-00000000ca01' and name = 'habit-2'$$,
  'the freed slot accepts a revival'
);

-- ---------------------------------------------------------------------------
-- Habits: the exemption is Admin-only
--
-- Asserted on the function rather than through an INSERT: the seeded owners have
-- no Auth row, so a live insert would be refused by the foreign key before the
-- assertion could say anything about the cap.
-- ---------------------------------------------------------------------------

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ca02","email":"cap-admin@example.invalid"}',
  true
);

select lives_ok(
  $$select private.assert_owned_item_cap(
      '00000000-0000-0000-0000-00000000ca02'::uuid,
      'habits'
    )$$,
  'an Admin writes past the cap'
);

select throws_ok(
  $$select private.assert_owned_item_cap(
      '00000000-0000-0000-0000-00000000ca01'::uuid,
      'habits'
    )$$,
  'PL001',
  null,
  'a non-admin at the cap is refused'
);

-- ---------------------------------------------------------------------------
-- Posts: the publication columns belong to the server
-- ---------------------------------------------------------------------------

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ca03","email":"cap-author@example.invalid"}',
  true
);

select throws_ok(
  $$insert into public.posts (author_id, slug, content, status, published_at, community_visible)
    values ('00000000-0000-0000-0000-00000000ca03', 'cap-eleventh', 'body', 'published', now(), true)$$,
  'PL001',
  null,
  'an eleventh published post is refused at the free cap'
);

select throws_ok(
  $$update public.posts set status = 'published', published_at = now(), community_visible = true
     where id = '00000000-0000-0000-0000-000000000a01'$$,
  '42501',
  null,
  'a client cannot publish a draft by writing the status columns'
);

select throws_ok(
  $$update public.posts set view_count = 1000
     where id = '00000000-0000-0000-0000-000000000a01'$$,
  '42501',
  null,
  'a client cannot write view_count'
);

select throws_ok(
  $$update public.posts set featured = true
     where id = '00000000-0000-0000-0000-000000000a01'$$,
  '42501',
  null,
  'a client cannot feature a post by writing the column'
);

select lives_ok(
  $$update public.posts set slug = 'cap-draft-edited'
     where id = '00000000-0000-0000-0000-000000000a01'$$,
  'a client keeps writing the editor-owned columns'
);

-- ---------------------------------------------------------------------------
-- Posts: the transitions go through the gated RPCs
--
-- The author sits exactly on the published cap, so these run as the other
-- account, whose only post is a draft.
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ca04","email":"cap-other@example.invalid"}',
  true
);

select is(
  public.set_post_featured('00000000-0000-0000-0000-000000000a02', true),
  'other-draft',
  'set_post_featured moves the column for the owning author'
);

select is(
  public.publish_post('00000000-0000-0000-0000-000000000a02'),
  'other-draft',
  'publish_post publishes the owning author''s draft'
);

select is(
  public.unpublish_post('00000000-0000-0000-0000-000000000a02'),
  'other-draft',
  'unpublish_post returns the post to draft'
);

select throws_ok(
  $$select public.publish_post('00000000-0000-0000-0000-000000000a01')$$,
  'P0002',
  null,
  'publish_post refuses another account''s post'
);

-- ---------------------------------------------------------------------------
-- Posts: the bulk transition keeps the same rules
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer
     from public.bulk_publish_posts(
       array['00000000-0000-0000-0000-000000000a02'::uuid],
       true
     )),
  1,
  'bulk_publish_posts publishes the owned row'
);

-- Ten already published plus this one is exactly the cap, so the batch takes
-- no eleventh slot: the check counts only the rows that are not published yet.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ca03","email":"cap-author@example.invalid"}',
  true
);

select results_eq(
  $$select slug from public.bulk_publish_posts(
      array['00000000-0000-0000-0000-0000000ca103'::uuid],
      true
    )$$,
  $$values ('cap-published-3')$$,
  'a batch that publishes an already published row takes no new slot'
);

-- ---------------------------------------------------------------------------
-- Posts: publishing keeps the first publication's date (#552)
--
-- Re-publishing is not a new publication, so it must not refresh
-- `published_at` — the feed orders by that column, and a fresh date would float
-- an old post to the top for free. A draft still gets its date on the way out.
-- ---------------------------------------------------------------------------

-- Pin a known date on the already published row, the way an earlier publish
-- would have. The client roles cannot write this column, so this runs as the
-- migration role.
reset role;

update public.posts
   set published_at = timestamptz '2026-10-01 09:00:00+00'
 where id = '00000000-0000-0000-0000-000000000a02';

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ca04","email":"cap-other@example.invalid"}',
  true
);

select is(
  public.publish_post('00000000-0000-0000-0000-000000000a02'),
  'other-draft',
  'publish_post re-saves an already published post'
);

reset role;

select is(
  (select published_at from public.posts where id = '00000000-0000-0000-0000-000000000a02'),
  timestamptz '2026-10-01 09:00:00+00',
  'a re-publish keeps the original published_at'
);

select ok(
  (select published_at is null from public.posts
    where id = '00000000-0000-0000-0000-000000000a03'),
  'a draft carries no published_at'
);

set local role authenticated;

select is(
  public.publish_post('00000000-0000-0000-0000-000000000a03'),
  'other-second-draft',
  'publish_post publishes the second draft'
);

reset role;

select ok(
  (select published_at is not null from public.posts
    where id = '00000000-0000-0000-0000-000000000a03'),
  'publishing a draft stamps published_at'
);

set local role authenticated;

select results_eq(
  $$select slug from public.bulk_publish_posts(
      array[
        '00000000-0000-0000-0000-000000000a02'::uuid,
        '00000000-0000-0000-0000-000000000a04'::uuid
      ],
      true
    )$$,
  $$values ('other-draft'), ('other-bulk-draft')$$,
  'a mixed bulk publish returns every row it touched'
);

reset role;

select is(
  (select published_at from public.posts where id = '00000000-0000-0000-0000-000000000a02'),
  timestamptz '2026-10-01 09:00:00+00',
  'a bulk publish leaves an already published date alone'
);

select ok(
  (select published_at is not null from public.posts
    where id = '00000000-0000-0000-0000-000000000a04'),
  'a bulk publish stamps the draft in the same batch'
);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

reset role;

select ok(
  not has_function_privilege('anon', 'public.publish_post(uuid,jsonb)', 'execute'),
  'anon cannot publish'
);

select * from finish();

rollback;
