-- Assertions for the participant state machine (#840, ADR-0113) and the roster
-- read a `left` row does not get (#888).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- A participant row is consent: `requested`/`invited` wait, `active` is in,
-- `declined`/`left` are terminal for clients, and the SECURITY DEFINER
-- lifecycle functions are the only hand that reopens one. Everything below runs
-- as `authenticated` with a member's own JWT, against `/rest/v1`'s own grants
-- and policies, and the whole file rolls back.
--
-- Fixtures are seeded with `session_replication_role = replica` so the status
-- derivation and pair-key triggers stay out of the way: each thread is already
-- in the state the assertion is about.

begin;

create extension if not exists pgtap;

select plan(39);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

set local session_replication_role = replica;

insert into public.users (id, email, username)
values
  ('00000000-0000-0000-0000-0000000d0101', 'state-a@example.invalid', 'state-a'),
  ('00000000-0000-0000-0000-0000000d0102', 'state-b@example.invalid', 'state-b'),
  ('00000000-0000-0000-0000-0000000d0103', 'state-c@example.invalid', 'state-c'),
  ('00000000-0000-0000-0000-0000000d0104', 'state-d@example.invalid', 'state-d');

insert into public.chat_conversations (id, kind, title, status, created_by)
values
  -- A closed DM between A and C: the reopen/withdraw pair.
  ('00000000-0000-0000-0000-0000000d0202', 'direct', null, 'declined',
   '00000000-0000-0000-0000-0000000d0101'),
  -- A group A owns.
  ('00000000-0000-0000-0000-0000000d0203', 'group', 'فريق', 'active',
   '00000000-0000-0000-0000-0000000d0101'),
  -- A fresh DM: A is alone in it, which is the `startDirect` sequence's state.
  ('00000000-0000-0000-0000-0000000d0205', 'direct', null, 'requested',
   '00000000-0000-0000-0000-0000000d0101'),
  -- The assistant thread: one owner and nobody else.
  ('00000000-0000-0000-0000-0000000d0206', 'agent', null, 'active',
   '00000000-0000-0000-0000-0000000d0101'),
  -- A pending DM between A and D: declining is the other terminal answer.
  ('00000000-0000-0000-0000-0000000d0207', 'direct', null, 'requested',
   '00000000-0000-0000-0000-0000000d0101');

insert into public.chat_participants (conversation_id, user_id, role, status)
values
  ('00000000-0000-0000-0000-0000000d0202', '00000000-0000-0000-0000-0000000d0101', 'member', 'requested'),
  ('00000000-0000-0000-0000-0000000d0202', '00000000-0000-0000-0000-0000000d0103', 'member', 'declined'),
  ('00000000-0000-0000-0000-0000000d0203', '00000000-0000-0000-0000-0000000d0101', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000d0205', '00000000-0000-0000-0000-0000000d0101', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000d0206', '00000000-0000-0000-0000-0000000d0101', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000d0207', '00000000-0000-0000-0000-0000000d0101', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000d0207', '00000000-0000-0000-0000-0000000d0104', 'member', 'requested');

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- A: the creator asks their one peer, and nobody else joins
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0101')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into public.chat_participants (conversation_id, user_id, status)
    values (
      '00000000-0000-0000-0000-0000000d0205',
      '00000000-0000-0000-0000-0000000d0102',
      'requested'
    )
  $$,
  'the creator of a direct thread adds their one peer as a request'
);

select throws_ok(
  $$
    insert into public.chat_participants (conversation_id, user_id, status)
    values (
      '00000000-0000-0000-0000-0000000d0205',
      '00000000-0000-0000-0000-0000000d0103',
      'requested'
    )
  $$,
  '42501',
  'a direct thread holds exactly two participants'
);

select is(
  (
    select count(*)::integer
      from public.chat_participants
     where conversation_id = '00000000-0000-0000-0000-0000000d0205'
  ),
  2,
  'the refused third row left the same two participants'
);

select lives_ok(
  $$
    update public.chat_participants
       set last_read_at = now()
     where conversation_id = '00000000-0000-0000-0000-0000000d0205'
       and user_id = '00000000-0000-0000-0000-0000000d0101'
  $$,
  'the read watermark still moves on its own'
);

select throws_ok(
  $$
    update public.chat_participants
       set status = 'requested'
     where conversation_id = '00000000-0000-0000-0000-0000000d0205'
       and user_id = '00000000-0000-0000-0000-0000000d0101'
  $$,
  '42501',
  'an active member cannot move their own row back to requested'
);

-- ---------------------------------------------------------------------------
-- B: accepting works, and the rest of the row is the server's
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0102')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$
    update public.chat_participants
       set status = 'active',
           joined_at = now()
     where conversation_id = '00000000-0000-0000-0000-0000000d0205'
       and user_id = '00000000-0000-0000-0000-0000000d0102'
  $$,
  'the requested side accepts a direct request'
);

select throws_ok(
  $$
    insert into public.chat_participants (conversation_id, user_id, status)
    values (
      '00000000-0000-0000-0000-0000000d0205',
      '00000000-0000-0000-0000-0000000d0103',
      'requested'
    )
  $$,
  '42501',
  'an active member cannot add a third participant to a direct thread'
);

