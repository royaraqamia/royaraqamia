-- habits.target / target_period: optional weekly/monthly completion goal.
-- habits.reminder_time: per-habit reminder time (UTC); NULL keeps the
-- existing 07:00 UTC default. The daily reminder function now honours the
-- per-habit time and the cron job runs every 15 minutes so any custom time
-- lands within a 15-minute window (once-per-day dedupe preserved).

alter table public.habits
  add column target integer,
  add column target_period text,
  add column reminder_time time;

alter table public.habits
  add constraint habits_target_positive_check
    check ( target is null or target > 0 );

alter table public.habits
  add constraint habits_target_period_check
    check ( target_period is null or target_period in ('week', 'month') );

comment on column public.habits.target is 'Optional completion goal per period (null = no target).';
comment on column public.habits.target_period is 'Period the target applies to: weekly or monthly.';
comment on column public.habits.reminder_time is 'Per-habit reminder time in UTC; null defaults to 07:00 UTC.';

create or replace function public.send_daily_habit_reminders()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  eff_time time := coalesce((clock_timestamp() at time zone 'utc')::time, time '07:00');
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
    and coalesce(h.reminder_time, time '07:00') <= eff_time
    and coalesce(h.reminder_time, time '07:00') > eff_time - interval '15 minutes'
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

-- Re-schedule: every 15 minutes so per-habit times land on time.
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'daily-habit-reminder') then
    perform cron.unschedule('daily-habit-reminder');
  end if;
  perform cron.schedule(
    'daily-habit-reminder',
    '*/15 * * * *',
    $$select public.send_daily_habit_reminders()$$
  );
end;
$do$;