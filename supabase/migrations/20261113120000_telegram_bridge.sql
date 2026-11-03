-- ============================================================
-- Storage for the Telegram bridge
--
-- The bridge (`.github/workflows/telegram.yml`, `scripts/telegram-bridge.mjs`)
-- is the repository owner's remote control for the autonomous issue pipeline:
-- a message becomes an issue, a reminder comes back at the time asked for, and
-- the planner and implementer report what they did. It runs in GitHub Actions,
-- which has no memory between runs, so everything it must remember lives here.
--
-- Four tables, each with one job:
--
--   - `telegram_chats`     who may talk to it, and in which timezone. The
--                          offset is stored, not inferred: Telegram sends no
--                          timezone and a runner is always UTC, so only the
--                          person can say what "09:00" means (/tz).
--   - `telegram_messages`  the append-only log the owner asked for, kept 90
--                          days. `update_id` is unique because Telegram
--                          redelivers an update whenever a run fails after
--                          receiving it, and a redelivery must not become a
--                          second issue.
--   - `telegram_summaries` rolling memory: the last ~50 exchanges compressed
--                          into a paragraph, injected into the prompt of a
--                          task so a fresh run is not cold. Kept, not pruned.
--   - `telegram_reminders` what was asked for and whether it was delivered.
--                          `sent_at` rather than a delete, so a failed send
--                          retries instead of vanishing.
--
-- `telegram_state` holds the long-poll offset. It is one row by design: one
-- bot, one consumer, and two consumers advancing one offset is how a message
-- is lost.
--
-- No policy on any table. There is no signed-in user behind a Telegram chat,
-- so row level security is on and nothing but `service_role` (used only by
-- the workflow) may read or write. A stolen anon key reads nothing here.
--
-- Rollback:
--   select cron.unschedule('telegram-bridge-prune');
--   drop table if exists public.telegram_reminders;
--   drop table if exists public.telegram_summaries;
--   drop table if exists public.telegram_messages;
--   drop table if exists public.telegram_state;
--   drop table if exists public.telegram_chats;
--   drop function if exists public.sweep_telegram_bridge();
-- ============================================================

create extension if not exists pg_cron;

create table if not exists public.telegram_chats (
  chat_id bigint primary key,
  title text,
  -- Damascus by default so a reminder is never silently eight hours late while
  -- the /tz answer is still being typed.
  tz_offset_minutes integer not null default 180,
  tz_name text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.telegram_messages (
  id bigserial primary key,
  chat_id bigint not null,
  -- Null for outbound rows: only an inbound update has an id from Telegram.
  update_id bigint unique,
  direction text not null check (direction in ('in', 'out')),
  body text not null,
  repo text,
  issue_number integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_telegram_messages_chat
  on public.telegram_messages (chat_id, created_at desc);

create table if not exists public.telegram_state (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_summaries (
  chat_id bigint primary key references public.telegram_chats (chat_id) on delete cascade,
  summary text not null,
  -- The highest `telegram_messages.id` the paragraph covers, so a later run
  -- only folds in what the summary has not seen.
  covers_until bigint,
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_reminders (
  id bigserial primary key,
  chat_id bigint not null,
  body text not null,
  due_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_telegram_reminders_due
  on public.telegram_reminders (due_at)
  where sent_at is null;

alter table public.telegram_chats enable row level security;
alter table public.telegram_messages enable row level security;
alter table public.telegram_state enable row level security;
alter table public.telegram_summaries enable row level security;
alter table public.telegram_reminders enable row level security;

revoke all on public.telegram_chats from anon, authenticated;
revoke all on public.telegram_messages from anon, authenticated;
revoke all on public.telegram_state from anon, authenticated;
revoke all on public.telegram_summaries from anon, authenticated;
revoke all on public.telegram_reminders from anon, authenticated;

grant all on public.telegram_chats to service_role;
grant all on public.telegram_messages to service_role;
grant all on public.telegram_state to service_role;
grant all on public.telegram_summaries to service_role;
grant all on public.telegram_reminders to service_role;

grant usage, select on sequence public.telegram_messages_id_seq to service_role;
grant usage, select on sequence public.telegram_reminders_id_seq to service_role;

-- Ninety days of chat, as decided. Summaries survive the sweep because they are
-- what makes an old conversation useful; the transcript is what makes it big.
create or replace function public.sweep_telegram_bridge()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  delete from public.telegram_messages
  where created_at < now() - interval '90 days';

  delete from public.telegram_reminders
  where sent_at is not null
    and sent_at < now() - interval '90 days';
end;
$fn$;

revoke execute on function public.sweep_telegram_bridge()
  from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'telegram-bridge-prune') then
    perform cron.schedule(
      'telegram-bridge-prune',
      '25 3 * * *',
      $$select public.sweep_telegram_bridge()$$
    );
  end if;
end;
$do$;
