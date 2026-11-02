-- Assertions for the chat message guard and its UPDATE policy (#843, ADR-0113).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- The window bounds an *edit*, never a tombstone: a member may delete what they
-- wrote at any age, the tombstone clears the body in the same write, and once
-- deleted the row keeps no body and cannot come back. Everything below runs as
-- `authenticated` with a member's own JWT, so the policy is exercised rather
-- than bypassed, and the whole file rolls back.
--
-- Fixtures are seeded with `session_replication_role = replica` so the status
-- derivation and the last-message trigger stay out of the way: this test is
-- about one guard, and the thread is already open by construction.

begin;

create extension if not exists pgtap;

select plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

set local session_replication_role = replica;

insert into public.users (id, email, username)
values
  ('00000000-0000-0000-0000-0000000c0101', 'tomb-me@example.invalid', 'tomb-me'),
  ('00000000-0000-0000-0000-0000000c0102', 'tomb-them@example.invalid', 'tomb-them');

insert into public.chat_conversations (id, kind, status, created_by)
values (
  '00000000-0000-0000-0000-0000000c0201',
  'direct',
  'active',
  '00000000-0000-0000-0000-0000000c0101'
);

insert into public.chat_participants (conversation_id, user_id, role, status)
values
  (
    '00000000-0000-0000-0000-0000000c0201',
    '00000000-0000-0000-0000-0000000c0101',
    'owner',
    'active'
  ),
  (
    '00000000-0000-0000-0000-0000000c0201',
    '00000000-0000-0000-0000-0000000c0102',
    'member',
    'active'
  );

-- One message well past the fifteen-minute window, one inside it, and one the
-- other member wrote. The old one is the whole point: it used to be undeletable.
insert into public.chat_messages (id, conversation_id, sender_id, body, created_at)
values
  (
    '00000000-0000-0000-0000-0000000c0301',
    '00000000-0000-0000-0000-0000000c0201',
    '00000000-0000-0000-0000-0000000c0101',
    'قديمة',
    now() - interval '2 hours'
  ),
  (
    '00000000-0000-0000-0000-0000000c0302',
    '00000000-0000-0000-0000-0000000c0201',
    '00000000-0000-0000-0000-0000000c0101',
    'جديدة',
    now() - interval '1 minute'
  ),
  (
    '00000000-0000-0000-0000-0000000c0303',
    '00000000-0000-0000-0000-0000000c0201',
    '00000000-0000-0000-0000-0000000c0102',
    'رسالة الطرف الآخر',
    now() - interval '1 minute'
  );

set local session_replication_role = origin;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000c0101')::text,
  true
);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- A tombstone is allowed at any age, and it is not an edit
-- ---------------------------------------------------------------------------

select is(
  (
    with tombstoned as (
      update public.chat_messages
         set deleted_at = now(),
             body = null
       where id = '00000000-0000-0000-0000-0000000c0301'
      returning 1
    )
    select count(*)::integer from tombstoned
  ),
  1,
  'a message older than fifteen minutes can be tombstoned'
);

select is(
  (
    select (body is null and deleted_at is not null and edited_at is null)
      from public.chat_messages
     where id = '00000000-0000-0000-0000-0000000c0301'
  ),
  true,
  'the tombstone clears the body and does not stamp edited_at'
);

select is(
  (
    with again as (
      update public.chat_messages
         set deleted_at = now()
       where id = '00000000-0000-0000-0000-0000000c0301'
      returning 1
    )
    select count(*)::integer from again
  ),
  0,
  'a second tombstone changes no row, so the client can answer clearly'
);

-- ---------------------------------------------------------------------------
-- A tombstone is final
-- ---------------------------------------------------------------------------

select throws_ok(
  $$
    update public.chat_messages
       set body = 'عاد النص'
     where id = '00000000-0000-0000-0000-0000000c0301'
  $$,
  '42501',
  'a deleted message stays deleted',
  'a tombstoned message cannot regain a body'
);

select throws_ok(
  $$
    update public.chat_messages
       set deleted_at = null
     where id = '00000000-0000-0000-0000-0000000c0301'
  $$,
  '42501',
  'a deleted message stays deleted',
  'a tombstone cannot be undone'
);

-- ---------------------------------------------------------------------------
-- Fifteen minutes still bounds the edit
-- ---------------------------------------------------------------------------

select throws_ok(
  $$
    update public.chat_messages
       set body = 'تعديل متأخر'
     where id = '00000000-0000-0000-0000-0000000c0301'
  $$,
  '42501',
  'a message is edited within fifteen minutes',
  'a body change after the window is refused by the guard'
);

select is(
  (
    with edited as (
      update public.chat_messages
         set body = 'تعديل في الوقت'
       where id = '00000000-0000-0000-0000-0000000c0302'
      returning 1
    )
    select count(*)::integer from edited
  ),
  1,
  'a body change inside the window is allowed'
);

select is(
  (
    select edited_at is not null
      from public.chat_messages
     where id = '00000000-0000-0000-0000-0000000c0302'
  ),
  true,
  'an edit inside the window stamps edited_at'
);

-- ---------------------------------------------------------------------------
-- The policy is still "my row"
-- ---------------------------------------------------------------------------

select is(
  (
    with theirs as (
      update public.chat_messages
         set body = 'لا شأن لك'
       where id = '00000000-0000-0000-0000-0000000c0303'
      returning 1
    )
    select count(*)::integer from theirs
  ),
  0,
  'a member cannot edit the other side of the thread'
);

select is(
  (
    with theirs as (
      update public.chat_messages
         set deleted_at = now()
       where id = '00000000-0000-0000-0000-0000000c0303'
      returning 1
    )
    select count(*)::integer from theirs
  ),
  0,
  'a member cannot tombstone the other side of the thread'
);

select throws_ok(
  $$
    update public.chat_messages
       set sender_id = '00000000-0000-0000-0000-0000000c0102'
     where id = '00000000-0000-0000-0000-0000000c0302'
  $$,
  '42501',
  'a message keeps its identity',
  'a message keeps its identity through the same guard'
);

select is(
  (
    with tombstoned as (
      update public.chat_messages
         set body = 'يبقى؟',
             deleted_at = now()
       where id = '00000000-0000-0000-0000-0000000c0302'
      returning 1
    )
    select count(*)::integer from tombstoned
  ),
  1,
  'a tombstone that also sends a body is still accepted'
);

reset role;

select is(
  (
    select count(*)::integer
      from public.chat_messages
     where id = '00000000-0000-0000-0000-0000000c0302'
       and body is null
  ),
  1,
  'the guard clears a body the tombstone still carried'
);

select is(
  (
    select deleted_at is null
      from public.chat_messages
     where id = '00000000-0000-0000-0000-0000000c0303'
  ),
  true,
  'the other side of the thread is untouched'
);

select * from finish();

rollback;
