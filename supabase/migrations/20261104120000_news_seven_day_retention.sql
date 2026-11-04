-- ============================================================
-- Seven-day retention for the news digest, shared and personal
--
-- The owner's decision (2026-11-04): the digest is a briefing for the week, not
-- an archive. The 2026-10-23 rule kept thirty days; seven is the whole product
-- now, for every plan and for an Admin alike, and the rows are deleted rather
-- than hidden, so search, the archive strip and the digest itself all describe
-- the same window by construction.
--
-- `sweep_news_digests` and `sweep_news_user_digests` keep their cron schedules
-- (04:15 and 04:30 UTC, both after the 03:00 UTC publish) and only change the
-- window: `digest_date <= today - 7` leaves today and the six days before it,
-- and `on delete cascade` takes each day's stories with it.
--
-- The one-time deletes run here as well as in the sweeps, so the first cron tick
-- after this migration is not what a reader waits for to stop seeing a month.
--
-- Rollback:
--   (re-create both functions from 20261023130200 and 20261024160000)
--   -- the deleted rows are not recoverable; that is the point of the decision.
-- ============================================================

-- ------------------------------------------------------------
-- One-time purge, so the window is true the moment this deploys
-- ------------------------------------------------------------
delete from public.news_digests
 where digest_date <= (now() at time zone 'Asia/Damascus')::date - 7;

delete from public.news_user_digests
 where digest_date <= (now() at time zone 'Asia/Damascus')::date - 7;

-- ------------------------------------------------------------
-- The sweeps
-- ------------------------------------------------------------
create or replace function public.sweep_news_digests()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  delete from public.news_digests
  where digest_date <= (now() at time zone 'Asia/Damascus')::date - 7;
end;
$fn$;

revoke execute on function public.sweep_news_digests()
  from public, anon, authenticated;

create or replace function public.sweep_news_user_digests()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  delete from public.news_user_digests
  where digest_date <= (now() at time zone 'Asia/Damascus')::date - 7;
end;
$fn$;

revoke execute on function public.sweep_news_user_digests()
  from public, anon, authenticated;

comment on function public.sweep_news_digests() is
  'Deletes digests older than the seven-day window; the shared and personal sweeps keep that window the same for both tables (2026-11-04).';
comment on function public.sweep_news_user_digests() is
  'Deletes personal digests older than the seven-day window, matching the shared sweep.';
