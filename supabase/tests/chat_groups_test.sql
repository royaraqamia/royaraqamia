-- Assertions for groups: the owned-item cap and the member ceiling (#814,
-- ADR-0113). Run with `supabase test db` against the local stack - see README.md.
--
-- Two numbers bound a group, and both are enforced in Postgres rather than in
-- the request handler:
--
--   * how many groups one member owns - `plan_limits.chat_groups`, 3 on Free and
--     20 on Pro, counted by `private.owned_item_count` as "created and not left"
--     and enforced by `private.enforce_owned_item_cap` on chat_conversations;
--   * how many members one group holds - 32, enforced by
--     `private.enforce_chat_thread_size` on chat_participants.
--
-- The first block runs as the table owner, like `plan_cap_enforcement_test.sql`:
-- the trigger under test is the cap, not the policy. The second block runs as
-- `authenticated` with a member's own JWT, because "only a member may invite"
-- and "an invite is never `active` for somebody else" are policy answers.
--
-- Fixtures are seeded with `session_replication_role = replica` so the caps are
-- not consulted while the state they are about is built, and the whole file
-- rolls back.

begin;

create extension if not exists pgtap;

select plan(16);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

set local session_replication_role = replica;

-- One owner (…0f0001) and forty members to fill a group and overflow it.
insert into public.users (id, email, username)
select
  ('00000000-0000-0000-0000-0000000f' || lpad(n::text, 4, '0'))::uuid,
  'group-' || n || '@example.invalid',
  'group-' || n
from generate_series(1, 41) as n;

-- The group the member ceiling is measured on: owned by …0f0002, with the
-- caller …0f0001 already active in it, so A may invite there while owning no
-- group of their own.
insert into public.chat_conversations (id, kind, title, status, created_by)
values (
  '00000000-0000-0000-0000-0000000f0205',
  'group',
  'فريق كبير',
  'active',
  '00000000-0000-0000-0000-0000000f0002'
);

insert into public.chat_participants (conversation_id, user_id, role, status)
values
  ('00000000-0000-0000-0000-0000000f0205', '00000000-0000-0000-0000-0000000f0002', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000f0205', '00000000-0000-0000-0000-0000000f0001', 'member', 'active');

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- The owned-item cap: three on Free, and a direct thread is not a slot
-- ---------------------------------------------------------------------------

reset role;

select is(
  private.owned_item_count('00000000-0000-0000-0000-0000000f0001', 'chat_groups'),
  0,
  'a member who created no group owns none'
);

select lives_ok(
  $$
    insert into public.chat_conversations (id, kind, title, status, created_by)
    values (
      '00000000-0000-0000-0000-0000000f0201',
      'group',
      'المجموعة الأولى',
      'active',
      '00000000-0000-0000-0000-0000000f0001'
    )
  $$,
  'the first group is allowed at the free cap'
);

select lives_ok(
  $$
    insert into public.chat_conversations (id, kind, title, status, created_by)
    values (
      '00000000-0000-0000-0000-0000000f0202',
      'group',
      'المجموعة الثانية',
      'active',
      '00000000-0000-0000-0000-0000000f0001'
    )
  $$,
  'the second group is allowed at the free cap'
);

select lives_ok(
  $$
    insert into public.chat_conversations (id, kind, title, status, created_by)
    values (
      '00000000-0000-0000-0000-0000000f0203',
      'group',
      'المجموعة الثالثة',
      'active',
      '00000000-0000-0000-0000-0000000f0001'
    )
  $$,
  'the third group is allowed at the free cap'
);

select throws_ok(
  $$
    insert into public.chat_conversations (id, kind, title, status, created_by)
    values (
      '00000000-0000-0000-0000-0000000f0204',
      'group',
      'المجموعة الرابعة',
      'active',
      '00000000-0000-0000-0000-0000000f0001'
    )
  $$,
  'PL001',
  null,
  'a fourth group is refused at the free cap'
);

-- The predicate, not a row count on the table: a direct thread is not a group.
select lives_ok(
  $$
    insert into public.chat_conversations (id, kind, status, created_by)
    values (
      '00000000-0000-0000-0000-0000000f0206',
      'direct',
      'requested',
      '00000000-0000-0000-0000-0000000f0001'
    )
  $$,
  'a direct thread opened at the group cap is not refused'
);

-- Leaving is the exit that frees a group slot: nothing is hard-deleted.
insert into public.chat_participants (conversation_id, user_id, role, status)
values (
  '00000000-0000-0000-0000-0000000f0201',
  '00000000-0000-0000-0000-0000000f0001',
  'owner',
  'left'
);

select is(
  private.owned_item_count('00000000-0000-0000-0000-0000000f0001', 'chat_groups'),
  2,
  'a group the member left no longer holds a slot'
);

select lives_ok(
  $$
    insert into public.chat_conversations (id, kind, title, status, created_by)
    values (
      '00000000-0000-0000-0000-0000000f0204',
      'group',
      'المجموعة الرابعة',
      'active',
      '00000000-0000-0000-0000-0000000f0001'
    )
  $$,
  'the freed slot accepts the fourth group'
);

select is(
  private.owned_item_count('00000000-0000-0000-0000-0000000f0001', 'chat_groups'),
  3,
  'the count agrees with what the cap enforced'
);

-- ---------------------------------------------------------------------------
-- The member ceiling: 32 live rows, and only a member may invite
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000f0001')::text,
  true
);
set local role authenticated;

