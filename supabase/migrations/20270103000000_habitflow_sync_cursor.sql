-- ============================================================
-- HabitFlow incremental sync watermark (#1788)
--
-- /habitflow/api/sync used to send the account's whole habit and log history on
-- every pull: on mount, focus, reconnect, every Realtime hint and every Android
-- wake. A bounded page needs a stamp that belongs to the server: `updated_at`
-- is the device's LWW clock (ADR-0029) and can be backdated, so a row written by
-- a lagging clock would sit behind the cursor forever.
--
-- `server_updated_at` is stamped by a trigger on every insert and update,
-- tombstones included. `clock_timestamp()` is volatile, so each row in a bulk
-- replay gets its own stamp: a page can cut between rows without a tie at the
-- boundary hiding the rest of the batch from the next `?since=` call.
--
-- Existing rows are backfilled one microsecond apart, below the current clock,
-- so a history that predates this migration pages through instead of arriving
-- as one giant tie.
--
-- Rollback:
--   drop trigger if exists trg_habits_server_updated_at on public.habits;
--   drop trigger if exists trg_habit_logs_server_updated_at on public.habit_logs;
--   drop function if exists public.touch_habit_sync_stamp();
--   drop index if exists habits_server_updated_at_idx, habit_logs_server_updated_at_idx;
--   alter table public.habits drop column if exists server_updated_at;
--   alter table public.habit_logs drop column if exists server_updated_at;
-- ============================================================

alter table public.habits
  add column if not exists server_updated_at timestamptz not null default now();
alter table public.habit_logs
  add column if not exists server_updated_at timestamptz not null default now();

do $do$
declare
  base timestamptz := now() - interval '1 minute';
begin
  update public.habits h
     set server_updated_at = base + (ranked.rn * interval '1 microsecond')
    from (
      select id, row_number() over (order by created_at, id) as rn
      from public.habits
    ) as ranked
   where h.id = ranked.id;

  update public.habit_logs l
     set server_updated_at = base + (ranked.rn * interval '1 microsecond')
    from (
      select id, row_number() over (order by date, id) as rn
      from public.habit_logs
    ) as ranked
   where l.id = ranked.id;
end;
$do$;

create or replace function public.touch_habit_sync_stamp()
returns trigger
language plpgsql
set search_path = 'public'
as $fn$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end;
$fn$;

create or replace trigger trg_habits_server_updated_at
  before insert or update on public.habits
  for each row execute function public.touch_habit_sync_stamp();
create or replace trigger trg_habit_logs_server_updated_at
  before insert or update on public.habit_logs
  for each row execute function public.touch_habit_sync_stamp();

create index if not exists habits_server_updated_at_idx
  on public.habits (user_id, server_updated_at);
create index if not exists habit_logs_server_updated_at_idx
  on public.habit_logs (user_id, server_updated_at);
