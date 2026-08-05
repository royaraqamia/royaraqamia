-- habit_reminder: daily scheduled notification for active daily habits that
-- have not been completed today. Runs via pg_cron as a security-definer
-- function (postgres owner) so the service-role-only INSERT grant on
-- notifications is satisfied and RLS is bypassed.

create extension if not exists pg_cron;

create or replace function public.send_daily_habit_reminders()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  insert into public.notifications (user_id, type, title, body, metadata)
  select
    h.user_id,
    'habit_reminder',
    'تذكير بعادتك اليومية',
    'لا تنسَ إنجاز عادتك اليوم: ' || h.name,
    jsonb_build_object('habit_id', h.id, 'habit_name', h.name)
  from public.habits h
  where h.archived = false
    and h.frequency = 'daily'
    and h.user_id is not null
    and not exists (
      select 1 from public.habit_logs l
      where l.habit_id = h.id
        and l.user_id = h.user_id
        and l.date = current_date
        and l.completed = true
    )
    and not exists (
      select 1 from public.notifications n
      where n.user_id = h.user_id
        and n.type = 'habit_reminder'
        and n.created_at >= date_trunc('day', now())
        and (n.metadata ->> 'habit_id') = h.id::text
    );
end;
$fn$;

revoke execute on function public.send_daily_habit_reminders() from public, anon;

-- Run every day at 07:00 UTC (morning reminder).
do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'daily-habit-reminder') then
    perform cron.schedule(
      'daily-habit-reminder',
      '0 7 * * *',
      $$select public.send_daily_habit_reminders()$$
    );
  end if;
end;
$do$;
