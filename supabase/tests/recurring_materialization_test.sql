-- Assertions for the monthly recurring-expense materializer (#618).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- The materializer reads `current_date`, so every fixture is anchored to the
-- month the suite runs in: recurring rows carry `start_month = current month`
-- and their target day is chosen so it exists in any month (the 31st row is the
-- one that exercises the clamp).
--
-- Fixtures are seeded with `session_replication_role = replica`, which switches
-- off the foreign keys and the very trigger under test, and then the role goes
-- back to `origin` for the run. The `capped` owner sits exactly on the free
-- expense cap from `plan_limits`, so its insert raises `PL001`; the other owners
-- in the same loop must still be materialized.
--
-- Every write happens inside the transaction this file rolls back.

begin;

create extension if not exists pgtap;

select plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

-- twin:   two recurring expenses with the same category, amount and day.
-- manual: one recurring expense whose figures a hand-typed expense already
--         matches on the same date.
-- capped: on the free expense cap, with a recurring expense to be skipped.
-- room:   an ordinary account after the capped one in the same run.
-- clamp:  a 31st-day recurring expense.
select set_config('test.twin', '00000000-0000-0000-0000-0000000c1801', true);
select set_config('test.manual', '00000000-0000-0000-0000-0000000c1802', true);
select set_config('test.capped', '00000000-0000-0000-0000-0000000c1803', true);
select set_config('test.room', '00000000-0000-0000-0000-0000000c1804', true);
select set_config('test.clamp', '00000000-0000-0000-0000-0000000c1805', true);

-- The one category every recurring expense below uses; a default row (user_id
-- null) is what a fresh account gets.
select set_config('test.category', '00000000-0000-0000-0000-0000000c1900', true);

set local session_replication_role = replica;

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000c1801', 'rec-twin@example.invalid'),
  ('00000000-0000-0000-0000-0000000c1802', 'rec-manual@example.invalid'),
  ('00000000-0000-0000-0000-0000000c1803', 'rec-capped@example.invalid'),
  ('00000000-0000-0000-0000-0000000c1804', 'rec-room@example.invalid'),
  ('00000000-0000-0000-0000-0000000c1805', 'rec-clamp@example.invalid');

insert into public.categories (id, user_id, name, color_hex, is_default)
values ('00000000-0000-0000-0000-0000000c1900', null, 'rec-category', '#123456', true);

-- A hand-typed expense with exactly the figures the `manual` owner's recurring
-- expense produces: same user, category, amount and date, no client_id.
insert into public.expenses (id, user_id, amount, category_id, date, description)
values (
  '00000000-0000-0000-0000-0000000c1a01',
  '00000000-0000-0000-0000-0000000c1802',
  25,
  '00000000-0000-0000-0000-0000000c1900',
  date_trunc('month', current_date)::date + 4,
  'typed by hand'
);

-- The `capped` owner's expenses: exactly the free cap, all live.
insert into public.expenses (id, user_id, amount, category_id, date, description)
select
  gen_random_uuid(),
  '00000000-0000-0000-0000-0000000c1803'::uuid,
  1,
  '00000000-0000-0000-0000-0000000c1900'::uuid,
  date_trunc('month', current_date)::date,
  'cap filler ' || n
from generate_series(
  1,
  (select free_cap from public.plan_limits where key = 'expenses')
) as n;

insert into public.recurring_expenses
  (id, user_id, amount, category_id, description, day_of_month, start_month)
values
  -- twin, two identical rows that differ only by their own id
  (
    '00000000-0000-0000-0000-0000000c1b01',
    '00000000-0000-0000-0000-0000000c1801',
    40,
    '00000000-0000-0000-0000-0000000c1900',
    'twin first',
    5,
    to_char(current_date, 'YYYY-MM')
  ),
  (
    '00000000-0000-0000-0000-0000000c1b02',
    '00000000-0000-0000-0000-0000000c1801',
    40,
    '00000000-0000-0000-0000-0000000c1900',
    'twin second',
    5,
    to_char(current_date, 'YYYY-MM')
  ),
  -- manual, whose figures the hand-typed expense above already matches
  (
    '00000000-0000-0000-0000-0000000c1b03',
    '00000000-0000-0000-0000-0000000c1802',
    25,
    '00000000-0000-0000-0000-0000000c1900',
    'manual',
    5,
    to_char(current_date, 'YYYY-MM')
  ),
  -- capped, refused by the plan cap without stopping the run
  (
    '00000000-0000-0000-0000-0000000c1b04',
    '00000000-0000-0000-0000-0000000c1803',
    15,
    '00000000-0000-0000-0000-0000000c1900',
    'capped',
    5,
    to_char(current_date, 'YYYY-MM')
  ),
  -- room, materialized after the capped row
  (
    '00000000-0000-0000-0000-0000000c1b05',
    '00000000-0000-0000-0000-0000000c1804',
    10,
    '00000000-0000-0000-0000-0000000c1900',
    'room',
    5,
    to_char(current_date, 'YYYY-MM')
  ),
  -- clamp, on a day only a 31-day month has
  (
    '00000000-0000-0000-0000-0000000c1b06',
    '00000000-0000-0000-0000-0000000c1805',
    5,
    '00000000-0000-0000-0000-0000000c1900',
    'clamp',
    31,
    to_char(current_date, 'YYYY-MM')
  );

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- One run: identity, continuation past the cap, the day clamp
-- ---------------------------------------------------------------------------

-- The capped owner raises PL001 inside the loop; the run still returns true.
select ok(
  public.materialize_due_recurring_expenses(),
  'the run returns normally with a capped account in the list'
);

select is(
  (select count(*)::int from public.expenses
    where user_id = current_setting('test.twin')::uuid),
  2,
  'two recurring expenses with the same category, amount and day are two rows'
);

select is(
  (select count(distinct client_id)::int from public.expenses
    where user_id = current_setting('test.twin')::uuid),
  2,
  'each materialized row carries its own client_id'
);

select is(
  (select count(*)::int from public.expenses
    where user_id = current_setting('test.manual')::uuid),
  2,
  'a hand-typed expense with the same figures does not suppress the recurring one'
);

select is(
  (select count(*)::int from public.expenses
    where user_id = current_setting('test.capped')::uuid),
  (select free_cap from public.plan_limits where key = 'expenses'),
  'an account on the expense cap is skipped, not written past it'
);

select is(
  (select count(*)::int from public.expenses
    where user_id = current_setting('test.room')::uuid),
  1,
  'the run continues materializing other accounts after the refused one'
);

select is(
  (select date from public.expenses where user_id = current_setting('test.clamp')::uuid),
  date_trunc('month', current_date)::date
    + (
      least(
        31,
        extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day')::date)
      )::int - 1
    ),
  'a 31st-day recurring expense lands on the last day the month has'
);

-- ---------------------------------------------------------------------------
-- A second run in the same month
-- ---------------------------------------------------------------------------

select ok(
  public.materialize_due_recurring_expenses(),
  'a second run in the same month returns normally'
);

select is(
  (select count(*)::int from public.expenses
    where user_id = current_setting('test.twin')::uuid),
  2,
  'a second run in the same month adds no duplicate'
);

-- Moving the recurring expense to another day of the same month is still the
-- same month's materialization: the identity is (recurring expense, month), not
-- the day the row happened to land on.
update public.recurring_expenses
   set day_of_month = 20
 where id in (
   '00000000-0000-0000-0000-0000000c1b01',
   '00000000-0000-0000-0000-0000000c1b02'
 );

select ok(
  public.materialize_due_recurring_expenses(),
  'a run after the recurring day moved within the month returns normally'
);

select is(
  (select count(*)::int from public.expenses
    where user_id = current_setting('test.twin')::uuid),
  2,
  'moving the day within the month does not create a second row'
);

select is(
  (select count(*)::int from public.expenses
    where user_id = current_setting('test.twin')::uuid
      and date = date_trunc('month', current_date)::date + 4),
  2,
  'the rows written by the first run keep their original date'
);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.materialize_due_recurring_expenses()', 'execute'),
  'anon cannot materialize recurring expenses'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.materialize_due_recurring_expenses()',
    'execute'
  ),
  'a signed-in client cannot materialize recurring expenses'
);

select * from finish();

rollback;
