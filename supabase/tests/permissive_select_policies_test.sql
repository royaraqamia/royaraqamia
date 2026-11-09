-- One permissive SELECT policy per table, and the access matrix it keeps (#1188)
--
-- `supabase_get_advisors` flagged `multiple_permissive_policies` for
-- `public.certificates` and `public.chat_conversations`: two permissive SELECT
-- policies for `authenticated` mean two policy evaluations per row. The merge in
-- `20261116130000_merge_permissive_select_policies.sql` puts each pair's
-- conditions in one policy. This file pins both halves of that promise - the
-- catalog has a single permissive SELECT policy for the role, and every branch
-- of the merged `using` expression still answers what it answered before.
--
-- Run with `supabase test db` against the local stack - see README.md. The whole
-- file rolls back, and the fixtures are seeded with `session_replication_role =
-- replica` so the chat triggers stay out of the way.

begin;

create extension if not exists pgtap;

select plan(10);

-- ---------------------------------------------------------------------------
-- The advisor lint: one permissive SELECT policy per role per table
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::integer
      from pg_policies
     where schemaname = 'public'
       and tablename = 'certificates'
       and cmd = 'SELECT'
       and permissive = 'PERMISSIVE'
       and 'authenticated' = any (roles::text[])
  ),
  1,
  'certificates carries one permissive SELECT policy for authenticated'
);

select is(
  (
    select count(*)::integer
      from pg_policies
     where schemaname = 'public'
       and tablename = 'chat_conversations'
       and cmd = 'SELECT'
       and permissive = 'PERMISSIVE'
       and 'authenticated' = any (roles::text[])
  ),
  1,
  'chat_conversations carries one permissive SELECT policy for authenticated'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

set local session_replication_role = replica;

insert into public.users (id, email, username)
values
  ('00000000-0000-0000-0000-000000001101', 'merge-owner@example.invalid', 'merge-owner'),
  ('00000000-0000-0000-0000-000000001102', 'merge-peer@example.invalid', 'merge-peer'),
  ('00000000-0000-0000-0000-000000001103', 'merge-stranger@example.invalid', 'merge-stranger');

-- Two certificates with different recipients: the recipient branch answers one
-- of them per caller, and the admin branch answers both.
insert into public.certificates (
  id, certificate_code, student_name, course_name, issue_date, recipient_user_ids
)
values
  (
    '00000000-0000-0000-0000-000000001201',
    'MERGE-CERT-1',
    'merge-owner',
    'course',
    current_date,
    array['00000000-0000-0000-0000-000000001101'::uuid]
  ),
  (
    '00000000-0000-0000-0000-000000001202',
    'MERGE-CERT-2',
    'merge-peer',
    'course',
    current_date,
    array['00000000-0000-0000-0000-000000001102'::uuid]
  );

-- One thread the creator opened and nobody has joined (the creator branch
-- answers it) and one with a live roster (the helper branch answers it).
insert into public.chat_conversations (id, kind, status, created_by)
values
  (
    '00000000-0000-0000-0000-000000001301',
    'direct',
    'requested',
    '00000000-0000-0000-0000-000000001101'
  ),
  (
    '00000000-0000-0000-0000-000000001302',
    'direct',
    'active',
    '00000000-0000-0000-0000-000000001101'
  );

insert into public.chat_participants (conversation_id, user_id, role, status)
values
  (
    '00000000-0000-0000-0000-000000001302',
    '00000000-0000-0000-0000-000000001101',
    'owner',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000001302',
    '00000000-0000-0000-0000-000000001102',
    'member',
    'active'
  );

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- certificates: recipient, non-recipient, Admin, anon
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000001101')::text,
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
      from public.certificates
     where id = '00000000-0000-0000-0000-000000001201'
  ),
  1,
  'a recipient still reads their own certificate'
);

select is(
  (
    select count(*)::integer
      from public.certificates
     where id = '00000000-0000-0000-0000-000000001202'
  ),
  0,
  'a recipient still reads no other recipient''s certificate'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000001103')::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.certificates),
  0,
  'a signed-in non-recipient still reads no certificate'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-000000001103',
    'email', (select admin_emails[1] from public.app_settings where id)
  )::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.certificates),
  2,
  'an Admin still reads every certificate'
);

reset role;
set local role anon;

select is(
  (
    select count(*)::integer
      from public.certificates
     where certificate_code = 'MERGE-CERT-1'
  ),
  1,
  'anon still verifies a certificate by code'
);

-- ---------------------------------------------------------------------------
-- chat_conversations: creator, participant, non-participant
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000001101')::text,
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
      from public.chat_conversations
     where id = '00000000-0000-0000-0000-000000001301'
  ),
  1,
  'a creator still reads the thread they opened before anyone joined'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000001102')::text,
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
      from public.chat_conversations
     where id = '00000000-0000-0000-0000-000000001302'
  ),
  1,
  'a participant still reads their conversation through the helper'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000001103')::text,
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
      from public.chat_conversations
     where id in (
       '00000000-0000-0000-0000-000000001301',
       '00000000-0000-0000-0000-000000001302'
     )
  ),
  0,
  'a non-participant still reads no conversation'
);

reset role;

select * from finish();

rollback;
