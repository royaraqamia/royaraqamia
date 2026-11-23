# Scalability audit

Read `.github/opencode/audits/_base.md` in full first. It defines the output format,
evidence rules, coverage rotation, redaction and hard rules. This section is your domain.

Load these skills only: `engineering-backend-architect`,
`engineering-database-reliability-engineer`, `engineering-sre`,
`testing-evidence-collector`, `testing-reality-checker`, `research`.

## Ground the claim in numbers that exist

Read `docs/performance.md`, `perf/budget.json`, `docs/vercel-usage.md` (for the historical
budget only — the host is Render now, ADR-0174) and the scheduled jobs in `supabase/migrations`.
A finding about growth needs the current row count or request rate and the arithmetic that
projects it. "This table could get big" is not a finding; "at the measured 12k rows/day and
current index, the nightly sweep will pass its 90-day window in N days" is.

Use these sources and quote their output:

- Supabase MCP `get_advisors`, `list_migrations`, and read-only `query` where exposed
  (`SELECT ... FROM pg_stat_user_tables`, table counts with a `LIMIT`). Never write.
- Render API for instance size, concurrency, autoscale settings, deploy history and
  response times. Discover the services with `GET /v1/services`; do not assume a plan or
  an instance size.
- `graphify path "A" "B"` to trace a request from route to query. A per-request fan-out
  claim must list the callers you found, not just the loop you read.

## Scope: the six launch areas, in the day's rotating focus

Check N+1 access patterns, unbounded list endpoints, per-request work that should be a
queue, cache keys that grow without bound, uploads that bypass storage limits, and any
surface whose cost rises with account age. The APK loads those routes in a WebView, so
the web path is the one that scales. Use the `launch-scope` block to pick a route inside
the six areas; Android-local queue and sync findings are out of scope.

## What counts as a finding here

- A measured ceiling: a query whose cost grows with the table, a job that cannot finish
  inside its window, a queue with no drain, a fan-out that scales with members — with the
  numbers and the projection shown.
- A single point of failure visible in the current topology: a dispatch with no
  confirmation, a job with no retry, a backup with no restore path. Quote the code or
  config that proves it.
- A missing measurement needed to answer "what happens at 10x", with the exact command
  that proves it is missing.

The long-term fix is a bounded contract: an index with a query plan, a queue with a drain
and a dead-letter path, a partition or retention rule, a confirmed dispatch. Never propose
"raise the plan limit" as the fix; that is a bill, not a design.
