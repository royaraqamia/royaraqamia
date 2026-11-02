-- Assertions for the account's plan reads (#881).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- `/account/plan` is one read of three: `get_usage_counters`,
-- `get_owned_item_states` and the activation history. The middle one loops over
-- `plan_limits` and calls `private.owned_item_count` for each row, so a key that
-- switch does not handle (it raised `22023` for `mcp_connected_apps`, twice) is
-- not a wrong number - it is the whole page failing for every account. The first
-- two assertions are that guard.
--
-- The rest pin the Admin exemption the assistant's own allowance forgot: an
-- Admin holds no `user_plans` row, and `record_usage`, `get_usage_counters` and
-- now `chat_agent_allowance` all have to answer for that.

begin;

create extension if not exists pgtap;

select plan(10);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

-- 'free' never bought a plan, 'admin' is the allowlisted account, 'pro' holds a
-- live activation.
select set_config('test.free', '00000000-0000-0000-0000-00000000dd01', true);
select set_config('test.admin', '00000000-0000-0000-0000-00000000dd02', true);
select set_config('test.pro', '00000000-0000-0000-0000-00000000dd03', true);

set local session_replication_role = replica;

insert into public.users (id, email, username, is_admin)
values
  ('00000000-0000-0000-0000-00000000dd01', 'read-free@example.invalid', 'read-free', false),
  ('00000000-0000-0000-0000-00000000dd02', 'read-admin@example.invalid', 'read-admin', true),
  ('00000000-0000-0000-0000-00000000dd03', 'read-pro@example.invalid', 'read-pro', false);

insert into public.user_plans (user_id, plan, expires_at)
values ('00000000-0000-0000-0000-00000000dd03', 'pro', now() + interval '30 days');

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- The owned-item read answers, for every capped item
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.get_owned_item_states('00000000-0000-0000-0000-00000000dd01'::uuid) $$,
  'the owned-item read answers for a Free member instead of raising on a key it cannot count'
);

select is(
  jsonb_array_length(public.get_owned_item_states('00000000-0000-0000-0000-00000000dd01'::uuid)),
  (select count(*)::integer from public.plan_limits),
  'the owned-item read answers one row per plan_limits row'
);

-- A key with no branch raises inside the read, so this is the regression guard
-- for the next rewrite of `private.owned_item_count`.
select is_empty(
  $$ select l.key
       from public.plan_limits l
      where private.owned_item_count('00000000-0000-0000-0000-00000000dd01'::uuid, l.key) is null $$,
  'every plan_limits key has a branch in private.owned_item_count'
);

-- ---------------------------------------------------------------------------
-- An Admin is unlimited in the reads, and is Pro to the assistant
-- ---------------------------------------------------------------------------

select ok(
  (
    select bool_and((item ->> 'cap')::integer = 0)
      from jsonb_array_elements(
             public.get_owned_item_states('00000000-0000-0000-0000-00000000dd02'::uuid)
           ) as item
  ),
  'an Admin''s owned-item caps read as the unlimited placeholder, not the Free caps'
);

select ok(
  (public.get_usage_counters('00000000-0000-0000-0000-00000000dd02'::uuid) ->> 'unlimited')::boolean,
  'get_usage_counters reports an Admin as unlimited'
);

select results_eq(
  $$ select plan, member_cap from public.chat_agent_allowance('00000000-0000-0000-0000-00000000dd02'::uuid) $$,
  $$ values ('pro'::text, 40) $$,
  'an Admin is answered as Pro with the Pro allowance, so the assistant is not locked behind an upgrade'
);

select results_eq(
  $$ select plan, member_cap from public.chat_agent_allowance('00000000-0000-0000-0000-00000000dd03'::uuid) $$,
  $$ values ('pro'::text, 40) $$,
  'a live Pro activation still reads as Pro'
);

select results_eq(
  $$ select plan, member_cap from public.chat_agent_allowance('00000000-0000-0000-0000-00000000dd01'::uuid) $$,
  $$ values ('free'::text, 0) $$,
  'a Free member still reads as Free, with no assistant allowance'
);

-- ---------------------------------------------------------------------------
-- The counting wall agrees with the reads
-- ---------------------------------------------------------------------------

select ok(
  (public.record_usage('chat.agent.turn', '00000000-0000-0000-0000-00000000dd02'::uuid) ->> 'allowed')::boolean,
  'record_usage lets an Admin''s turn through'
);

select ok(
  not (public.record_usage('chat.agent.turn', '00000000-0000-0000-0000-00000000dd01'::uuid) ->> 'allowed')::boolean,
  'record_usage still refuses a Free member''s turn'
);

select * from finish();

rollback;