select throws_ok(
  $$
    update public.chat_participants
       set status = 'declined'
     where conversation_id = '00000000-0000-0000-0000-0000000d0205'
       and user_id = '00000000-0000-0000-0000-0000000d0102'
  $$,
  '42501',
  'an active member leaves rather than answering a request again'
);

select throws_ok(
  $$
    update public.chat_participants
       set role = 'owner'
     where conversation_id = '00000000-0000-0000-0000-0000000d0205'
       and user_id = '00000000-0000-0000-0000-0000000d0102'
  $$,
  '42501',
  'a participant cannot grant themselves the owner role'
);

select throws_ok(
  $$
    update public.chat_participants
       set joined_at = now()
     where conversation_id = '00000000-0000-0000-0000-0000000d0205'
       and user_id = '00000000-0000-0000-0000-0000000d0102'
  $$,
  '42501',
  'joined_at only moves with a status change'
);

-- ---------------------------------------------------------------------------
-- A stranger cannot walk into a thread
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0103')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$
    insert into public.chat_participants (conversation_id, user_id, status)
    values (
      '00000000-0000-0000-0000-0000000d0205',
      '00000000-0000-0000-0000-0000000d0104',
      'requested'
    )
  $$,
  '42501',
  'someone outside the thread cannot add a participant to it'
);

-- ---------------------------------------------------------------------------
-- D: a decline is terminal for a client
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0104')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$
    update public.chat_participants
       set status = 'declined',
           joined_at = null
     where conversation_id = '00000000-0000-0000-0000-0000000d0207'
       and user_id = '00000000-0000-0000-0000-0000000d0104'
  $$,
  'the requested side declines a direct request'
);

select throws_ok(
  $$
    update public.chat_participants
       set status = 'active',
           joined_at = now()
     where conversation_id = '00000000-0000-0000-0000-0000000d0207'
       and user_id = '00000000-0000-0000-0000-0000000d0104'
  $$,
  '42501',
  'a declined participant cannot rejoin without consent'
);

-- ---------------------------------------------------------------------------
-- The assistant thread and the group thread
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0101')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$
    insert into public.chat_participants (conversation_id, user_id, status)
    values (
      '00000000-0000-0000-0000-0000000d0206',
      '00000000-0000-0000-0000-0000000d0102',
      'requested'
    )
  $$,
  '42501',
  'an agent thread admits nobody but its owner'
);

select lives_ok(
  $$
    insert into public.chat_participants (conversation_id, user_id, status, invited_by)
    values (
      '00000000-0000-0000-0000-0000000d0203',
      '00000000-0000-0000-0000-0000000d0103',
      'invited',
      '00000000-0000-0000-0000-0000000d0101'
    )
  $$,
  'a member of a group thread may invite somebody'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0103')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$
    insert into public.chat_participants (conversation_id, user_id, status)
    values (
      '00000000-0000-0000-0000-0000000d0203',
      '00000000-0000-0000-0000-0000000d0104',
      'invited'
    )
  $$,
  '42501',
  'an invited member cannot invite anybody else'
);

-- ---------------------------------------------------------------------------
-- The definer lifecycle functions still reopen and close a thread
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0101')::text,
  true
);
set local role authenticated;

select is(
  public.request_chat_conversation('00000000-0000-0000-0000-0000000d0202'),
  true,
  'the definer request reopens a declined thread'
);

select is(
  (
    select count(*)::integer
      from public.chat_participants
     where conversation_id = '00000000-0000-0000-0000-0000000d0202'
       and status = 'active'
  ),
  1,
  'the caller of the reopen is active again'
);

select is(
  (
    select count(*)::integer
      from public.chat_participants
     where conversation_id = '00000000-0000-0000-0000-0000000d0202'
       and status = 'requested'
  ),
  1,
  'the reopen puts the peer back to requested'
);

select lives_ok(
  $$
    select public.withdraw_chat_request('00000000-0000-0000-0000-0000000d0202')
  $$,
  'the definer withdraw closes a pending thread'
);

select is(
  (
    select count(*)::integer
      from public.chat_participants
     where conversation_id = '00000000-0000-0000-0000-0000000d0202'
       and status = 'left'
  ),
  2,
  'a withdrawal leaves both roster rows from the roster'
);

select lives_ok(
  $$
    update public.chat_participants
       set last_read_at = now()
     where conversation_id = '00000000-0000-0000-0000-0000000d0202'
       and user_id = '00000000-0000-0000-0000-0000000d0101'
  $$,
  'the watermark still moves while the row is left'
);

select is(
  public.request_chat_conversation('00000000-0000-0000-0000-0000000d0202'),
  true,
  'the definer request reopens a withdrawn thread'
);

select is(
  (
    select string_agg(p.status, ',' order by p.status)
      from public.chat_participants p
     where p.conversation_id = '00000000-0000-0000-0000-0000000d0202'
  ),
  'active,requested',
  'the reopened thread is one active caller and one pending peer'
);

