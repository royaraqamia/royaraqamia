# The MCP catalogue agent

The scheduled/unattended run that measures catalogue rows, sources their marks
and Arabic copy, and publishes what the checks support (#1293). The mirror is
the haystack; this is how the store's curating is kept honest without a person
standing between the probe and the publish.

## The loop

1. **`plan`** (`node scripts/mcp-catalog-agent.mjs plan`) asks the scoped
   endpoint for a capped page of candidates, measures each through the same probe
   and egress code a member's connect flow uses, and writes
   `/tmp/mcp-catalog-agent-plan.json`. It writes nothing to the store.
2. **The sourcing step** is one DeepSeek 4.1 Flash run. It reads the plan and
   writes `/tmp/mcp-catalog-agent-decisions.json`: marks from the three allowed
   sources, and `title_override` / `name_ar` / `description_ar` as transforms of
   the registry's own text. It decides nothing about publishing.
3. **`apply`** validates every decision (source host, `/brand/` file present, the
   `logo_uri` is the one the probe measured), attaches the registry source text
   itself, applies mark → copy → verify, enforces the publish cap, and records the
   row that stopped the page at the cap.

The checks decide. A row that fails waits as a skip event with a category
(`no_mark`, `no_registration`, `check_failed`, `repo_pr_pending`,
`no_auth_pending`), and the row is measured again after a week without anyone
clearing a flag.

That week is the cooldown, and it is what keeps the queue moving. The candidate
page is ordered unverified-first and then by the oldest measurement, so a row
that always fails would otherwise be the first row of every run and the run
would never reach the rows behind it — which is exactly what the first two
live runs did: cap 3, the same three `no_registration` rows, nothing published.
`listRecentSkips` names the rows whose newest act was a skip in the last seven
days, and `listAgentCandidates` passes them over (a published row is never
passed over: re-checking it is how a withdrawal is found). A reason that clears
comes back a week later on its own.

`no_auth_pending` is deliberate: the store's connect flow is OAuth-only until
#1269, so a no-auth row would be a card a member cannot link. When that lands the
class becomes publishable without a schema change.

## The ladder (do not skip a step)

`dry_run` defaults to `true`; the kill switch is the repository variable
`MCP_CATALOG_AGENT_ENABLED` (off by default). Record each step here **before**
moving to the next one. The counts are the ones the run's summary printed; a
run's coverage is measured at `plan` time, so it names the state the run started
from.

| Step | How it runs                                 | Cap | Recorded                 |
| ---- | ------------------------------------------- | --- | ------------------------ |
| 1    | manual dispatch, `dry_run=false`, cap 3     | 3   | 43070731547, 2026-11-11  |
| 2    | manual dispatch, `dry_run=false`, cap 3     | 3   | 43071155049, 2026-11-11  |
| 3    | manual dispatch, `dry_run=false`, cap 10    | 10  | 43072048941, 2026-11-11  |
| 4    | add the schedule (after step 3 is recorded) | 20  | `45 4 * * *`, 2026-11-11 |

**Step 1 — [run 43070731547](https://github.com/royaraqamia/royaraqamia/actions/runs/43070731547), cap 3.**
Started `eligible 0 / published 10 / waiting 3`, measured 3, one publishable.
Published `ai.0si/disclosures`, skipped `agency.thirdhemisphere/ai-authority-index`
and `agency.zoll/ausfuhr`. First run after the cooldown fix (#1304): the page
moved past the three rows that had pinned it. An earlier dispatch of the same
step, `43070218834`, failed with `the catalogue agent answered 500` while the
deployment was still propagating; the endpoint answered normally a minute later
and the step was re-dispatched.

**Step 2 — [run 43071155049](https://github.com/royaraqamia/royaraqamia/actions/runs/43071155049), cap 3.**
Started `eligible 1 / published 11 / waiting 5`, measured 3, one publishable.
Published `ai.1clickwebsite/mcp`, skipped `ai.1court.state/court-directory` and
`ai.4ai/domains`.

**Step 3 — [run 43072048941](https://github.com/royaraqamia/royaraqamia/actions/runs/43072048941), cap 10.**
Started `eligible 2 / published 12 / waiting 7`, measured 10, six publishable.
Published `ai.aard/aard`, `ai.abmeter/abmeter` and `ai.adkix/adkix`; two rows got
their copy and were then skipped for want of a mark (`ai.adadvisor/mcp-server`,
`ai.adplane/google-ads`), which is the rule working: copy is not a publish.
Seven rows skipped.

After step 3: `eligible 5 / published 15 / waiting 14` — published 10 → 15 across
the ladder, and the five publishes each carry `agent:mcp-catalog`, the mark
source and the copy source.

Step 4 is this change: the schedule is `45 4 * * *`, three quarters of an hour
after the catalogue sync at `0 4 * * *` (`vercel.json`), with the caps in
repository variables. The workflow now defaults `dry_run` to `false` for a
scheduled run: the runner's own fallback is `true`, so without that a cron would
have measured and written nothing while reporting success.

## Variables and secrets

Repository **variables**: `MCP_CATALOG_AGENT_ENABLED`, `MCP_CATALOG_AGENT_URL`,
`MCP_CATALOG_AGENT_CAP`, `MCP_CATALOG_AGENT_PUBLISH_CAP`,
`MCP_CATALOG_AGENT_EGRESS_BUDGET`.

In use since step 4: `ENABLED=true`, `CAP=20`, `PUBLISH_CAP=20`,
`EGRESS_BUDGET=20`, `URL` unset (the default is production). A scheduled run
takes its caps from those variables; a dispatch may override the cap for one run
with the `cap` input. Turning `ENABLED` off stops the writes without touching the
workflow.

Repository **secrets**: `MCP_CATALOG_AGENT_TOKEN` (the endpoint's only
credential; empty refuses every request), `OPENCODE_API_KEY`,
`SUPABASE_PROJECT_REF` (only for the runner config).

The job holds no service-role key and has `contents: read`. Its ability to write
is the endpoint's verb allowlist, not a database role.

## What is still a person

- Creating an OAuth client in a provider's console (the static-client map is code
  - env, reviewed, and the agent never invents one).
- Merging the batched mark pull request the run opens when it vendors a Simple
  Icons SVG (one request per run, listing the rows and sources). Until it merges
  the row waits as `repo_pr_pending`; the first run after the merge publishes it.
- Reading the withdrawal tracking issue (`MCP catalogue agent: runs and
withdrawals`), which is deduped by title and commented once per run that took a
  row out.
