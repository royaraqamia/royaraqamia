-- The /rates health path reads the last successful sync to answer "is the feed up?":
--
--   select * from public.rate_sync_runs
--   where status = 'success'
--   order by finished_at desc
--   limit 1;
--
-- (backend/repositories/rates/index.ts, getLastSuccessfulRun, called by
-- backend/services/rates/rates-service.ts getHealth). The table gains a row per
-- sync attempt, and the only index it carried matched neither the predicate nor
-- the sort, so this read was a sequential scan plus a sort whose cost grows with
-- every attempt. This index serves both halves of the query.
--
-- idx_rate_sync_runs_started_at is left in place, deliberately: `select('*')`
-- still reads `started_at` and mapSyncRun projects it into RateSyncRun, so the
-- column is read even though no query filters or orders by it. Dropping the
-- index would be a destructive statement docs/supabase.md keeps behind a human
-- (check-migration-safety.mjs refuses an index drop the same file does not
-- recreate), and it buys nothing while the column stays. It may still appear in
-- the performance advisor as unused.
--
-- Rollback:
--   drop index if exists public.idx_rate_sync_runs_status_finished;

create index if not exists idx_rate_sync_runs_status_finished
  on public.rate_sync_runs (status, finished_at desc);
