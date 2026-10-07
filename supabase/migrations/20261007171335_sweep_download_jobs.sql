-- Retention and reconciliation for the public Media Downloader (/downloader).
--
-- A Download Job is short-lived by design (ADR-0018): the Media Provider hands
-- back a 5-minute signed link and nothing durable should outlive the visit. Two
-- things still need proactive tidying, both driven here by pg_cron so the list
-- stays truthful without any request having to touch an old row:
--
--   * A `running` job whose provider call died (crash, host restart, dropped
--     callback) would otherwise sit in `running` forever. Past a generous
--     threshold it is swept to `failed`, with an event recorded so the job's
--     history stays complete.
--   * Rows accrue one per Download. Anything older than 24 hours is well past
--     the point any link can still resolve, so it is deleted; its
--     download_job_events rows cascade with it.
--
-- The visitor-facing 5-minute link TTL is enforced separately, in the app: the
-- service marks a ready job `expired` and drops its link once `file_expires_at`
-- passes, so a link is never handed out again. This sweep only reconciles the
-- status column and bounds the table's growth.
--
-- Mirrors sweep_stale_push_subscriptions / sweep_expired_mcp_oauth_tokens: a
-- SECURITY DEFINER function (executor bypasses the service_role-only RLS) that
-- is revoke-locked from the public roles, scheduled via pg_cron.
--
-- Rollback:
--   select cron.unschedule('download-jobs-sweep');
--   drop function if exists public.sweep_download_jobs();

create extension if not exists pg_cron;

create or replace function public.sweep_download_jobs()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  -- Reconcile stuck work: a job `running` well past the longest plausible
  -- provider call is dead, not slow. Record the terminal transition so the
  -- events trail matches the status column.
  with stale as (
    update public.download_jobs
    set status = 'failed',
        error = 'انتهت مهلة المعالجة دون اكتمال.',
        updated_at = now()
    where status = 'running'
      and updated_at < now() - interval '15 minutes'
    returning id
  )
  insert into public.download_job_events (job_id, status)
  select id, 'failed' from stale;

  -- Retention: a Download Job is not a record worth keeping beyond a day.
  delete from public.download_jobs
  where created_at < now() - interval '24 hours';
end;
$fn$;

revoke execute on function public.sweep_download_jobs()
  from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'download-jobs-sweep') then
    perform cron.schedule(
      'download-jobs-sweep',
      '*/10 * * * *',
      $$select public.sweep_download_jobs()$$
    );
  end if;
end;
$do$;
