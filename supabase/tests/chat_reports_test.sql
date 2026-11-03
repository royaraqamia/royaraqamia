-- Assertions for the one writer of `public.chat_reports` (#886).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- A report carries the reporter, a frozen snapshot of the thread and the
-- moderation `status`. `public.report_chat_conversation` decides all three; the
-- table's own INSERT grant let a member POST the same row through the Data API
-- with a fabricated snapshot and a `reviewed` status, which the
-- `Reporters file a report` policy did not constrain.
--
-- Everything below runs as `authenticated` with a member's own JWT, so a
-- refusal is the grant answering the request the client would make, and the
-- whole file rolls back.
--
-- Fixtures are seeded with `session_replication_role = replica` so the
-- last-message and status triggers stay out of the way: this test is about one
-- writer, and the thread is open by construction.

begin;

create extension if not exists pgtap;

select plan(13);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

set local session_replication_role = replica;

insert into public.users (id, email, username)
values
  ('00000000-0000-0000-0000-0000000d0101', 'report-me@example.invalid', 'report-me'),
  ('00000000-0000-0000-0000-0000000d0102', 'report-them@example.invalid', 'report-them'),
  ('00000000-0000-0000-0000-0000000d0103', 'report-outsider@example.invalid', 'report-outsider');

insert into public.chat_conversations (id, kind, status, created_by)
values (
  '00000000-0000-0000-0000-0000000d0201',
  'direct',
  'active',
  '00000000-0000-0000-0000-0000000d0101'
);

insert into public.chat_participants (conversation_id, user_id, role, status)
values
  (
    '00000000-0000-0000-0000-0000000d0201',
    '00000000-0000-0000-0000-0000000d0101',
    'owner',
    'active'
  ),
  (
    '00000000-0000-0000-0000-0000000d0201',
    '00000000-0000-0000-0000-0000000d0102',
    'member',
    'active'
  );

-- Two messages, so a snapshot built by the database has a length the caller
-- never supplied.
insert into public.chat_messages (id, conversation_id, sender_id, body, created_at)
values
  (
    '00000000-0000-0000-0000-0000000d0301',
    '00000000-0000-0000-0000-0000000d0201',
    '00000000-0000-0000-0000-0000000d0102',
    'أول رسالة مبلَّغ عنها',
    now() - interval '3 minutes'
  ),
  (
    '00000000-0000-0000-0000-0000000d0302',
    '00000000-0000-0000-0000-0000000d0201',
    '00000000-0000-0000-0000-0000000d0101',
    'ردّي أنا',
    now() - interval '2 minutes'
  );

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- The privilege is gone, and the read is not
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('authenticated', 'public.chat_reports', 'insert'),
  'authenticated has no table-wide INSERT on chat_reports'
);

select ok(
  not has_table_privilege('authenticated', 'public.chat_reports', 'update'),
  'authenticated has no table-wide UPDATE on chat_reports'
);

select ok(
  not has_table_privilege('authenticated', 'public.chat_reports', 'delete'),
  'authenticated has no table-wide DELETE on chat_reports'
);

select ok(
  not has_table_privilege('anon', 'public.chat_reports', 'insert'),
  'anon has no table-wide INSERT on chat_reports'
);

select ok(
  has_table_privilege('authenticated', 'public.chat_reports', 'select'),
  'authenticated keeps the table-wide SELECT grant, constrained by RLS'
);

-- Defence in depth: the policy stays, even though nothing can reach it now.
select ok(
  exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'chat_reports'
       and policyname = 'Reporters file a report'
       and cmd = 'INSERT'
  ),
  'Reporters file a report still exists beside the revoke'
);

-- ---------------------------------------------------------------------------
-- A member cannot POST the row the policy would have accepted
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0101')::text,
  true
);

set local role authenticated;

-- Both policy predicates hold — the reporter is the caller and the caller is in
-- the conversation — so this is the grant refusing, not a row the policy would
-- have rejected.
select throws_ok(
  $$
    insert into public.chat_reports (
      conversation_id, reporter_id, reported_user_id, reason, snapshot, status
    ) values (
      '00000000-0000-0000-0000-0000000d0201',
      '00000000-0000-0000-0000-0000000d0101',
      '00000000-0000-0000-0000-0000000d0102',
      'مُلفَّق',
      '[{"body": "دليل مختلق"}]'::jsonb,
      'reviewed'
    )
  $$,
  '42501',
  'a member cannot POST chat_reports straight through the Data API'
);

-- ---------------------------------------------------------------------------
-- The RPC is the one writer, and it still works
-- ---------------------------------------------------------------------------

select ok(
  public.report_chat_conversation(
    '00000000-0000-0000-0000-0000000d0201',
    '  إساءة في الحديث  ',
    '00000000-0000-0000-0000-0000000d0102'
  ) is not null,
  'the RPC still files a report for a member'
);

reset role;

select is(
  (
    select reason
      from public.chat_reports
     where reporter_id = '00000000-0000-0000-0000-0000000d0101'
  ),
  'إساءة في الحديث',
  'the stored reason is the one the function trimmed'
);

select is(
  (
    select jsonb_array_length(snapshot)
      from public.chat_reports
     where reporter_id = '00000000-0000-0000-0000-0000000d0101'
  ),
  2,
  'the snapshot is the thread the database read, not a value the caller sent'
);

select is(
  (
    select snapshot @> '[{"body": "أول رسالة مبلَّغ عنها"}]'::jsonb
      from public.chat_reports
     where reporter_id = '00000000-0000-0000-0000-0000000d0101'
  ),
  true,
  'the snapshot carries the reported message'
);

-- ---------------------------------------------------------------------------
-- A non-member is still refused at the function
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0103')::text,
  true
);

set local role authenticated;

select throws_ok(
  $$
    select public.report_chat_conversation(
      '00000000-0000-0000-0000-0000000d0201',
      'لست في هذا الحديث',
      null
    )
  $$,
  '42501',
  'a non-member cannot file a report'
);

reset role;

select is(
  (select count(*)::integer from public.chat_reports),
  1,
  'the refused attempts wrote no row'
);

select * from finish();

rollback;
