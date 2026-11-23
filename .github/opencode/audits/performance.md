# Performance audit

Read `.github/opencode/audits/_base.md` in full first. It defines the output format,
evidence rules, coverage rotation, redaction and hard rules. This section is your domain.

Load these skills only: `testing-performance-benchmarker`,
`vercel-react-best-practices` (React/Next.js patterns only — do **not** use Vercel CLI or
Vercel docs for deployment claims; this origin is on Render, ADR-0174),
`engineering-database-optimizer`, `testing-evidence-collector`,
`testing-reality-checker`, `research`.

## Start with the repo's own budgets, not a general checklist

Read `docs/performance.md`, `perf/budget.json` and `perf/baseline.json`. They name the
routes and ceilings that matter here (`html`, `js`, `css`, `fonts`, gzip KB). A claim that
a route is heavy is only a finding when you can show it against one of those numbers or
against a measured trend on the live origin. "It looks like a lot of JavaScript" is not a
finding.

Use the tools the repository already has, and quote their output:

- `npm run perf:baseline -- --json` / `npm run perf:check` read the last build's `.next`
  output. If no build is present, say so and use `perf/baseline.json` plus a live
  measurement instead of guessing. A build is allowed only when nothing cheaper settles
  the claim.
- `npm run perf:pages`, `npm run perf:field` and `npm run perf:paint` cover runtime
  behaviour (INP, long tasks, dropped frames). Run the one your focus needs and record its
  output.
- For the live origin, take five or more samples with
  `curl -sS -o /dev/null -w '%{http_code} %{time_total}\n' https://royaraqamia.com/<route>`
  and report the median and p95. Read the Render API for server-side metrics and deploys;
  never call a deploy hook.
- For the database, use Supabase MCP `get_advisors` and read-only queries on `pg_indexes`
  or `pg_stat_user_tables` when `query` is exposed. An index claim needs the table's row
  count and the query that would use it, not just the absence of an index.

## Scope: the six launch areas, in the day's rotating focus

Check rendering and caching boundaries, bundle weight per route, image and font strategy,
client components in hot paths, hydration waterfalls, RTL layout cost and the edge cache
on a real request. The APK loads those routes in a WebView, so the web measurement is the
one members feel. Use the `launch-scope` block to pick a route inside the six areas; an
Android startup or `check:visual` claim is out of scope.

## What counts as a finding here

- A measured breach of a committed budget, with the budget file, the measurement and the
  route named.
- A structural choice that will compound — per-request work that should be a cache or a
  server loader, an unbounded list, a job that grows with the table — with callers listed
  from Graphify.
- A missing measurement that the budget already assumes exists, with the exact command
  that proves it is missing.

The long-term fix is a cache boundary, a query/index contract, a generated single source
of truth or a measured budget update with evidence — never "add a debounce and hope".
Say which entry in `docs/performance.md` or `perf/budget.json` the finding threatens.
