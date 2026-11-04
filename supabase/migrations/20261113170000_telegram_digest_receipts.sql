-- ============================================================
-- A receipt per digest, and a tick that guarantees one is sent
--
-- `workflow_run` is the trigger that makes a summary a reaction instead of a
-- clock, and on 2026-11-04 it fired for the planner (03:19:44) but not for the
-- implementer, whose run completed `failure` at 05:50:05. A failed agent run is
-- exactly the one worth reporting, so the digest cannot depend on that trigger
-- alone.
--
-- `telegram_digests` is the receipt: one row per workflow run a digest was sent
-- for, so a catch-up never repeats a message the trigger already sent. The
-- thirty-minute tick wakes the workflow even when nothing is pending, and
-- `catchUpDigests()` inside the run sends whatever is missing.
--
-- Forty-eight wake-ups a day is the price of not missing a failure. They are
-- cheap runs - a `drain` that finds nothing, a receipt check, and an early
-- return - and none of them touches Vercel.
--
-- Rollback:
--   select cron.unschedule('telegram-bridge-digest-tick');
--   drop table if exists public.telegram_digests;
-- ============================================================

create table if not exists public.telegram_digests (
  run_id bigint primary key,
  workflow text not null,
  sent_at timestamptz not null default now()
);

alter table public.telegram_digests enable row level security;

revoke all on public.telegram_digests from anon, authenticated;
grant all on public.telegram_digests to service_role;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'telegram-bridge-digest-tick') then
    perform cron.schedule(
      'telegram-bridge-digest-tick',
      '15,45 * * * *',
      $$select public.dispatch_github_workflow('telegram.yml', 'main')$$
    );
  end if;
end;
$do$;
