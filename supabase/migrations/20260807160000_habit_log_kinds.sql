-- habit_log_kinds: streak-freeze support via an explicit per-log kind.
--
--   complete : the habit was done that day
--   skip     : a rest/freeze day — does NOT break the streak, does NOT count as a completion
--   miss     : an explicitly missed day — breaks the streak
--   none     : default — no log for the day (normal "incomplete")
alter table public.habit_logs
  add column if not exists log_kind text not null default 'none';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'habit_logs_log_kind_check'
      and conrelid = 'public.habit_logs'::regclass
  ) then
    alter table public.habit_logs
      add constraint habit_logs_log_kind_check
      check (log_kind in ('complete', 'skip', 'miss', 'none'));
  end if;
end $$;

-- One log per habit per day: toggle / skip / notes all key on {habit_id, date}.
create unique index if not exists habit_logs_habit_id_date_unique
  on public.habit_logs (habit_id, date);