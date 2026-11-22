-- ============================================================
-- Scheduled job health: the scheduler's output gets a consumer (#1744)
--
-- The database's 23 pg_cron jobs write every outcome to cron.job_run_details
-- and nothing in the repository reads it. `send_recovery_nudges` failed on 34
-- consecutive daily runs and was found by hand a month later. The app's three
-- jobs cannot fail this way: scheduled-jobs.yml gates them with
-- `curl --fail-with-body`, so a non-2xx turns the job red.
--
-- This migration adds the same contract to the database's fleet:
--
--   * `scheduled_job_health` is the one reader. One row per active job, its
--     last success, its last failure and its failures in the last 7 days.
--   * `scheduled_job_expectation` declares what each job owes: an interval and
--     an owner. It is keyed by the pg_cron jobid, so a job that is unscheduled
--     or silently deleted still has a row that says it must exist — a view over
--     cron.job alone cannot see a job that vanished.
--   * `scheduled_job_health_rows` joins the two with a full join: an expected
--     job with no live row is still returned, with a null name and last_success.
--     The route reads that once and decides; the threshold lives in TypeScript
--     so it can be unit tested without a database.
--   * a nightly retention job bounds cron.job_run_details. The window is 60
--     days, not the 30 in the audit's draft: the fleet includes a monthly job,
--     so a 30-day window would prune its only success just before its next run
--     and cry wolf once a month. 60 days still outlives every declared interval
--     (the longest is 35 days), which the pgTAP test asserts.
--
-- Both readers are security definer and granted to service_role alone: cron's
-- schema is not exposed through PostgREST, and this is an operator's endpoint,
-- not a member's.
--
-- Rollback:
--   select cron.unschedule('cron-job-run-details-retention');
--   revoke all on function public.scheduled_job_health_rows() from service_role;
--   drop function if exists public.scheduled_job_health_rows();
--   revoke all on public.scheduled_job_expectation from service_role;
--   drop table if exists public.scheduled_job_expectation;
--   revoke all on public.scheduled_job_health from service_role;
--   drop view if exists public.scheduled_job_health;
-- ============================================================

-- ------------------------------------------------------------
-- One reader for the whole fleet
-- ------------------------------------------------------------

create or replace view public.scheduled_job_health as
select j.jobid,
       j.jobname,
       j.schedule,
       max(d.start_time) filter (where d.status = 'succeeded') as last_success,
       max(d.start_time) filter (where d.status <> 'succeeded') as last_failure,
       count(*) filter (where d.status <> 'succeeded'
                          and d.start_time > now() - interval '7 days') as failures_7d
  from cron.job j
  left join cron.job_run_details d on d.jobid = j.jobid
                                  and d.start_time > now() - interval '60 days'
 where j.active
 group by j.jobid, j.jobname, j.schedule;

revoke all on public.scheduled_job_health from public, anon, authenticated;
grant select on public.scheduled_job_health to service_role;

-- ------------------------------------------------------------
-- The declared contract, one row per job that must exist
-- ------------------------------------------------------------

create table if not exists public.scheduled_job_expectation (
  jobid int primary key,
  expected_interval interval not null,
  owner text
);

alter table public.scheduled_job_expectation enable row level security;

revoke all on public.scheduled_job_expectation from public, anon, authenticated;
grant select on public.scheduled_job_expectation to service_role;

-- Schedule the retention job before seeding: its own expectation row must be
-- planted in the same migration, or the first run would flag it as missing.
do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'cron-job-run-details-retention') then
    perform cron.schedule(
      'cron-job-run-details-retention',
      '5 0 * * *',
      $$delete from cron.job_run_details where start_time < now() - interval '60 days'$$
    );
  end if;
end;
$do$;

-- Seeded by name, not by a hardcoded id: pg_cron assigns jobids when it first
-- schedules a job, so a migration cannot know them ahead of time. The resulting
-- rows are keyed by the real id and survive a job's deletion — that is what
-- catches a vanished job. Re-running only refreshes the declared contract.
insert into public.scheduled_job_expectation (jobid, expected_interval, owner)
select j.jobid, v.expected_interval, v.owner
  from cron.job j
  join (
    values
      ('daily-habit-reminder', interval '45 minutes', 'habitflow'),
      ('daily-habit-recovery-nudge', interval '26 hours', 'habitflow'),
      ('monthly-recurring-expenses', interval '35 days', 'finance'),
      ('push-subscriptions-sweep', interval '10 days', 'push'),
      ('mcp-oauth-tokens-sweep', interval '26 hours', 'mcp'),
      ('mcp-oauth-auth-codes-sweep', interval '26 hours', 'mcp'),
      ('mcp-connect-attempts-sweep', interval '26 hours', 'mcp'),
      ('download-jobs-sweep', interval '30 minutes', 'downloads'),
      ('spendtrack-prune-tombstones', interval '26 hours', 'spendtrack'),
      ('news-digests-sweep', interval '26 hours', 'news'),
      ('news-user-digests-sweep', interval '26 hours', 'news'),
      ('publish-due-scheduled-posts', interval '20 minutes', 'community'),
      ('telegram-bridge-prune', interval '26 hours', 'telegram'),
      ('telegram-bridge-wake', interval '20 minutes', 'telegram'),
      ('telegram-confirmations-prune', interval '26 hours', 'telegram'),
      ('scan-history-sweep', interval '26 hours', 'platform'),
      ('agent-turns-wake', interval '5 minutes', 'platform'),
      ('dispatch-audit-performance', interval '26 hours', 'platform'),
      ('dispatch-audit-security', interval '26 hours', 'platform'),
      ('dispatch-audit-ui-ux', interval '26 hours', 'platform'),
      ('dispatch-audit-scalability', interval '26 hours', 'platform'),
      ('dispatch-audit-maintainability', interval '26 hours', 'platform'),
      ('dispatch-audit-product', interval '26 hours', 'platform'),
      ('cron-job-run-details-retention', interval '26 hours', 'platform')
  ) as v(jobname, expected_interval, owner) on v.jobname = j.jobname
on conflict (jobid) do update
   set expected_interval = excluded.expected_interval,
       owner = excluded.owner;

-- ------------------------------------------------------------
-- The single read the route makes
-- ------------------------------------------------------------

create or replace function public.scheduled_job_health_rows()
returns table (
  jobid bigint,
  jobname text,
  schedule text,
  last_success timestamptz,
  last_failure timestamptz,
  failures_7d bigint,
  expected_interval_seconds double precision,
  owner text
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select coalesce(h.jobid, e.jobid)::bigint,
         h.jobname,
         h.schedule,
         h.last_success,
         h.last_failure,
         coalesce(h.failures_7d, 0)::bigint,
         extract(epoch from e.expected_interval)::double precision,
         e.owner
    from public.scheduled_job_expectation e
    full join public.scheduled_job_health h on h.jobid = e.jobid
   order by 1;
$$;

revoke all on function public.scheduled_job_health_rows() from public, anon, authenticated;
grant execute on function public.scheduled_job_health_rows() to service_role;
