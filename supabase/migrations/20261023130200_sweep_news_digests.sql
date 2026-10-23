-- ============================================================
-- Thirty-day retention for the news digest
--
-- The owner's decision (2026-10-23): a month-old digest is history nobody reads,
-- and third-party summaries should not be kept longer than the point they serve.
-- Keeping them would also grow the search index without adding value, and a
-- never-pruned table on the free plan is a table that eventually costs a vacuum.
--
-- So the digest is deleted, not archived: `digest_date` older than 30 Damascus
-- days goes, and `on delete cascade` takes its stories. The page never has to
-- render a "too old" state because the rows simply stop existing, and the archive
-- strip is derived from what is left.
--
-- Mirrors the `sweep_expired_mcp_oauth_tokens` pattern (20260919180145): a
-- SECURITY DEFINER function, execute-revoked from public roles, scheduled by
-- pg_cron. Runs at 04:15 UTC, after the 03:00 UTC digest run, so a digest is never
-- swept in the same hour it was written.
--
-- Rollback:
--   select cron.unschedule('news-digests-sweep');
--   drop function if exists public.sweep_news_digests();
-- ============================================================

create extension if not exists pg_cron;

create or replace function public.sweep_news_digests()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  delete from public.news_digests
  where digest_date < (now() at time zone 'Asia/Damascus')::date - 30;
end;
$fn$;

revoke execute on function public.sweep_news_digests()
  from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'news-digests-sweep') then
    perform cron.schedule(
      'news-digests-sweep',
      '15 4 * * *',
      $$select public.sweep_news_digests()$$
    );
  end if;
end;
$do$;
