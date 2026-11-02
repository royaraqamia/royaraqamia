-- Assertions for the Free-plan attachment allowances (#852, ADR-0113).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- Four caps, four refusals: the file, the caller's day, the caller's total, and
-- the project's. The day is Damascus midnight, so the fixtures seed one row from
-- two days ago — it counts against the member's total and not against today,
-- which is what makes the total cap testable apart from the daily one.
--
-- The caps are shrunk to bytes here (`app_settings` is the point), so the
-- arithmetic is readable. Everything runs in the transaction this file rolls
-- back.

begin;

create extension if not exists pgtap;

select plan(11);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

set local session_replication_role = replica;

insert into public.users (id, email, username)
values (
  '00000000-0000-0000-0000-0000000e0101',
  'allow-me@example.invalid',
  'allow-me'
);

insert into public.chat_conversations (id, kind, status, created_by)
values (
  '00000000-0000-0000-0000-0000000e0201',
  'direct',
  'active',
  '00000000-0000-0000-0000-0000000e0101'
);

insert into public.chat_participants (conversation_id, user_id, role, status)
values (
  '00000000-0000-0000-0000-0000000e0201',
  '00000000-0000-0000-0000-0000000e0101',
  'owner',
  'active'
);

insert into public.chat_messages (id, conversation_id, sender_id, body, created_at)
values (
  '00000000-0000-0000-0000-0000000e0301',
  '00000000-0000-0000-0000-0000000e0201',
  '00000000-0000-0000-0000-0000000e0101',
  'مع مرفق',
  now()
);

-- Two days old: it counts against the member's total, not against today.
insert into public.chat_attachments
  (message_id, uploader_id, storage_path, file_name, mime_type, byte_size, created_at)
values (
  '00000000-0000-0000-0000-0000000e0301',
  '00000000-0000-0000-0000-0000000e0101',
  '00000000-0000-0000-0000-0000000e0201/00000000-0000-0000-0000-0000000e0501/old.pdf',
  'old.pdf',
  'application/pdf',
  5000,
  now() - interval '2 days'
);

set local session_replication_role = origin;

-- A file cap of 1000 bytes, a day of 1500, room for the total and the project.
update public.app_settings
   set chat_attachment_file_bytes = 1000,
       chat_attachment_daily_bytes = 1500,
       chat_attachment_member_bytes = 100000,
       chat_attachment_project_bytes = 100000
 where id;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000e0101')::text,
  true
);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- The file, the day
-- ---------------------------------------------------------------------------

select throws_ok(
  $$
    insert into public.chat_attachments
      (message_id, uploader_id, storage_path, file_name, mime_type, byte_size)
    values (
      '00000000-0000-0000-0000-0000000e0301',
      '00000000-0000-0000-0000-0000000e0101',
      '00000000-0000-0000-0000-0000000e0201/00000000-0000-0000-0000-0000000e0502/big.pdf',
      'big.pdf',
      'application/pdf',
      1001
    )
  $$,
  '53400',
  'chat attachment file is too large',
  'a file above the configured cap is refused'
);

select is(
  (
    with stored as (
      insert into public.chat_attachments
        (message_id, uploader_id, storage_path, file_name, mime_type, byte_size)
      values (
        '00000000-0000-0000-0000-0000000e0301',
        '00000000-0000-0000-0000-0000000e0101',
        '00000000-0000-0000-0000-0000000e0201/00000000-0000-0000-0000-0000000e0503/a.pdf',
        'a.pdf',
        'application/pdf',
        1000
      )
      returning 1
    )
    select count(*)::integer from stored
  ),
  1,
  'a file at the cap is stored'
);

select throws_ok(
  $$
    insert into public.chat_attachments
      (message_id, uploader_id, storage_path, file_name, mime_type, byte_size)
    values (
      '00000000-0000-0000-0000-0000000e0301',
      '00000000-0000-0000-0000-0000000e0101',
      '00000000-0000-0000-0000-0000000e0201/00000000-0000-0000-0000-0000000e0504/c.pdf',
      'c.pdf',
      'application/pdf',
      1000
    )
  $$,
  '53400',
  'chat attachment daily allowance reached',
  'the file that would cross the day is refused'
);

-- ---------------------------------------------------------------------------
-- The member's total, apart from the day
-- ---------------------------------------------------------------------------

reset role;
update public.app_settings
   set chat_attachment_daily_bytes = 6000,
       chat_attachment_member_bytes = 6000
 where id;
set local role authenticated;

select throws_ok(
  $$
    insert into public.chat_attachments
      (message_id, uploader_id, storage_path, file_name, mime_type, byte_size)
    values (
      '00000000-0000-0000-0000-0000000e0301',
      '00000000-0000-0000-0000-0000000e0101',
      '00000000-0000-0000-0000-0000000e0201/00000000-0000-0000-0000-0000000e0505/d.pdf',
      'd.pdf',
      'application/pdf',
      1000
    )
  $$,
  '53400',
  'chat attachment storage is full',
  'the old row counts against the member even though it is not today'
);

-- ---------------------------------------------------------------------------
-- The project's wall
-- ---------------------------------------------------------------------------

reset role;
update public.app_settings
   set chat_attachment_daily_bytes = 1000000,
       chat_attachment_member_bytes = 1000000,
       chat_attachment_project_bytes = 7000
 where id;
set local role authenticated;

select is(
  (
    with stored as (
      insert into public.chat_attachments
        (message_id, uploader_id, storage_path, file_name, mime_type, byte_size)
      values (
        '00000000-0000-0000-0000-0000000e0301',
        '00000000-0000-0000-0000-0000000e0101',
        '00000000-0000-0000-0000-0000000e0201/00000000-0000-0000-0000-0000000e0506/e.pdf',
        'e.pdf',
        'application/pdf',
        1000
      )
      returning 1
    )
    select count(*)::integer from stored
  ),
  1,
  'a file that lands exactly on the project wall is stored'
);

select throws_ok(
  $$
    insert into public.chat_attachments
      (message_id, uploader_id, storage_path, file_name, mime_type, byte_size)
    values (
      '00000000-0000-0000-0000-0000000e0301',
      '00000000-0000-0000-0000-0000000e0101',
      '00000000-0000-0000-0000-0000000e0201/00000000-0000-0000-0000-0000000e0507/f.pdf',
      'f.pdf',
      'application/pdf',
      1000
    )
  $$,
  '53400',
  'chat attachment project storage is full',
  'the file that would cross the project budget is refused'
);

-- ---------------------------------------------------------------------------
-- What the composer reads
-- ---------------------------------------------------------------------------

select is(
  (select file_bytes from public.chat_attachment_allowance()),
  1000::bigint,
  'the allowance carries the configured file cap'
);

select is(
  (select today_used_bytes from public.chat_attachment_allowance()),
  2000::bigint,
  'today counts only what was stored today'
);

select is(
  (select total_used_bytes from public.chat_attachment_allowance()),
  7000::bigint,
  'the member total includes the row from two days ago'
);

select is(
  (select project_limit_bytes from public.chat_attachment_allowance()),
  7000::bigint,
  'the project budget is the one the settings row names'
);

reset role;

select is(
  (
    select file_size_limit
      from storage.buckets
     where id = 'chat-attachments'
  ),
  10485760::bigint,
  'the bucket refuses a file above the default 10 MB before the trigger sees it'
);

select * from finish();

rollback;
