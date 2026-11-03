-- ============================================================
-- The webhook becomes the door, and a slow backstop covers its outages
--
-- Polling bought latency with a cron interval: five minutes, then one, then a
-- workflow run for every tick whether or not anybody had written anything. The
-- owner asked for seconds instead, so Telegram now pushes each update to
-- `supabase/functions/telegram`, and the function's only job is to store the
-- update and wake the workflow. That inverts the cost: runs scale with messages
-- rather than with the clock, and a quiet day costs nothing at all.
--
-- Two consequences live here:
--
--   - `processed_at` on `telegram_messages`. The function stores the update
--     before it dispatches, so a dispatch that never starts is recoverable: the
--     drain run picks up every row that is still unprocessed. Claiming is still
--     `update_id`, so a Telegram retry cannot file a second issue.
--   - the pg_cron job slows from five minutes to fifteen. It is no longer the
--     latency mechanism - it is the dead-man's switch for a function outage or a
--     dispatch that GitHub dropped. Fifteen minutes is fast enough to catch that
--     and slow enough to stay out of the run history.
--
-- The function dispatches through `dispatch_github_workflow`, which keeps the
-- Vault PAT as the only credential that can start a workflow. It was reachable
-- from no role at all after the original migration revoked it from PUBLIC, so it
-- is granted to `service_role` - the role an Edge Function holds - and to nothing
-- else.
--
-- Rollback:
--   select cron.unschedule('telegram-bridge-drain');
--   revoke execute on function public.dispatch_github_workflow(text, text) from service_role;
--   alter table public.telegram_messages drop column if exists processed_at;
-- ============================================================

alter table public.telegram_messages
  add column if not exists processed_at timestamptz;

create index if not exists idx_telegram_messages_unprocessed
  on public.telegram_messages (id)
  where direction = 'in' and processed_at is null;

-- The Edge Function runs as `service_role`; the dispatch function was revoked
-- from PUBLIC, so without this line every webhook call answers 42501.
grant execute on function public.dispatch_github_workflow(text, text) to service_role;

do $do$
begin
  if exists (select 1 from cron.job where jobname = 'telegram-bridge-poll') then
    perform cron.unschedule('telegram-bridge-poll');
  end if;

  if not exists (select 1 from cron.job where jobname = 'telegram-bridge-drain') then
    perform cron.schedule(
      'telegram-bridge-drain',
      '*/15 * * * *',
      $$select public.dispatch_github_workflow('telegram.yml', 'main')$$
    );
  end if;
end;
$do$;