-- Two roster rows exist already, so thirty invites fill the room.
do $$
declare
  n integer;
begin
  for n in 3..32 loop
    insert into public.chat_participants (conversation_id, user_id, status, invited_by)
    values (
      '00000000-0000-0000-0000-0000000f0205',
      ('00000000-0000-0000-0000-0000000f' || lpad(n::text, 4, '0'))::uuid,
      'invited',
      '00000000-0000-0000-0000-0000000f0001'
    );
  end loop;
end;
$$;

select is(
  (
    select count(*)::integer
      from public.chat_participants
     where conversation_id = '00000000-0000-0000-0000-0000000f0205'
       and status in ('requested', 'invited', 'active')
  ),
  32,
  'a group holds its thirty-two members'
);

select throws_ok(
  $$
    insert into public.chat_participants (conversation_id, user_id, status, invited_by)
    values (
      '00000000-0000-0000-0000-0000000f0205',
      '00000000-0000-0000-0000-0000000f0033',
      'invited',
      '00000000-0000-0000-0000-0000000f0001'
    )
  $$,
  'CH001',
  null,
  'the thirty-third member is refused'
);

-- A declined invite holds no seat, so the next invite fits.
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000f0004')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$
    update public.chat_participants
       set status = 'declined',
           joined_at = null
     where conversation_id = '00000000-0000-0000-0000-0000000f0205'
       and user_id = '00000000-0000-0000-0000-0000000f0004'
  $$,
  'an invited member declines'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000f0001')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into public.chat_participants (conversation_id, user_id, status, invited_by)
    values (
      '00000000-0000-0000-0000-0000000f0205',
      '00000000-0000-0000-0000-0000000f0033',
      'invited',
      '00000000-0000-0000-0000-0000000f0001'
    )
  $$,
  'a declined row frees the seat the next invite takes'
);

-- An invite is never an active row for somebody else, whoever sends it.
select throws_ok(
  $$
    insert into public.chat_participants (conversation_id, user_id, status, invited_by)
    values (
      '00000000-0000-0000-0000-0000000f0205',
      '00000000-0000-0000-0000-0000000f0034',
      'active',
      '00000000-0000-0000-0000-0000000f0001'
    )
  $$,
  '42501',
  'a member cannot add somebody else as active'
);

-- A stranger is outside the room: no invite, and no roster read either.
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000f0036')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$
    insert into public.chat_participants (conversation_id, user_id, status, invited_by)
    values (
      '00000000-0000-0000-0000-0000000f0205',
      '00000000-0000-0000-0000-0000000f0037',
      'invited',
      '00000000-0000-0000-0000-0000000f0036'
    )
  $$,
  '42501',
  'a non-member cannot invite anybody'
);

select is(
  (
    select count(*)::integer
      from public.chat_participants
     where conversation_id = '00000000-0000-0000-0000-0000000f0205'
       and user_id = '00000000-0000-0000-0000-0000000f0036'
  ),
  0,
  'a non-member reads no roster row of the group'
);

select * from finish();

rollback;
