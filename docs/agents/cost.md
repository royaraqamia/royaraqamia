# What the agents cost, and how it is controlled

Every workflow that answers through `OPENCODE_API_KEY` is on an **OpenCode Go**
subscription. Go does not bill per token: it grants a monthly dollar allowance per
model, split into a five-hour window (20%), a weekly window (50%) and the month
(100%). DeepSeek V4.1 Flash — the model every agent uses — carries a **$100**
monthly limit on Go, so its windows are **$20 per five hours** and **$50 per week**.

Decision and reasoning: [ADR-0133](../adr/0133-agent-spend-is-measured-per-run.md).

## The only recurring bill

Everything the product itself runs on is a free tier; the one recurring charge is the origin. Since
2026-11-26 it is a **2 vCPU / 2 GB / 30 GB VPS from Illevante at $6.70 a month** (ADR-0221), and
**$10 a month is the hard cap**: a month that would exceed it is a decision for the owner, not a
charge that lands by itself. Nothing else is authorized. A second box, a managed registry, a
provider snapshot plan, a paid monitor or a CDN plan is each a new decision with its own record,
because the first exception to the no-cost rule is what makes the second one easy.

Read the bill in the Illevante panel, not from this page: the figure here is the authorized amount,
set at the purchase, and the panel is the measurement.

## Peak hours are the cheapest saving

DeepSeek prices Flash at **$0.15/$0.60** per million input/output tokens off-peak
and **$0.30/$1.20** during **01:00–04:00 and 06:00–10:00 UTC, Monday to Friday**.
The allowance counts list price, so the same work costs double in those windows.
Schedules are chosen for that, not for the clock:

| Workflow          | Cron (UTC)       | Why                                                                          |
| ----------------- | ---------------- | ---------------------------------------------------------------------------- |
| Six audits        | `10 10-15 * * *` | 13:10-18:10 Damascus; six distinct off-peak hours, one per domain (ADR 0208) |
| Issue Implementer | `45 12 * * *`    | 15:45 Damascus; three rounds, only on human-labelled issues                  |
| News Digest       | `30 23 * * *`    | 02:30 Damascus; ready before the morning read                                |
| PR Landing        | `15 */2 * * *`   | every two hours, so a stranded PR cannot cost 48 turns                       |
| `/oc`             | on demand        | the person asked for it                                                      |
| Telegram bridge   | on message       | the owner asked for it                                                       |

If a schedule has to move, keep long batches inside **10:00–01:00 UTC**.

The clock has two more guards, because a trigger is only the start:

- each audit's **primary** trigger is the pg_cron job, not the GitHub schedule
  (`supabase/migrations/20261215000000_dispatch_audit_workflows.sql`); all six hours
  sit inside the off-peak stretch and the GitHub schedules are no-config backstops;
- the implementer's 12:45 run is its primary trigger — the audits never dispatch it,
  because a finding becomes implementable only when a maintainer labels it;
- the gate also answers `peak`, and the implementer and PR Landing repairs are
  deferred when they would start inside a peak window. PR Landing still sweeps every
  two hours because a green merge costs no model work; only its repair waits.

## Reasoning depth and output ceilings

No workflow asks for `variant: high` any more. That is the saving: reasoning is
billed as output, and the variant buys more of it.

`OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX` is left as it was, because it is not a
cost lever. The limit is applied **per request**, and OpenCode already clamps a
reply at `OUTPUT_TOKEN_MAX = 256_000` ("no reply needs more, however much the
model allows"), so the `750000` values were already inert. Lowering them only
adds a way to truncate a single long reply — a failed run and a retry, which
costs more than the reply would have.

## The ledger

`public.agent_usage` holds one row per agent step, written by
`.github/actions/agent-usage` (which runs `scripts/agents/usage.mjs`). Each row
carries the workflow, run, round, model, `allowance_usd`, `cost_usd`, the token
breakdown and the raw CLI payload.

```sql
-- what the last day cost, by workflow
select workflow,
       round,
       to_char(recorded_at at time zone 'UTC', 'HH24:MI') as at,
       allowance_usd,
       cost_usd
from public.agent_usage
where recorded_at > now() - interval '1 day'
order by recorded_at desc;
```

The workflow step is `continue-on-error`, and the module never throws: a missing
secret or CLI leaves the row unwritten and the job untouched. The Console
(**Activity → Usage**, with a CSV export over 7/30/90 days) remains the truth for
the plan as a whole, because it also counts usage the repository did not record.

Two shapes decide whether a row carries a number at all, and both are handled
where the CLI and the ledger are read (issue #1497):

- **The CLI is not always the JSON one.** `@opencode/cli` 2.x answers
  `stats --json`; `opencode-ai` 1.x has no `--json` flag and prints its help with
  exit 1. The 1.x human table is parsed as the documented last resort, reading
  `Total Cost` from the COST & TOKENS block, with the machine's digits and
  separators folded to ASCII first. `--project` is passed `.`, never a path: 2.x
  accepts a path silently and reports zero.
- **The ledger is summed here, not by PostgREST.** Aggregates are refused on this
  project (`PGRST123`), so the gate reads plain rows in pages of 1000 and adds
  `allowance_usd` itself. A `null` row is an unmeasured step (ADR-0142), never a
  zero: it is skipped, and the gate says how many it skipped.

## The soft gate

Before an autonomous run, `.github/actions/agent-usage` in `gate` mode sums the
allowance in the last five hours, seven days and thirty days. At three quarters of
a window (`$15` / `$40` / `$75` by default) it answers `soft=true`, and only
optional work is trimmed:

- **Issue Implementer**: one round instead of six (round 1 always runs).
- **PR Landing**: a green pull request still merges; the agent repair is deferred
  to the next pass.
- **News Digest**: the shared digest still publishes; per-reader digests are
  deferred.
- **Planner, `/oc`, Telegram**: never gated.

A failed or empty answer reads as "not soft". To change the thresholds, edit the
`cap-5h-usd` / `cap-weekly-usd` / `cap-monthly-usd` inputs on the gate step of the
workflow in question.

## Audit cadence review

The six audits are deliberately **not** gated by the soft gate: a budget gate
could skip a day, which is the one contract ADR-0208 makes absolute. Six full
toolchains (Chromium, JDK 21, Android SDK, Gradle) install every day, and each
agent run is bounded at 45 minutes. That spend is real and unbounded by design,
so it has to be measured rather than assumed.

Read it by workflow with the ledger query above, or for the whole plan with
`node scripts/agents/usage.mjs gate` (the Console's **Activity → Usage** CSV is
the wider truth). A `null` `allowance_usd` is an unmeasured step, not zero.

**Review point:** after 30 days of the current cadence, compare the six audit
workflows' total allowance against the findings that were labelled
`ready-for-agent` and landed. Decide then whether daily × six domains still
buys its keep, or whether one deep domain per day or a weekly rotation is the
better trade. No cadence change is made here: the evidence bar, the six hours
and the three-entries-a-day contract stay as they are until that measurement
exists (ADR-0210 decision 7).

## A refusal is not a repair

A 429, a budget or a capacity refusal is detected before a repair starts and
deferred to the next window. An agent cannot fix an exhausted allowance, and
spending 45–60 minutes failing the same way is how a limited window becomes a
dead day (ADR-0032's 2026-11-05 amendment).
