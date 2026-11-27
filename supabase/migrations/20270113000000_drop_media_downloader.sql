-- The Media Downloader is retired (#1948). The product is not sold, no surface
-- draws it, `/downloader` is a permanent redirect since #1950, and its client
-- and server code is gone. What is left is the schema those layers wrote.
--
-- It goes rather than sitting at rest behind nothing: `download_jobs` and its
-- events hold the media URLs members pasted, which is member data for a product
-- that no longer exists, and the rest is configuration for a provider we no
-- longer call.
--
-- Two things leave with the tables, so they are stated here:
--   * the pg_cron sweep that reconciled stuck jobs (it would fail on a missing
--     table);
--   * the `downloader.job.create` rows in `usage_events` and `usage_limits`
--     (ADR-0075's catalogue) and the plan capability that priced it, which is
--     why `downloads` left `USAGE_COUNTERS` in the same change.
--
-- `usage_action_costs` is not touched: 20261029120000 retired the credit pool
-- and dropped that table, so the only catalogue left is `usage_limits`.
--
-- Rollback: the tables are recoverable only from a backup. Nothing in the app
-- reads them, which is the point of doing this after the code went.

-- The sweep is scheduled under this name by 20261007171335_sweep_download_jobs.
select cron.unschedule(jobid)
  from cron.job
 where jobname = 'download-jobs-sweep';

drop function if exists public.sweep_download_jobs();

-- `download_job_events` references `download_jobs`, so it goes first.
drop table if exists
  public.download_job_events,
  public.download_jobs,
  public.downloader_blocklist,
  public.downloader_platforms,
  public.downloader_settings;

-- The metered action the route used to record, then the cap it spent.
delete from public.usage_events
 where action_key = 'downloader.job.create';

delete from public.usage_limits
 where key = 'downloader.job.create';
