-- ============================================================
-- perf_samples: the launch, tap and vitals records get a sink (#1885)
--
-- The beacon at `/api/app-perf` used to end in one `logger.info` line, and after
-- the move onto the VPS the only place that line landed was the app container's
-- stdout (`json-file`, 10 MB x 3, then overwritten). `scripts/perf-field.mjs`
-- could only read a file somebody had already saved, so a number in a report was
-- a recollection, not a query (#1885, ADR-0228).
--
-- This table is the durable half. Three decisions are written here rather than
-- in the service that happens to write it:
--
-- 1. **One row per beacon, and only the fields the contract has.** No URL, no
--    path, no user, no session, no client id, no user agent, no product and no
--    mutation name - the boundary ADR-0074/ADR-0075 fixed for the record itself,
--    so the rows are safe to keep and to query.
-- 2. **The shape belongs to the kind.** `platform` is nullable at the column
--    because a future origin row (request rate, p95) has none, but the check
--    below makes it non-null for the three kinds that exist today and pins the
--    durations each kind must carry. A row that lies about its kind cannot be
--    stored, even by the service role.
-- 3. **Sixty days, swept nightly.** The window matches the scheduler's own run
--    log (`cron-job-run-details-retention`, 60 days), so a perf window and the
--    runs that collected it stay joinable for exactly as long as both exist. A
--    longer trend belongs in the recorded baseline (`perf/runtime-budget.json`),
--    not in this table.
--
-- Rollback:
--   select cron.unschedule('perf-samples-sweep');
--   delete from public.scheduled_job_expectation
--    where jobid = (select jobid from cron.job where jobname = 'perf-samples-sweep');
--   drop function if exists public.sweep_perf_samples();
--   drop table if exists public.perf_samples;
--   (the samples themselves are not recoverable; that is what a window means)
-- ============================================================

create extension if not exists pg_cron;

create table if not exists public.perf_samples (
  id           uuid primary key default gen_random_uuid(),
  -- The contract's own vocabulary (`shared/contracts/app-perf.ts`).
  kind         text not null,
  -- `shell`, `pwa` or `web`. Null only for a kind that has no client, which none
  -- of today's three is - the shape check below is where that is enforced.
  platform     text,
  -- Launch only: the document came over the network (cold) or from a cache.
  cold         boolean,
  -- Launch: boot -> shell and boot -> content. Tap: tap -> paint.
  shell_ms     integer,
  content_ms   integer,
  paint_ms     integer,
  -- Vitals: the four Core Web Vitals ceilings, one record per page life.
  lcp_ms       integer,
  cls          numeric(6, 3),
  inp_ms       integer,
  ttfb_ms      integer,
  recorded_at  timestamptz not null default now(),
  constraint perf_samples_kind check (kind in ('launch', 'tap', 'vitals')),
  constraint perf_samples_platform check (platform in ('shell', 'pwa', 'web')),
  -- The invariant is per kind, not per column: today's three kinds all name a
  -- platform and carry their own durations, and adding a fourth kind later is
  -- one arm here rather than an `alter table ... not null` and a backfill.
  constraint perf_samples_shape check (
    case kind
      when 'launch' then platform is not null and cold is not null
                       and shell_ms is not null and content_ms is not null
      when 'tap' then platform is not null and paint_ms is not null
      when 'vitals' then platform is not null and lcp_ms is not null and cls is not null
                        and inp_ms is not null and ttfb_ms is not null
    end
  ),
  constraint perf_samples_durations check (
    coalesce(shell_ms, 0) >= 0
    and coalesce(content_ms, 0) >= 0
    and coalesce(paint_ms, 0) >= 0
    and coalesce(lcp_ms, 0) >= 0
    and coalesce(inp_ms, 0) >= 0
    and coalesce(ttfb_ms, 0) >= 0
    and coalesce(cls, 0) >= 0
  )
);

comment on table public.perf_samples is
  'One row per /api/app-perf beacon: the platform, the cold/warm flag and the launch, tap or vitals durations. No page, user or session (ADR-0074, ADR-0075, ADR-0228).';
comment on column public.perf_samples.platform is
  'shell, pwa or web. Nullable for a future kind with no client; every kind that exists today requires it.';
comment on column public.perf_samples.recorded_at is
  'When the origin accepted the beacon. The read and the 60-day sweep both order by it.';

-- The only read is a window (`recorded_at >= since`) and the only delete is the
-- oldest rows first; one index serves both.
create index if not exists idx_perf_samples_recorded_at
  on public.perf_samples (recorded_at);

-- ------------------------------------------------------------
-- Who may touch it
--
-- The writer is the server (service role, through the repository) and the
-- reader is `scripts/perf-field.mjs` (service role, through PostgREST). A
-- signed-in member, an anonymous client and a browser have no door: RLS is on
-- with no policy, and no client role holds a grant. That is stricter than a
-- policy, and it is the point - the table is telemetry, not a member's data.
-- ------------------------------------------------------------

alter table public.perf_samples enable row level security;

revoke all on public.perf_samples from public, anon, authenticated;
grant select, insert on public.perf_samples to service_role;

-- ------------------------------------------------------------
-- Retention: 60 days, in 5,000-row batches, nightly at 03:40 UTC
--
-- Off-peak and between the notifications sweep (03:20) and the scan-history one
-- (04:20), so a write from the evening is never pruned in the hour it landed.
-- ------------------------------------------------------------

create or replace function public.sweep_perf_samples()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  removed integer;
begin
  loop
    with expired as (
      select id
        from public.perf_samples
       where recorded_at < now() - interval '60 days'
       order by recorded_at
       limit 5000
    )
    delete from public.perf_samples s
     using expired
     where s.id = expired.id;

    get diagnostics removed = row_count;
    exit when removed < 5000;
  end loop;
end;
$fn$;

revoke all on function public.sweep_perf_samples() from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'perf-samples-sweep') then
    perform cron.schedule(
      'perf-samples-sweep',
      '40 3 * * *',
      $$select public.sweep_perf_samples()$$
    );
  end if;
end;
$do$;

-- Every active job owes the health fleet an expectation (#1744); a sweep that
-- arrives without one is reported as a gap by /api/cron/job-health.
insert into public.scheduled_job_expectation (jobid, expected_interval, owner)
select j.jobid, interval '26 hours', 'observability'
  from cron.job j
 where j.jobname = 'perf-samples-sweep'
on conflict (jobid) do update
   set expected_interval = excluded.expected_interval,
       owner = excluded.owner;
