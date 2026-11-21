-- Assertions for the resumable attachment sweep (#1701). Run with
-- `supabase test db` against the local stack - see README.md.
--
-- The contract is the one the night's job depends on: a page is a keyset over
-- `storage.objects`, not a folder walk, the position survives in one state row,
-- and the bucket's own bytes are visible beside the row-summed bytes the quota
-- counts. The two reads are service-role only: an orphan has no row for RLS to
-- answer to. This file rolls back.

begin;

create extension if not exists pgtap;

select plan(8);

set local session_replication_role = replica;

insert into public.users (id, email, username)
values (
  '00000000-0000-0000-0000-0000000f0101',
  'sweep@example.invalid',
  'sweep-me'
);

insert into public.chat_conversations (id, kind, status, created_by)
values (
  '00000000-0000-0000-0000-0000000f0201',
  'direct',
  'active',
  '00000000-0000-0000-0000-0000000f0101'
);

insert into public.chat_participants (conversation_id, user_id, role, status)
values (
  '00000000-0000-0000-0000-0000000f0201',
  '00000000-0000-0000-0000-0000000f0101',
  'owner',
  'active'
);

insert into public.chat_messages (id, conversation_id, sender_id, body, created_at)
values (
  '00000000-0000-0000-0000-0000000f0301',
  '00000000-0000-0000-0000-0000000f0201',
  '00000000-0000-0000-0000-0000000f0101',
  'مع مرفق',
  now()
);

-- One object a row claims and one orphan, with the sizes Storage records.
insert into storage.objects (id, bucket_id, name, owner, metadata)
values
  (
    '00000000-0000-0000-0000-0000000f0401',
    'chat-attachments',
    'sweep-test/a.pdf',
    '00000000-0000-0000-0000-0000000f0101',
    '{"size": 100}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-0000000f0402',
    'chat-attachments',
    'sweep-test/b.pdf',
    '00000000-0000-0000-0000-0000000f0101',
    '{"size": 200}'::jsonb
  );

insert into public.chat_attachments
  (message_id, uploader_id, storage_path, file_name, mime_type, byte_size)
values (
  '00000000-0000-0000-0000-0000000f0301',
  '00000000-0000-0000-0000-0000000f0101',
  'sweep-test/a.pdf',
  'a.pdf',
  'application/pdf',
  100
);

set local session_replication_role = origin;

-- The sweep runs on the service role, which is the only role that may read a
-- bucket no member owns a row in.
set local role service_role;

select is(
  (
    select array_agg(name order by name)
      from public.chat_attachment_sweep_page('sweep-test/a.pdf', 1000)
     where name like 'sweep-test/%'
  ),
  array['sweep-test/b.pdf']::text[],
  'a page starts strictly after the persisted name'
);

select is(
  (select bucket_objects from public.chat_attachment_sweep_stats()),
  2::bigint,
  'the stats read every object in the bucket'
);

select is(
  (select bucket_bytes from public.chat_attachment_sweep_stats()),
  300::bigint,
  'the stats sum the bytes Storage recorded'
);

select is(
  (select row_bytes from public.chat_attachment_sweep_stats()),
  100::bigint,
  'the stats show the row-summed bytes the quota sees beside them'
);

insert into public.chat_attachment_sweep_state (bucket, last_path, swept_at)
values ('chat-attachments', 'sweep-test/a.pdf', now())
on conflict (bucket) do update set last_path = excluded.last_path;

select is(
  (
    select last_path
      from public.chat_attachment_sweep_state
     where bucket = 'chat-attachments'
  ),
  'sweep-test/a.pdf',
  'the cursor survives an upsert between runs'
);

reset role;

select ok(
  not has_function_privilege(
    'authenticated',
    'public.chat_attachment_sweep_page(text,integer)',
    'execute'
  ),
  'a member cannot read the bucket page'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.chat_attachment_sweep_page(text,integer)',
    'execute'
  ),
  'the sweep reads the page on the service role'
);

select ok(
  not has_table_privilege('authenticated', 'public.chat_attachment_sweep_state', 'update'),
  'a member cannot move the cursor'
);

select * from finish();

rollback;
