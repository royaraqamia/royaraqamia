-- Assertions for the app-call allowance (#1226, ADR-0155 decision 9).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- One counter bounds every outbound call to an app we do not own, a read
-- exactly like a write, because all three things it guards — our egress, a
-- stranger's rate limit and the member's own day — are spent by a read.
--
-- What is asserted here is the database half: the catalogue row the composer
-- and the pricing page read, the free and Pro numbers, the sixth call of the
-- day, the visitor's zero, and the Admin exemption every counted action has.

begin;

create extension if not exists pgtap;

select plan(7);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

-- 'free' never bought a plan, 'admin' is the allowlisted account, 'pro' holds a
-- live activation.
select set_config('test.free', '00000000-0000-0000-0000-00000000ee01', true);
select set_config('test.admin', '00000000-0000-0000-0000-00000000ee02', true);
select set_config('test.pro', '00000000-0000-0000-0000-00000000ee03', true);

set local session_replication_role = replica;

insert into public.users (id, email, username, is_admin)
values
  ('00000000-0000-0000-0000-00000000ee01', 'call-free@example.invalid', 'call-free', false),
  ('00000000-0000-0000-0000-00000000ee02', 'call-admin@example.invalid', 'call-admin', true),
  ('00000000-0000-0000-0000-00000000ee03', 'call-pro@example.invalid', 'call-pro', false);

insert into public.user_plans (user_id, plan, expires_at)
values ('00000000-0000-0000-0000-00000000ee03', 'pro', now() + interval '30 days');

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- The catalogue row
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select "window", visitor_cap, free_cap, pro_cap
       from public.usage_limits
      where key = 'mcp.call' $$,
  $$ values ('daily'::text, 0, 5, 50) $$,
  'mcp.call is seeded daily at 5 on Free and 50 on Pro, and a visitor spends none'
);

select is(
  (
    select (counter ->> 'cap')::integer
      from jsonb_array_elements(
             public.get_usage_counters('00000000-0000-0000-0000-00000000ee01'::uuid) -> 'counters'
           ) as counter
     where counter ->> 'key' = 'mcp.call'
  ),
  5,
  'the composer''s number is the catalogue''s: a Free member reads the same 5 the wall enforces'
);

-- ---------------------------------------------------------------------------
-- The wall
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::integer
      from generate_series(1, 5) as attempt
     where (
       public.record_usage('mcp.call', '00000000-0000-0000-0000-00000000ee01'::uuid) ->> 'allowed'
     )::boolean
  ),
  5,
  'a Free member''s five calls of the day are all allowed'
);

select ok(
  not (
    public.record_usage('mcp.call', '00000000-0000-0000-0000-00000000ee01'::uuid) ->> 'allowed'
  )::boolean,
  'the sixth call of the day is refused before anything leaves the deployment'
);

select is(
  (
    public.record_usage('mcp.call', '00000000-0000-0000-0000-00000000ee03'::uuid) -> 'counter' ->> 'cap'
  )::integer,
  50,
  'a live Pro activation spends against 50, not the Free five'
);

select ok(
  not (
    public.record_usage('mcp.call', null, 'test-visitor-call') ->> 'allowed'
  )::boolean,
  'a visitor is refused: an external app has no visitor path (ADR-0113, ADR-0155)'
);

select ok(
  (
    public.record_usage('mcp.call', '00000000-0000-0000-0000-00000000ee02'::uuid) ->> 'allowed'
  )::boolean,
  'record_usage lets an Admin''s app call through, as it does every counted action'
);

select * from finish();

rollback;
