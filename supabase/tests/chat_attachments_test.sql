-- Assertions for the chat attachment bucket, its path guard and its delete
-- policy (#815, ADR-0113). Run with `supabase test db` against the local stack.
--
-- The rule these assert is the one sentence the whole change hangs on: the same
-- membership that guards the thread guards the object, so a path outside a
-- thread the caller belongs to is refused, and a row whose path names another
-- conversation is refused before it can ever be signed.
--
-- Fixtures are seeded with `session_replication_role = replica` (storage's own
-- triggers stay out of the way) and every assertion runs as `authenticated` with
-- a member's JWT. The file rolls back.

begin;

create extension if not exists pgtap;

select plan(10);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

set local session_replication_role = replica;

insert into public.users (id, email, username)
values
  ('00000000-0000-0000-0000-0000000d0101', 'att-me@example.invalid', 'att-me'),
  ('00000000-0000-0000-0000-0000000d0102', 'att-them@example.invalid', 'att-them'),
  ('00000000-0000-0000-0000-0000000d0103', 'att-out@example.invalid', 'att-out');

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

insert into public.chat_messages (id, conversation_id, sender_id, body, created_at)
values (
  '00000000-0000-0000-0000-0000000d0301',
  '00000000-0000-0000-0000-0000000d0201',
  '00000000-0000-0000-0000-0000000d0101',
  'مع ملف',
  now()
);

insert into storage.objects (id, bucket_id, name, owner)
values (
  '00000000-0000-0000-0000-0000000d0401',
  'chat-attachments',
  '00000000-0000-0000-0000-0000000d0201/00000000-0000-0000-0000-0000000d0501/a.pdf',
  '00000000-0000-0000-0000-0000000d0101'
);

set local session_replication_role = origin;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0101')::text,
  true
);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- The row's path names its own conversation
-- ---------------------------------------------------------------------------

select is(
  (
    with stored as (
      insert into public.chat_attachments
        (message_id, uploader_id, storage_path, file_name, mime_type, byte_size)
      values (
        '00000000-0000-0000-0000-0000000d0301',
        '00000000-0000-0000-0000-0000000d0101',
        '00000000-0000-0000-0000-0000000d0201/00000000-0000-0000-0000-0000000d0501/a.pdf',
        'a.pdf',
        'application/pdf',
        2048
      )
      returning 1
    )
    select count(*)::integer from stored
  ),
  1,
  'a member stores an attachment in the thread''s own folder'
);

select throws_ok(
  $$
    insert into public.chat_attachments
      (message_id, uploader_id, storage_path, file_name, mime_type, byte_size)
    values (
      '00000000-0000-0000-0000-0000000d0301',
      '00000000-0000-0000-0000-0000000d0101',
      '00000000-0000-0000-0000-0000000d9999/00000000-0000-0000-0000-0000000d0502/b.pdf',
      'b.pdf',
      'application/pdf',
      2048
    )
  $$,
  '42501',
  'an attachment lives in its conversation folder',
  'a path naming another conversation is refused'
);

select throws_ok(
  $$
    insert into public.chat_attachments
      (message_id, uploader_id, storage_path, file_name, mime_type, byte_size)
    values (
      '00000000-0000-0000-0000-0000000d0301',
      '00000000-0000-0000-0000-0000000d0101',
      'a.pdf',
      'a.pdf',
      'application/pdf',
      2048
    )
  $$,
  '42501',
  'an attachment lives in its conversation folder',
  'a path without the thread folder is refused'
);

select is(
  public.chat_attachment_bytes_used(),
  2048::bigint,
  'the composer reads the caller''s own stored bytes'
);

-- ---------------------------------------------------------------------------
-- The bucket asks the same membership question
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::integer
      from storage.objects
     where name =
       '00000000-0000-0000-0000-0000000d0201/00000000-0000-0000-0000-0000000d0501/a.pdf'
  ),
  1,
  'a member reads an object of their thread'
);

select is(
  (
    with uploaded as (
      insert into storage.objects (bucket_id, name, owner)
      values (
        'chat-attachments',
        '00000000-0000-0000-0000-0000000d0201/00000000-0000-0000-0000-0000000d0502/b.pdf',
        '00000000-0000-0000-0000-0000000d0101'
      )
      returning 1
    )
    select count(*)::integer from uploaded
  ),
  1,
  'a member uploads into their own thread folder'
);

-- The outsider: same bucket, a thread they are not in.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0103')::text,
  true
);

select is(
  (
    select count(*)::integer
      from storage.objects
     where name =
       '00000000-0000-0000-0000-0000000d0201/00000000-0000-0000-0000-0000000d0501/a.pdf'
  ),
  0,
  'a non-member reads nothing from the thread'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner)
    values (
      'chat-attachments',
      '00000000-0000-0000-0000-0000000d0201/00000000-0000-0000-0000-0000000d0503/c.pdf',
      '00000000-0000-0000-0000-0000000d0103'
    )
  $$,
  '42501',
  null,
  'a non-member cannot upload into the thread'
);

-- ---------------------------------------------------------------------------
-- Deleting an attachment row is the uploader's
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0102')::text,
  true
);
set local role authenticated;

select is(
  (
    with deleted as (
      delete from public.chat_attachments
       where storage_path =
         '00000000-0000-0000-0000-0000000d0201/00000000-0000-0000-0000-0000000d0501/a.pdf'
      returning 1
    )
    select count(*)::integer from deleted
  ),
  0,
  'another member cannot delete the row'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0101')::text,
  true
);
set local role authenticated;

select is(
  (
    with deleted as (
      delete from public.chat_attachments
       where storage_path =
         '00000000-0000-0000-0000-0000000d0201/00000000-0000-0000-0000-0000000d0501/a.pdf'
      returning 1
    )
    select count(*)::integer from deleted
  ),
  1,
  'the uploader deletes their own row'
);

select * from finish();

rollback;
