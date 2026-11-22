-- Assertions for the scheduler's new reader (#1744). Run with
-- `supabase test db` against the local stack - see README.md.
--
-- The contract is the one the 503 from /api/cron/job-health depends on: every
-- active job is visible to the health view, every active job declares an
-- expectation, the retention job exists and outlives every declared interval,
-- and the two readers are service-role only. The sentinel in the middle proves
-- the gap check would actually catch a job that arrived without an expectation
-- rather than passing on an empty table. This file rolls back.

begin;

create extension if not exists pgtap;

select plan(8);

select ok(
  to_regclass('public.scheduled_job_health') is not null,
  'the health view exists'
);

select is(
  (select count(*)::bigint from public.scheduled_job_health),
  (select count(*)::bigint from cron.job where active),
  'the view returns one row per active job'
);

select is(
  (select count(*)::bigint
     from cron.job j
     left join public.scheduled_job_expectation e on e.jobid = j.jobid
    where j.active and e.jobid is null),
  0::bigint,
  'every active job declares an expectation'
);

-- A job that appears without an expectation is the case a view over cron.job
-- alone is blind to; make sure the reader would actually report it.
insert into cron.job (jobid, schedule, command, jobname)
values (2147483000, '0 0 * * *', 'select 1', 'pgtap-no-expectation');

select is(
  (select count(*)::bigint
     from cron.job j
     left join public.scheduled_job_expectation e on e.jobid = j.jobid
    where j.active and e.jobid is null and j.jobname = 'pgtap-no-expectation'),
  1::bigint,
  'an active job with no expectation is reported as a gap'
);

delete from cron.job where jobid = 2147483000;

select ok(
  exists (select 1 from cron.job where jobname = 'cron-job-run-details-retention'),
  'the run-log retention job is scheduled'
);

select ok(
  coalesce(
    (select bool_and(interval '60 days' > expected_interval)
       from public.scheduled_job_expectation),
    true
  ),
  'the retention window outlives every declared interval'
);

select ok(
  has_table_privilege('service_role', 'public.scheduled_job_health', 'select'),
  'the health view is readable by the cron service role'
);

select ok(
  not has_table_privilege('authenticated', 'public.scheduled_job_expectation', 'select'),
  'a member cannot read the job contract'
);

select * from finish();

rollback;
