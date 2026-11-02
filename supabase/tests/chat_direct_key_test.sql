-- Assertions for the direct pair key (#841, ADR-0113).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- A direct thread is unique by pair: `direct_key` is the sorted pair of member
-- ids and the unique index refuses a second conversation for it. The key used to
-- be derived from the roster rows still open, so a decline or a withdrawal
-- collapsed it and the pair could start over as a second thread. Everything
-- below is the fixed definition: the key is the pair at every status, the unique
-- index still refuses the second thread, and reopening keeps the same row.
--
-- The fixtures are seeded with the status and pair-key triggers live (no
-- `session_replication_role = replica`), because the key those triggers write is
-- the subject of the file. The whole file rolls back.

begin;

create extension if not exists pgtap;

select plan(17);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into public.users (id, email, username)
values
  ('00000000-0000-0000-0000-0000000e0101', 'pair-a@example.invalid', 'pair-a'),
  ('00000000-0000-0000-0000-0000000e0102', 'pair-b@example.invalid', 'pair-b');

-- The pair A-B is `requested`; the single-row thread is the state `startDirect`
-- leaves between its two inserts; the duplicate thread is where the second
-- attempt for A-B is made.
insert into public.chat_conversations (id, kind, status, created_by)
values
  ('00000000-0000-0000-0000-0000000e0201', 'direct', 'requested',
   '00000000-0000-0000-0000-0000000e0101'),
  ('00000000-0000-0000-0000-0000000e0202', 'direct', 'requested',
   '00000000-0000-0000-0000-0000000e0101'),
  ('00000000-0000-0000-0000-0000000e0203', 'direct', 'requested',
   '00000000-0000-0000-0000-0000000e0101');

insert into public.chat_participants (conversation_id, user_id, role, status)
values
  ('00000000-0000-0000-0000-0000000e0201', '00000000-0000-0000-0000-0000000e0101', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000e0201', '00000000-0000-0000-0000-0000000e0102', 'member', 'requested'),
  ('00000000-0000-0000-0000-0000000e0202', '00000000-0000-0000-0000-0000000e0101', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000e0203', '00000000-0000-0000-0000-0000000e0101', 'owner', 'active');

-- ---------------------------------------------------------------------------
-- The key is the pair, and only a pair
-- ---------------------------------------------------------------------------

select is(
  (
    select direct_key
      from public.chat_conversations
     where id = '00000000-0000-0000-0000-0000000e0201'
  ),
  '00000000-0000-0000-0000-0000000e0101|00000000-0000-0000-0000-0000000e0102',
  'two roster rows key a direct thread by the sorted pair'
);

select is(
  (
    select direct_key
      from public.chat_conversations
     where id = '00000000-0000-0000-0000-0000000e0202'
  ),
  null::text,
  'one roster row is not a pair, so the thread carries no key'
);

-- ---------------------------------------------------------------------------
-- A decline keeps the pair
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000e0102')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$
    update public.chat_participants
       set status = 'declined',
           joined_at = null
     where conversation_id = '00000000-0000-0000-0000-0000000e0201'
       and user_id = '00000000-0000-0000-0000-0000000e0102'
  $$,
  'the requested side declines the direct request'
);

select is(
  (
    select status
      from public.chat_conversations
     where id = '00000000-0000-0000-0000-0000000e0201'
  ),
  'declined',
  'the decline closes the conversation'
);

select is(
  (
    select direct_key
      from public.chat_conversations
     where id = '00000000-0000-0000-0000-0000000e0201'
  ),
  '00000000-0000-0000-0000-0000000e0101|00000000-0000-0000-0000-0000000e0102',
  'a decline keeps the pair key'
);

select is(
  (
    select id
      from public.chat_conversations
     where direct_key = '00000000-0000-0000-0000-0000000e0101|00000000-0000-0000-0000-0000000e0102'
  ),
  '00000000-0000-0000-0000-0000000e0201'::uuid,
  'the pair lookup still answers the declined thread'
);

-- The second attempt for the pair, as `startDirect` makes it: the creator's row
-- lands, the peer's row is what the unique index refuses.
reset role;

select throws_ok(
  $$
    insert into public.chat_participants (conversation_id, user_id, role, status)
    values (
      '00000000-0000-0000-0000-0000000e0203',
      '00000000-0000-0000-0000-0000000e0102',
      'member',
      'requested'
    )
  $$,
  '23505',
  'a second direct thread for a declined pair is refused'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000e0101')::text,
  true
);
set local role authenticated;

select is(
  public.request_chat_conversation('00000000-0000-0000-0000-0000000e0201'),
  true,
  'the declined thread is asked for again on the same row'
);

select is(
  (
    select status
      from public.chat_conversations
     where id = '00000000-0000-0000-0000-0000000e0201'
  ),
  'requested',
  'the reopened thread waits for the peer again'
);

select is(
  (
    select direct_key
      from public.chat_conversations
     where id = '00000000-0000-0000-0000-0000000e0201'
  ),
  '00000000-0000-0000-0000-0000000e0101|00000000-0000-0000-0000-0000000e0102',
  'reopening a declined thread keeps the pair key'
);

-- ---------------------------------------------------------------------------
-- A withdrawal keeps the pair
-- ---------------------------------------------------------------------------

select lives_ok(
  $$
    select public.withdraw_chat_request('00000000-0000-0000-0000-0000000e0201')
  $$,
  'the requester withdraws the request'
);

select is(
  (
    select count(*)::integer
      from public.chat_participants
     where conversation_id = '00000000-0000-0000-0000-0000000e0201'
       and status = 'left'
  ),
  2,
  'a withdrawal leaves both roster rows'
);

select is(
  (
    select direct_key
      from public.chat_conversations
     where id = '00000000-0000-0000-0000-0000000e0201'
  ),
  '00000000-0000-0000-0000-0000000e0101|00000000-0000-0000-0000-0000000e0102',
  'a withdrawal keeps the pair key'
);

select is(
  (
    select status
      from public.chat_conversations
     where id = '00000000-0000-0000-0000-0000000e0201'
  ),
  'archived',
  'a withdrawal closes the conversation'
);

reset role;

select throws_ok(
  $$
    insert into public.chat_participants (conversation_id, user_id, role, status)
    values (
      '00000000-0000-0000-0000-0000000e0203',
      '00000000-0000-0000-0000-0000000e0102',
      'member',
      'requested'
    )
  $$,
  '23505',
  'a second direct thread for a withdrawn pair is refused'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000e0101')::text,
  true
);
set local role authenticated;

select is(
  public.request_chat_conversation('00000000-0000-0000-0000-0000000e0201'),
  true,
  'the withdrawn thread is asked for again on the same row'
);

select is(
  (
    select id
      from public.chat_conversations
     where direct_key = '00000000-0000-0000-0000-0000000e0101|00000000-0000-0000-0000-0000000e0102'
  ),
  '00000000-0000-0000-0000-0000000e0201'::uuid,
  'the pair lookup still answers the withdrawn thread'
);

select * from finish();

rollback;
