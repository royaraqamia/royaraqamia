# What the agents cost, and how it is controlled

Every workflow that answers through `OPENCODE_API_KEY` is on an **OpenCode Go**
subscription. Go does not bill per token: it grants a monthly dollar allowance per
model, split into a five-hour window (20%), a weekly window (50%) and the month
(100%). DeepSeek V4.1 Flash — the model every agent uses — carries a **$100**
monthly limit on Go, so its windows are **$20 per five hours** and **$50 per week**.

Decision and reasoning: [ADR-0133](../adr/0133-agent-spend-is-measured-per-run.md).

## Peak hours are the cheapest saving

DeepSeek prices Flash at **$0.15/$0.60** per million input/output tokens off-peak
and **$0.30/$1.20** during **01:00–04:00 and 06:00–10:00 UTC, Monday to Friday**.
The allowance counts list price, so the same work costs double in those windows.
Schedules are chosen for that, not for the clock:

| Workflow          | Cron (UTC)     | Why                                                         |
| ----------------- | -------------- | ----------------------------------------------------------- |
| Issue Planner     | `15 10 * * *`  | 13:15 Damascus; hands the implementer the off-peak stretch  |
| Issue Implementer | `45 12 * * *`  | 15:45 Damascus; backstop only, after the planner's dispatch |
| News Digest       | `30 23 * * *`  | 02:30 Damascus; ready before the morning read               |
| PR Landing        | `15 */2 * * *` | every two hours, so a stranded PR cannot cost 48 turns      |
| `/oc`             | on demand      | the person asked for it                                     |
| Telegram bridge   | on message     | the owner asked for it                                      |

If a schedule has to move, keep long batches inside **10:00–01:00 UTC**.

The clock has two more guards, because a trigger is only the start:

- the planner's **primary** trigger is the pg_cron job, not the GitHub schedule
  (`supabase/migrations/20261115160000_dispatch_the_planner_off_peak.sql`); it was
  still 03:00 UTC after the workflow moved, so every real planner run was in peak;
- the implementer's backstop is 12:45 rather than 10:45 so the planner's dispatch
  (which finishes around 11:30) goes first and is not suppressed by the daily guard;
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

## A refusal is not a repair

A 429, a budget or a capacity refusal is detected before a repair starts and
deferred to the next window. An agent cannot fix an exhausted allowance, and
spending 45–60 minutes failing the same way is how a limited window becomes a
dead day (ADR-0032's 2026-11-05 amendment).
