-- ============================================================
-- Notifications: a retention window, a bounded badge, no orphan reminders
--
-- #1652. Two producers write this table every day (habit reminders every 15
-- minutes, recovery nudges daily) and nothing has ever deleted a row. One
-- account reached 11,179 unread rows and paid 26 ms on every page mount for an
-- exact count whose only consumer draws at most two glyphs: a number up to 99,
-- or `99+`. The count grew with account age and the table with history.
--
-- Three changes, each a bound rather than a one-off cleanup:
--
--   1. `sweep_notifications()` deletes read rows older than 90 days and unread
--      rows older than 365, in batches of 5,000, until a batch comes back
--      short. pg_cron runs it off-peak at 03:20 UTC; a night with more than
--      5,000 expired rows simply takes more batches. `security definer` is the
--      same escape from service-role-only row level security the other sweeps
--      use, and execute is revoked from the client roles.
--   2. `notification_unread_count(p_user_id)` stops at 100. Both clients cap
--      the badge at 99 and draw `99+` beyond it, so the 101st row cannot change
--      what anyone sees. `security invoker`, so row level security still
--      decides which rows the caller may count.
--   3. A habit deletion is a tombstone (`deleted_at`), not a DELETE, so a
--      delete trigger alone would never fire. An AFTER UPDATE trigger on that
--      column (plus the plain hard-delete path) removes the habit's
--      `habit_reminder` and `recovery_nudge` rows. 850 distinct habit ids for
--      five live habits was the evidence; the trigger stops new orphans and the
--      retention window bounds the ones already stored.
--
-- Rollback:
--   select cron.unschedule('notifications-sweep');
--   delete from public.scheduled_job_expectation
--    where jobid = (select jobid from cron.job where jobname = 'notifications-sweep');
--   drop trigger if exists habit_notifications_on_delete on public.habits;
--   drop trigger if exists habit_notifications_on_tombstone on public.habits;
--   drop function if exists public.delete_habit_notifications();
--   drop function if exists public.notification_unread_count(uuid);
--   drop function if exists public.sweep_notifications();
--   drop index if exists public.idx_notifications_created_at;
-- ============================================================

create extension if not exists pg_cron;

-- The sweep takes the oldest rows first; the existing (user_id, created_at)
-- indexes cannot serve a table-wide retention scan.
create index if not exists idx_notifications_created_at
  on public.notifications (created_at);

-- ------------------------------------------------------------
-- Retention: 90 days once read, 365 days unread, 5,000 per batch
-- ------------------------------------------------------------

create or replace function public.sweep_notifications()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  removed integer;
begin
  loop
    with expired as (
      select id
        from public.notifications
       where (is_read and created_at < now() - interval '90 days')
          or (not is_read and created_at < now() - interval '365 days')
       order by created_at
       limit 5000
    )
    delete from public.notifications n
     using expired
     where n.id = expired.id;

    get diagnostics removed = row_count;
    exit when removed < 5000;
  end loop;
end;
$fn$;

revoke all on function public.sweep_notifications() from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'notifications-sweep') then
    perform cron.schedule(
      'notifications-sweep',
      '20 3 * * *',
      $$select public.sweep_notifications()$$
    );
  end if;
end;
$do$;

-- Every active job owes the health fleet an expectation (#1744); a sweep that
-- arrives without one is reported as a gap by /api/cron/job-health.
insert into public.scheduled_job_expectation (jobid, expected_interval, owner)
select j.jobid, interval '26 hours', 'notifications'
  from cron.job j
 where j.jobname = 'notifications-sweep'
on conflict (jobid) do update
   set expected_interval = excluded.expected_interval,
       owner = excluded.owner;

-- ------------------------------------------------------------
-- The bounded badge read
-- ------------------------------------------------------------

create or replace function public.notification_unread_count(p_user_id uuid)
returns integer
language sql
stable
security invoker
set search_path = 'public'
as $$
  select count(*)::integer
    from (
      select 1
        from public.notifications
       where user_id = p_user_id
         and is_read = false
       limit 100
    ) bounded;
$$;

revoke all on function public.notification_unread_count(uuid) from public, anon, authenticated;
grant execute on function public.notification_unread_count(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- A habit's reminders go with the habit
-- ------------------------------------------------------------

create or replace function public.delete_habit_notifications()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  target uuid;
begin
  if tg_op = 'DELETE' then
    target := old.id;
  elsif new.deleted_at is not null and old.deleted_at is null then
    target := new.id;
  else
    return null;
  end if;

  delete from public.notifications
   where type in ('habit_reminder', 'recovery_nudge')
     and metadata ->> 'habit_id' = target::text;

  return null;
end;
$fn$;

revoke all on function public.delete_habit_notifications() from public, anon, authenticated;

drop trigger if exists habit_notifications_on_tombstone on public.habits;
create trigger habit_notifications_on_tombstone
after update of deleted_at on public.habits
for each row execute function public.delete_habit_notifications();

drop trigger if exists habit_notifications_on_delete on public.habits;
create trigger habit_notifications_on_delete
after delete on public.habits
for each row execute function public.delete_habit_notifications();
