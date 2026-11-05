-- Read assertions for `public.chat_reports` (ADR-0113, #911).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- The report row is staff's evidence, so its read policy is the whole point:
-- a reporter reads their own report, an Admin reads every report, and nobody
-- else reads any. The snapshot is frozen at report time, so deleting the
-- reported message afterwards must not change it.
--
-- Fixtures are seeded with `session_replication_role = replica` so the
-- last-message and status triggers stay out of the way; the report itself is
-- filed through the one writer, `public.report_chat_conversation`.

begin;

create extension if not exists pgtap;

select plan(13);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

set local session_replication_role = replica;

insert into public.users (id, email, username)
values
  ('00000000-0000-0000-0000-0000000e0101', 'reporter-one@example.invalid', 'reporter-one'),
  ('00000000-0000-0000-0000-0000000e0102', 'reported-user@example.invalid', 'reported-user'),
  ('00000000-0000-0000-0000-0000000e0103', 'reporter-two@example.invalid', 'reporter-two'),
  ('00000000-0000-0000-0000-0000000e0104', 'stranger@example.invalid', 'stranger');

insert into public.chat_conversations (id, kind, title, status, created_by)
values (
  '00000000-0000-0000-0000-0000000e0201',
  'group',
  'فريق المراجعة',
  'active',
  '00000000-0000-0000-0000-0000000e0101'
);

insert into public.chat_participants (conversation_id, user_id, role, status)
values
  (
    '00000000-0000-0000-0000-0000000e0201',
    '00000000-0000-0000-0000-0000000e0101',
    'owner',
    'active'
  ),
  (
    '00000000-0000-0000-0000-0000000e0201',
    '00000000-0000-0000-0000-0000000e0102',
    'member',
    'active'
  ),
  (
    '00000000-0000-0000-0000-0000000e0201',
    '00000000-0000-0000-0000-0000000e0103',
    'member',
    'active'
  );

insert into public.chat_messages (id, conversation_id, sender_id, body, created_at)
values
  (
    '00000000-0000-0000-0000-0000000e0301',
    '00000000-0000-0000-0000-0000000e0201',
    '00000000-0000-0000-0000-0000000e0102',
    'رسالة مسيئة',
    now() - interval '3 minutes'
  ),
  (
    '00000000-0000-0000-0000-0000000e0302',
    '00000000-0000-0000-0000-0000000e0201',
    '00000000-0000-0000-0000-0000000e0101',
    'ردّي أنا',
    now() - interval '2 minutes'
  );

set local session_replication_role = origin;

-- Two reports, each filed by a different member. The reasons differ so a read
-- that sees the other reporter's row is detectable rather than a count alone.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000e0101')::text,
  true
);
set local role authenticated;
select ok(
  public.report_chat_conversation(
    '00000000-0000-0000-0000-0000000e0201',
    'إساءة من العضو',
    '00000000-0000-0000-0000-0000000e0102'
  ) is not null,
  'the first reporter files a report'
);
reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000e0103')::text,
  true
);
set local role authenticated;
select ok(
  public.report_chat_conversation(
    '00000000-0000-0000-0000-0000000e0201',
    'مضايقة متكررة',
    '00000000-0000-0000-0000-0000000e0102'
  ) is not null,
  'a second reporter files a report'
);
reset role;

-- ---------------------------------------------------------------------------
-- The grant and the policy
-- ---------------------------------------------------------------------------

select ok(
  has_table_privilege('authenticated', 'public.chat_reports', 'select'),
  'authenticated keeps the SELECT grant, constrained by RLS'
);

select ok(
  has_table_privilege('service_role', 'public.chat_reports', 'update'),
  'service_role holds the UPDATE a status decision needs'
);

-- ---------------------------------------------------------------------------
-- A reporter reads their own row and nobody else's
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000e0101')::text,
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.chat_reports),
  1,
  'the first reporter reads exactly one report'
);
select is(
  (select reason from public.chat_reports),
  'إساءة من العضو',
  'the first reporter reads their own report, not the other member''s'
);
reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000e0103')::text,
  true
);
set local role authenticated;
select is(
  (select reason from public.chat_reports),
  'مضايقة متكررة',
  'the second reporter reads their own report'
);
reset role;

-- The reported member is in the thread but filed nothing, so the policy's
-- reporter branch is false and only an Admin could read it.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000e0102')::text,
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.chat_reports),
  0,
  'the reported member reads no report'
);
reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000e0104')::text,
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.chat_reports),
  0,
  'a signed-in non-admin reads no report'
);
reset role;

-- An Admin is identified by the verified email claim, not by a client flag.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-0000000e0104',
    'email', (select admin_emails[1] from public.app_settings where id)
  )::text,
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.chat_reports),
  2,
  'an Admin reads every report'
);
reset role;

-- ---------------------------------------------------------------------------
-- The snapshot is frozen
-- ---------------------------------------------------------------------------

select is(
  (
    select jsonb_array_length(snapshot)
      from public.chat_reports
     where reporter_id = '00000000-0000-0000-0000-0000000e0101'
  ),
  2,
  'the snapshot captured the thread at report time'
);

set local session_replication_role = replica;
delete from public.chat_messages where id = '00000000-0000-0000-0000-0000000e0301';
set local session_replication_role = origin;

select is(
  (
    select count(*)::integer
      from public.chat_messages
     where id = '00000000-0000-0000-0000-0000000e0301'
  ),
  0,
  'the reported message really was deleted'
);

select is(
  (
    select snapshot @> '[{"body": "رسالة مسيئة"}]'::jsonb
      from public.chat_reports
     where reporter_id = '00000000-0000-0000-0000-0000000e0101'
  ),
  true,
  'deleting the message leaves the frozen snapshot unchanged'
);

select * from finish();

rollback;
