-- Habit reminders read the Damascus clock (#604).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- The window and the day boundary are asserted through the helpers that
-- `send_daily_habit_reminders()` calls, with a pinned `p_now`: the cron function
-- itself inserts notifications and posts to the push webhook, so a test that
-- called it would be measuring its side effects rather than the rule.
--
-- Damascus is UTC+3 all year (no DST), so a Damascus wall-clock time is the UTC
-- time plus three hours: 01:00 Damascus is 22:00 UTC the previous day, which is
-- exactly the boundary that used to read the wrong calendar day.
--
-- Fixtures are seeded with `session_replication_role = replica`, which switches
-- the foreign keys and the triggers on these tables off (the fixtures carry no
-- Auth rows), and the whole file rolls back.

begin;

create extension if not exists pgtap;

select plan(13);

-- ---------------------------------------------------------------------------
-- The 15-minute window
-- ---------------------------------------------------------------------------

select ok(
  public.habit_reminder_is_due(time '08:00', timestamptz '2026-10-26 05:00:00+00'),
  '08:00 is due at 08:00:00 Damascus'
);

select ok(
  public.habit_reminder_is_due(time '08:00', timestamptz '2026-10-26 05:14:59+00'),
  '08:00 is still due at 08:14:59 Damascus'
);

select ok(
  not public.habit_reminder_is_due(time '08:00', timestamptz '2026-10-26 04:59:59+00'),
  '08:00 is not due at 07:59:59 Damascus'
);

select ok(
  not public.habit_reminder_is_due(time '08:00', timestamptz '2026-10-26 05:15:00+00'),
  'the window does not run late: 08:00 is not due at 08:15:00 Damascus'
);

select ok(
  public.habit_reminder_is_due(null, timestamptz '2026-10-26 04:00:00+00'),
  'an unset reminder keeps the 07:00 Damascus default'
);

-- ---------------------------------------------------------------------------
-- The Damascus day
-- ---------------------------------------------------------------------------

select is(
  public.habit_damascus_day_start(timestamptz '2026-10-26 22:30:00+00'),
  timestamptz '2026-10-26 21:00:00+00',
  'a Damascus evening belongs to the day that began at 21:00 UTC'
);

-- ---------------------------------------------------------------------------
-- Fixtures: one habit reminded at 01:00 Damascus
-- ---------------------------------------------------------------------------

select set_config('test.user', '00000000-0000-0000-0000-00000000ca05', true);
select set_config('test.habit', '00000000-0000-0000-0000-00000000ab01', true);

set local session_replication_role = replica;

insert into public.habits (id, user_id, name, frequency, reminder_time)
values (
  '00000000-0000-0000-0000-00000000ab01',
  '00000000-0000-0000-0000-00000000ca05',
  'night',
  'daily',
  time '01:00'
);

set local session_replication_role = origin;

-- 22:00 UTC on the 26th is 01:00 Damascus on the 27th: the UTC date is still the
-- previous day, which is the whole point.
select results_eq(
  $$select habit_id from public.habit_reminders_due(timestamptz '2026-10-26 22:00:00+00')$$,
  $$values ('00000000-0000-0000-0000-00000000ab01'::uuid)$$,
  'the 01:00 habit is due at 01:00 Damascus while UTC is still the previous day'
);

-- A log on the previous Damascus day is a different day, so it must not suppress.
set local session_replication_role = replica;

insert into public.habit_logs (habit_id, user_id, date, completed)
values (
  '00000000-0000-0000-0000-00000000ab01',
  '00000000-0000-0000-0000-00000000ca05',
  date '2026-10-26',
  true
);

set local session_replication_role = origin;

select results_eq(
  $$select habit_id from public.habit_reminders_due(timestamptz '2026-10-26 22:00:00+00')$$,
  $$values ('00000000-0000-0000-0000-00000000ab01'::uuid)$$,
  'a log dated the previous Damascus day does not suppress the reminder'
);

-- The client writes the device's local date, so the 27th is the date a Damascene
-- reader's completion carries - `current_date` here is still the 26th.
set local session_replication_role = replica;

update public.habit_logs
   set date = date '2026-10-27'
 where habit_id = '00000000-0000-0000-0000-00000000ab01';

set local session_replication_role = origin;

select is_empty(
  $$select 1 from public.habit_reminders_due(timestamptz '2026-10-26 22:00:00+00')$$,
  'a completed log dated today in Damascus suppresses the reminder while UTC is still yesterday'
);

-- ---------------------------------------------------------------------------
-- The once-per-day dedupe reads the Damascus day
-- ---------------------------------------------------------------------------

set local session_replication_role = replica;

delete from public.habit_logs
 where habit_id = '00000000-0000-0000-0000-00000000ab01';

-- 21:30 UTC is 00:30 Damascus on the 27th: an earlier run in the same Damascus day.
insert into public.notifications (user_id, type, title, body, metadata, created_at)
values (
  '00000000-0000-0000-0000-00000000ca05',
  'habit_reminder',
  'تذكير بعادتك اليومية',
  'لا تنسَ إنجاز عادتك اليوم: night',
  jsonb_build_object('habit_id', '00000000-0000-0000-0000-00000000ab01'),
  timestamptz '2026-10-26 21:30:00+00'
);

set local session_replication_role = origin;

select is_empty(
  $$select 1 from public.habit_reminders_due(timestamptz '2026-10-26 22:00:00+00')$$,
  'a second run in the same Damascus day sends nothing'
);

-- 20:59:59 UTC on the 26th is still the 26th in Damascus (which ran from 21:00
-- UTC on the 25th), so that reminder belongs to the day before and does not count.
set local session_replication_role = replica;

update public.notifications
   set created_at = timestamptz '2026-10-26 20:59:59+00'
 where (metadata ->> 'habit_id') = '00000000-0000-0000-0000-00000000ab01';

set local session_replication_role = origin;

select results_eq(
  $$select habit_id from public.habit_reminders_due(timestamptz '2026-10-26 22:00:00+00')$$,
  $$values ('00000000-0000-0000-0000-00000000ab01'::uuid)$$,
  'yesterday''s Damascus reminder does not suppress today''s'
);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

reset role;

select ok(
  not has_function_privilege('anon', 'public.habit_reminders_due(timestamptz)', 'execute'),
  'anon cannot read the reminder selection'
);

select ok(
  not has_function_privilege('authenticated', 'public.send_daily_habit_reminders()', 'execute'),
  'a signed-in client cannot trigger the reminder run'
);

select * from finish();

rollback;
