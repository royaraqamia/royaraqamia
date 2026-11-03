-- Assertions for the one-assistant-thread invariant (#890).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- The assistant's thread is one per member: `private.enforce_one_agent_thread`
-- refuses a second `kind = 'agent'` conversation for the same `created_by`
-- under an advisory lock, so two concurrent opens (two tabs, a retried POST,
-- two devices) cannot both insert. Everything below is the invariant, the
-- refusal's code, and the rows the trigger must keep leaving alone.
--
-- The fixtures are seeded with the trigger live, and the whole file rolls back.

begin;

create extension if not exists pgtap;

select plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into public.users (id, email, username)
values
  ('00000000-0000-0000-0000-0000000f0101', 'agent-a@example.invalid', 'agent-a'),
  ('00000000-0000-0000-0000-0000000f0102', 'agent-b@example.invalid', 'agent-b');

-- ---------------------------------------------------------------------------
-- One agent thread per member
-- ---------------------------------------------------------------------------

select lives_ok(
  $$
    insert into public.chat_conversations (id, kind, status, created_by)
    values (
      '00000000-0000-0000-0000-0000000f0201',
      'agent',
      'active',
      '00000000-0000-0000-0000-0000000f0101'
    )
  $$,
  'the first assistant thread for a member is accepted'
);

select throws_ok(
  $$
    insert into public.chat_conversations (kind, status, created_by)
    values ('agent', 'active', '00000000-0000-0000-0000-0000000f0101')
  $$,
  '23505',
  'a second assistant thread for the same member is refused'
);

select is(
  (
    select count(*)::integer
      from public.chat_conversations
     where kind = 'agent'
       and created_by = '00000000-0000-0000-0000-0000000f0101'
  ),
  1,
  'the refusal left the one assistant thread in place'
);

-- ---------------------------------------------------------------------------
-- Every other kind is unaffected
-- ---------------------------------------------------------------------------

select lives_ok(
  $$
    insert into public.chat_conversations (kind, title, status, created_by)
    values ('group', 'فريق', 'active', '00000000-0000-0000-0000-0000000f0101')
  $$,
  'a group by the same member is accepted'
);

select lives_ok(
  $$
    insert into public.chat_conversations (kind, status, created_by)
    values ('direct', 'requested', '00000000-0000-0000-0000-0000000f0101')
  $$,
  'a direct thread by the same member is accepted'
);

select lives_ok(
  $$
    insert into public.chat_conversations (kind, status, created_by)
    values ('agent', 'active', '00000000-0000-0000-0000-0000000f0102')
  $$,
  'another member still gets their own assistant thread'
);

select * from finish();

rollback;
