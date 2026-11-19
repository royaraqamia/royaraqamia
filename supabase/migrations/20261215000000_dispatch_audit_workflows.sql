-- One punctual trigger per specialised audit (ADR 0208).
--
-- The generic Issue Planner is retired: six domain audits now scan the whole codebase
-- every day and publish three evidence-backed issues each. Their primary trigger is
-- this pg_cron dispatch, because GitHub's `schedule` is best-effort and can silently
-- drop a day. The GitHub schedules and `issue-automation-health.yml` are the backstops,
-- and each workflow's day guard counts the issues actually filed with its own label,
-- so a redundant trigger files nothing and a partial day is filled rather than skipped.
--
-- All six hours are inside the off-peak stretch of ADR 0133 (10:00-01:00 UTC).
-- `cron.schedule` updates a job with the same name, so re-running this migration is
-- idempotent. Rollback: unschedule the six `dispatch-audit-*` jobs and restore
-- `dispatch-issue-planner` to '15 10 * * *' if the old workflow is brought back.

select cron.unschedule('dispatch-issue-planner');

select cron.schedule(
  'dispatch-audit-performance',
  '10 10 * * *',
  $$select public.dispatch_github_workflow('audit-performance.yml', 'main')$$
);

select cron.schedule(
  'dispatch-audit-security',
  '10 11 * * *',
  $$select public.dispatch_github_workflow('audit-security.yml', 'main')$$
);

select cron.schedule(
  'dispatch-audit-ui-ux',
  '10 12 * * *',
  $$select public.dispatch_github_workflow('audit-ui-ux.yml', 'main')$$
);

select cron.schedule(
  'dispatch-audit-scalability',
  '10 13 * * *',
  $$select public.dispatch_github_workflow('audit-scalability.yml', 'main')$$
);

select cron.schedule(
  'dispatch-audit-maintainability',
  '10 14 * * *',
  $$select public.dispatch_github_workflow('audit-maintainability.yml', 'main')$$
);

select cron.schedule(
  'dispatch-audit-product',
  '10 15 * * *',
  $$select public.dispatch_github_workflow('audit-product.yml', 'main')$$
);
