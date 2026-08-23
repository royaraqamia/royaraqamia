-- Weekly hygiene for Web Push dispatch.
--
-- Push endpoints rotate (WNS rotates per browser session; FCM occasionally),
-- and dead rows are pruned lazily on the first dispatch failure. Rows that
-- never get touched again would otherwise accumulate forever and stretch
-- every fan-out with doomed HTTPS attempts.
--
-- A row's updated_at is refreshed by:
--   - every successful dispatch (PushService touches liveness), and
--   - any site visit while a valid subscription exists (the client re-POSTs
--     it at most once per day).
-- So a row that stays untouched for 120 days belongs to a user who has not
-- visited nor received anything in that window — safe to drop. Their next
-- visit transparently re-subscribes via the client auto-heal.

create extension if not exists pg_cron;

create or replace function public.sweep_stale_push_subscriptions()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  delete from public.push_subscriptions
  where updated_at < now() - interval '120 days';
end;
$fn$;

revoke execute on function public.sweep_stale_push_subscriptions() from public, anon;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'push-subscriptions-sweep') then
    perform cron.schedule(
      'push-subscriptions-sweep',
      '30 3 * * 6',
      $$select public.sweep_stale_push_subscriptions()$$
    );
  end if;
end;
$do$;
