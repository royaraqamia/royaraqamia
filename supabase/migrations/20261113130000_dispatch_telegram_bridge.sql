-- ============================================================
-- Wake the Telegram bridge every five minutes, punctually
--
-- The bridge's own `schedule: cron '*/5 * * * *'` is the only trigger that would
-- make it autonomous, and it is the one trigger GitHub does not keep: on
-- 2026-11-03 the workflow went 25 minutes without a single scheduled run while
-- every dispatch ran on time (`.github/workflows/telegram.yml`, runs at 17:31,
-- 17:32, 17:50). The pipeline already answered this question once - GitHub's
-- scheduler "lands hours late and is sometimes dropped for a whole day"
-- (`docs/vercel-usage.md`, `issue-planner.yml`) - and the answer was pg_cron
-- calling the Actions dispatch API (ADR 0032).
--
-- So the bridge gets the same wake-up as the planner, at the interval its
-- latency budget allows: five minutes, which is what the polling design promised
-- (ADR 0121). The workflow's `schedule` stays as the no-config backstop, and a
-- duplicate trigger is harmless because an update is claimed once by
-- `telegram_messages.update_id`.
--
-- Cost: 288 dispatches a day on a public repository, where Actions minutes are
-- free, and each run is a few seconds of `getUpdates`. Nothing here touches
-- Vercel.
--
-- Rollback:
--   select cron.unschedule('telegram-bridge-poll');
-- ============================================================

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'telegram-bridge-poll') then
    perform cron.schedule(
      'telegram-bridge-poll',
      '*/5 * * * *',
      $$select public.dispatch_github_workflow('telegram.yml', 'main')$$
    );
  end if;
end;
$do$;
