-- Retention, the bounded badge and the habit cascade (#1652). Run with
-- `supabase test db` against the local stack - see README.md.
--
-- The producers write a row a day and nothing used to delete one, so an exact
-- unread count scanned a member's whole backlog on every page mount. This file
-- asserts the three bounds: the sweep's windows and batches, the read's 100-row
-- ceiling (the clients draw `99+` past 99), and a tombstoned habit taking its
-- reminders with it.
--
-- Fixtures are seeded with `session_replication_role = replica` (the Auth rows
-- are not real) and the whole file rolls back. Triggers are switched back to
-- `origin` before the tombstone and hard-delete assertions, so those two really
-- fire.

begin;

create extension if not exists pgtap;

select plan(17);

-- --------------------------------------------------------------------------
-- The routine pieces
-- --------------------------------------------------------------------------

select ok(
  to_regclass('public.sweep_notifications') is not null,
  'the notifications sweep exists'
);

select ok(
  exists (select 1 from cron.job where jobname = 'notifications-sweep'),
  'the sweep is scheduled'
);

select ok(
  exists (
    select 1
      from cron.job j
      join public.scheduled_job_expectation e on e.jobid = j.jobid
     where j.jobname = 'notifications-sweep'
  ),
  'the sweep declares a health expectation'
);

select ok(
  to_regclass('public.idx_notifications_created_at') is not null,
  'the retention scan has a created_at index'
);

select ok(
  has_function_privilege('authenticated', 'public.notification_unread_count(uuid)', 'execute'),
  'a member can read the bounded badge count'
);

select ok(
  not has_function_privilege('anon', 'public.notification_unread_count(uuid)', 'execute'),
  'an anonymous client cannot read the badge count'
);

select ok(
  exists (
    select 1 from pg_trigger
     where tgrelid = 'public.habits'::regclass
       and tgname = 'habit_notifications_on_tombstone'
       and not tgisinternal
  ),
  'tombstoning a habit removes its notifications'
);

select ok(
  exists (
    select 1 from pg_trigger
     where tgrelid = 'public.habits'::regclass
       and tgname = 'habit_notifications_on_delete'
       and not tgisinternal
  ),
  'hard-deleting a habit removes its notifications'
);

-- --------------------------------------------------------------------------
-- Fixtures
-- --------------------------------------------------------------------------

select set_config('test.user_a', '00000000-0000-0000-0000-00000000ca01', true);
select set_config('test.user_b', '00000000-0000-0000-0000-00000000ca02', true);
select set_config('test.user_c', '00000000-0000-0000-0000-00000000ca03', true);
select set_config('test.habit_1', '00000000-0000-0000-0000-00000000ab01', true);
select set_config('test.habit_2', '00000000-0000-0000-0000-00000000ab02', true);

set local session_replication_role = replica;

insert into public.habits (id, user_id, name, frequency)
values
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000ca01', 'one', 'daily'),
  ('00000000-0000-0000-0000-00000000ab02', '00000000-0000-0000-0000-00000000ca01', 'two', 'daily');

insert into public.notifications (id, user_id, type, title, metadata, is_read, created_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000ca03',
   'link_clicked', 'old read', '{}', true, now() - interval '91 days'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000ca03',
   'link_clicked', 'fresh read', '{}', true, now() - interval '89 days'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000ca03',
   'habit_reminder', 'old unread', '{}', false, now() - interval '366 days'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000ca03',
   'habit_reminder', 'fresh unread', '{}', false, now() - interval '364 days'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000ca01',
   'habit_reminder', 'habit one', jsonb_build_object('habit_id', '00000000-0000-0000-0000-00000000ab01'),
   false, now()),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000ca01',
   'recovery_nudge', 'habit one', jsonb_build_object('habit_id', '00000000-0000-0000-0000-00000000ab01'),
   false, now()),
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-00000000ca01',
   'link_clicked', 'not a habit row', jsonb_build_object('habit_id', '00000000-0000-0000-0000-00000000ab01'),
   false, now()),
  ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000ca01',
   'habit_reminder', 'habit two', jsonb_build_object('habit_id', '00000000-0000-0000-0000-00000000ab02'),
   false, now());

-- 150 unread rows for one account: more than the badge can distinguish.
insert into public.notifications (user_id, type, title, created_at)
select '00000000-0000-0000-0000-00000000ca01'::uuid, 'link_clicked', 'overflow', now()
  from generate_series(1, 150);

-- Twelve unread rows for another: the exact number below the cap.
insert into public.notifications (user_id, type, title, created_at)
select '00000000-0000-0000-0000-00000000ca02'::uuid, 'link_clicked', 'twelve', now()
  from generate_series(1, 12);

set local session_replication_role = origin;

-- --------------------------------------------------------------------------
-- The sweep: 90 days once read, 365 days unread, all batches drained
-- --------------------------------------------------------------------------

select public.sweep_notifications();

select is(
  (select count(*)::bigint from public.notifications where id = '00000000-0000-0000-0000-000000000001'),
  0::bigint,
  'a read row past 90 days is swept'
);

select is(
  (select count(*)::bigint from public.notifications where id = '00000000-0000-0000-0000-000000000002'),
  1::bigint,
  'a read row inside 90 days stays'
);

select is(
  (select count(*)::bigint from public.notifications where id = '00000000-0000-0000-0000-000000000003'),
  0::bigint,
  'an unread row past 365 days is swept'
);

select is(
  (select count(*)::bigint from public.notifications where id = '00000000-0000-0000-0000-000000000004'),
  1::bigint,
  'an unread row inside 365 days stays'
);

-- --------------------------------------------------------------------------
-- The badge read: constant in the size of the backlog
-- --------------------------------------------------------------------------

select is(
  public.notification_unread_count('00000000-0000-0000-0000-00000000ca01'::uuid),
  100,
  'a 150-row backlog reads as 100, the badge cap'
);

select is(
  public.notification_unread_count('00000000-0000-0000-0000-00000000ca02'::uuid),
  12,
  'a backlog below the cap is exact'
);

-- --------------------------------------------------------------------------
-- A habit's reminders go with the habit
-- --------------------------------------------------------------------------

update public.habits
   set deleted_at = now(), updated_at = now()
 where id = '00000000-0000-0000-0000-00000000ab01';

select is(
  (select count(*)::bigint from public.notifications
    where id in ('00000000-0000-0000-0000-000000000005',
                 '00000000-0000-0000-0000-000000000006')),
  0::bigint,
  'tombstoning a habit removes its reminder and nudge rows'
);

select is(
  (select count(*)::bigint from public.notifications where id = '00000000-0000-0000-0000-000000000007'),
  1::bigint,
  'a non-habit notification naming the same habit is left alone'
);

delete from public.habits where id = '00000000-0000-0000-0000-00000000ab02';

select is(
  (select count(*)::bigint from public.notifications where id = '00000000-0000-0000-0000-000000000008'),
  0::bigint,
  'hard-deleting a habit removes its reminder rows too'
);

select * from finish();

rollback;