-- ---------------------------------------------------------------------------
-- Nothing is hard-deleted
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0102')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$
    delete from public.chat_participants
     where conversation_id = '00000000-0000-0000-0000-0000000d0205'
       and user_id = '00000000-0000-0000-0000-0000000d0102'
  $$,
  '42501',
  'a participant cannot delete their roster row'
);

-- ---------------------------------------------------------------------------
-- E: leaving a thread ends the roster, not the row (#888)
-- ---------------------------------------------------------------------------

reset role;
set local session_replication_role = replica;

-- A group A has left, a direct thread whose request is still unanswered, and a
-- line B wrote in the group that A must not be able to read.
insert into public.chat_conversations (id, kind, title, status, created_by)
values
  ('00000000-0000-0000-0000-0000000d0208', 'group', 'Roster E', 'active',
   '00000000-0000-0000-0000-0000000d0101'),
  ('00000000-0000-0000-0000-0000000d0209', 'direct', null, 'requested',
   '00000000-0000-0000-0000-0000000d0101');

insert into public.chat_participants (conversation_id, user_id, role, status, last_read_at)
values
  ('00000000-0000-0000-0000-0000000d0208', '00000000-0000-0000-0000-0000000d0101', 'member', 'left', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000d0208', '00000000-0000-0000-0000-0000000d0102', 'member', 'active', now()),
  ('00000000-0000-0000-0000-0000000d0208', '00000000-0000-0000-0000-0000000d0103', 'member', 'active', now()),
  ('00000000-0000-0000-0000-0000000d0209', '00000000-0000-0000-0000-0000000d0101', 'member', 'active', null),
  ('00000000-0000-0000-0000-0000000d0209', '00000000-0000-0000-0000-0000000d0102', 'member', 'requested', null);

insert into public.chat_messages (conversation_id, sender_id, body)
values (
  '00000000-0000-0000-0000-0000000d0208',
  '00000000-0000-0000-0000-0000000d0102',
  'a line the leaver must not read'
);

set local session_replication_role = origin;

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0101')::text,
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
      from public.chat_participants
     where conversation_id = '00000000-0000-0000-0000-0000000d0208'
       and user_id = '00000000-0000-0000-0000-0000000d0101'
  ),
  1,
  'a member who left still reads their own roster row'
);

select is(
  (
    select count(*)::integer
      from public.chat_participants
     where conversation_id = '00000000-0000-0000-0000-0000000d0208'
  ),
  1,
  'a member who left reads nobody else''s roster row'
);

select is(
  (
    select count(*)::integer
      from public.chat_participants
     where conversation_id = '00000000-0000-0000-0000-0000000d0208'
       and user_id = '00000000-0000-0000-0000-0000000d0102'
       and last_read_at is not null
  ),
  0,
  'a peer''s read watermark stays hidden from the leaver'
);

select is(
  (
    select count(*)::integer
      from public.chat_conversations
     where id = '00000000-0000-0000-0000-0000000d0208'
  ),
  1,
  'the thread stays readable, which is what the preview resolves'
);

select is(
  (
    select count(*)::integer
      from public.chat_messages
     where conversation_id = '00000000-0000-0000-0000-0000000d0208'
  ),
  0,
  'the messages of a thread the member left stay unreadable'
);

select is(
  public.chat_direct_peer('00000000-0000-0000-0000-0000000d0208'),
  null::uuid,
  'the peer read answers nothing for a group thread'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0102')::text,
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
      from public.chat_participants
     where conversation_id = '00000000-0000-0000-0000-0000000d0209'
  ),
  2,
  'a requested recipient still reads the roster it has to answer'
);

select is(
  public.chat_direct_peer('00000000-0000-0000-0000-0000000d0209'),
  '00000000-0000-0000-0000-0000000d0101'::uuid,
  'the peer read answers the other side of a direct thread'
);

select is(
  (
    select count(*)::integer
      from public.chat_participants
     where conversation_id = '00000000-0000-0000-0000-0000000d0208'
  ),
  3,
  'an active member still reads the whole roster, including who left'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0104')::text,
  true
);
set local role authenticated;

select is(
  public.chat_direct_peer('00000000-0000-0000-0000-0000000d0209'),
  null::uuid,
  'a stranger reads no peer id'
);

-- The two helpers answer the roles the policy needs and no others.

reset role;

select is(
  has_function_privilege(
    'anon', 'private.chat_roster_visible(uuid, uuid)', 'execute'
  ),
  false,
  'the roster helper is not executable by anon'
);

select is(
  has_function_privilege(
    'authenticated', 'private.chat_roster_visible(uuid, uuid)', 'execute'
  ),
  true,
  'the roster helper is executable by the role the policy runs as'
);

select is(
  has_function_privilege('anon', 'public.chat_direct_peer(uuid)', 'execute'),
  false,
  'the peer read is not executable by anon'
);

select is(
  has_function_privilege('authenticated', 'public.chat_direct_peer(uuid)', 'execute'),
  true,
  'the peer read is executable by the signed-in caller'
);

select * from finish();

rollback;
