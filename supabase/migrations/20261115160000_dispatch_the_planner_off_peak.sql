-- The planner's punctual trigger moves out of DeepSeek's peak-price window.
--
-- `20261010131500` scheduled `dispatch-issue-planner` at 03:00 UTC, inside the first
-- peak window (01:00-04:00 UTC, Monday to Friday) where DeepSeek V4.1 Flash counts
-- double against the Go allowance. ADR 0133 moved the workflow's GitHub `schedule`
-- backstop to 10:15, but this pg_cron job is the primary trigger: every daily planner
-- run - and the implementer it dispatches - was still starting in peak. The schedule
-- now matches the documented 10:15 UTC, the edge of the off-peak stretch.
--
-- `cron.schedule` updates a job when its name already exists, so this moves the job
-- rather than creating a second one. The remaining redundancy is intentional: the
-- planner's own `Daily guard` and its concurrency group make the GitHub schedule a
-- no-op when this dispatch already ran, and the health monitor still catches a fully
-- missed day.
--
-- Rollback:
--   select cron.schedule(
--     'dispatch-issue-planner',
--     '0 3 * * *',
--     $$select public.dispatch_github_workflow('issue-planner.yml', 'main')$$
--   );
select cron.schedule(
  'dispatch-issue-planner',
  '15 10 * * *',
  $$select public.dispatch_github_workflow('issue-planner.yml', 'main')$$
);
