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
`no_auth_pending`), and the next run re-measures it without anyone clearing a
flag.

`no_auth_pending` is deliberate: the store's connect flow is OAuth-only until
#1269, so a no-auth row would be a card a member cannot link. When that lands the
class becomes publishable without a schema change.

## The ladder (do not skip a step)

`dry_run` defaults to `true`; the kill switch is the repository variable
`MCP_CATALOG_AGENT_ENABLED` (off by default). Record each step here **before**
moving to the next one.

| Step | How it runs                                 | Cap | Recorded |
| ---- | ------------------------------------------- | --- | -------- |
| 1    | manual dispatch, `dry_run=false`, cap 3     | 3   | pending  |
| 2    | manual dispatch, `dry_run=false`, cap 3     | 3   | pending  |
| 3    | manual dispatch, `dry_run=false`, cap 10    | 10  | pending  |
| 4    | add the schedule (after step 3 is recorded) | 20  | pending  |

The workflow is dispatch-only until step 3 is recorded: the issue's requirement
is that the cron never exists before the ladder has been walked, so adding it is
the step-4 change and not part of the first delivery.

As each step finishes, replace `pending` with the run id and the date, and say
whether the counts (`eligible` / `published` / `waiting`) moved as expected.

## Variables and secrets

Repository **variables**: `MCP_CATALOG_AGENT_ENABLED`, `MCP_CATALOG_AGENT_URL`,
`MCP_CATALOG_AGENT_CAP`, `MCP_CATALOG_AGENT_PUBLISH_CAP`,
`MCP_CATALOG_AGENT_EGRESS_BUDGET`.

Repository **secrets**: `MCP_CATALOG_AGENT_TOKEN` (the endpoint's only
credential; empty refuses every request), `OPENCODE_API_KEY`,
`SUPABASE_PROJECT_REF` (only for the runner config).

The job holds no service-role key and has `contents: read`. Its ability to write
is the endpoint's verb allowlist, not a database role.

## What is still a person

- Creating an OAuth client in a provider's console (the static-client map is code
  - env, reviewed, and the agent never invents one).
- Merging the batched mark pull request, when a brand's SVG has to ship with the
  site. Until it merges the row waits as `repo_pr_pending`; the first run after
  the merge publishes it.
- Reading the withdrawal tracking issue (`MCP catalogue agent: runs and
withdrawals`), which is deduped by title and commented once per run that took a
  row out.
