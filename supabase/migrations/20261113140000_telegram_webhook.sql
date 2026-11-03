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
--   - `wake_telegram_bridge()`, and a pg_cron job that calls it. This is the
--     dead-man's switch, and it deliberately does not dispatch on a timer: the
--     question "is anything pending?" is answered in Postgres, and a dispatch
--     happens only when the answer is yes. An idle day therefore starts zero
--     workflow runs, instead of the 96 a blind fifteen-minute dispatch would
--     have added to the history.
--
-- The check runs every five minutes rather than fifteen because it costs nothing
-- when idle and it is also what keeps a reminder punctual: a due reminder wakes
-- the same run that would have delivered it.
--
-- The function dispatches through `dispatch_github_workflow`, which keeps the
-- Vault PAT as the only credential that can start a workflow. It was reachable
-- from no role at all after the original migration revoked it from PUBLIC, so it
-- is granted to `service_role` - the role an Edge Function holds - and to nothing
-- else.
--
-- Rollback:
--   select cron.unschedule('telegram-bridge-wake');
--   revoke execute on function public.dispatch_github_workflow(text, text) from service_role;
--   drop function if exists public.wake_telegram_bridge();
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

/**
 * Wakes the bridge only when there is work: an update the function stored but
 * could not dispatch, or a reminder that has come due. Answers "nothing to do"
 * without spending a workflow run, which is what keeps an idle day out of the
 * Actions history.
 */
create or replace function public.wake_telegram_bridge()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  pending integer;
begin
  select count(*) into pending
  from public.telegram_messages
  where direction = 'in' and processed_at is null;

  if pending = 0 then
    select count(*) into pending
    from public.telegram_reminders
    where sent_at is null and due_at <= now();
  end if;

  if pending > 0 then
    perform public.dispatch_github_workflow('telegram.yml', 'main');
  end if;
end;
$fn$;

revoke execute on function public.wake_telegram_bridge()
  from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from cron.job where jobname = 'telegram-bridge-poll') then
    perform cron.unschedule('telegram-bridge-poll');
  end if;

  if exists (select 1 from cron.job where jobname = 'telegram-bridge-drain') then
    perform cron.unschedule('telegram-bridge-drain');
  end if;

  if not exists (select 1 from cron.job where jobname = 'telegram-bridge-wake') then
    perform cron.schedule(
      'telegram-bridge-wake',
      '*/5 * * * *',
      $$select public.wake_telegram_bridge()$$
    );
  end if;
end;
$do$;
