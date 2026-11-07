# 0133 — Agent spend is measured per run, and trimmed rather than guessed

Date: 2026-11-06

## Context

Every autonomous agent in this repository — the Issue Planner, the Issue
Implementer, PR Landing, `/oc`, the Telegram bridge and the News Digest — answers
through the same `OPENCODE_API_KEY`, which is an **OpenCode Go** subscription.
Go does not bill per token. It grants a monthly dollar allowance per model, and
each request counts at that model's list price. DeepSeek V4.1 Flash, the model
every workflow uses, carries a **$100 monthly limit** on Go, and the plan cuts
that into windows: **$20 per five hours** and **$50 per week**.

Two things drain that allowance faster than the work does.

**Peak pricing.** DeepSeek prices Flash at **$0.15/$0.60** per million input/output
tokens off-peak and **$0.30/$1.20** inside its peak windows — **01:00–04:00 and
06:00–10:00 UTC, Monday to Friday**. The allowance is dollar-denominated, so the
same work costs **twice as much** at the wrong hour. Every scheduled run sat
inside a peak window: the planner at `03:00`, the news digest at `03:00`, and the
implementer whose six rounds follow the planner at `06:00`.

**Reasoning depth.** Three stages asked for `variant: high`, and the output cap
was `750000` tokens on the implementer and its repair. Neither changes what the
agent is asked to do; both multiply what it is charged for.

**And nothing measured it.** The only record of what the pipeline spent was the
Console's Activity page, read by a person after the allowance was gone. The
health monitor could tell that a run died; it could not tell whether it died
because the allowance had run out, which is the failure mode that repeats.

## Decision

**The schedule is set by the price, the ledger is measured per run, and the gate
only trims.**

1. **Scheduled work runs off-peak.** The planner moves to `10:15` UTC (the pg_cron
   job included) and the implementer's backstop to `12:45`, so the planner's own
   dispatch hands the implementer the long off-peak stretch (`10:00`–`01:00` UTC)
   instead of starting it inside one. The news digest moves to `23:30` UTC, still the
   small hours in Damascus. Nothing about the work changes; the same tokens count half.

2. **Default reasoning depth, same model.** `variant: high` is removed from the
   implementer, `/oc` and the news digest. That is a real saving: the variant buys
   reasoning tokens, and reasoning is billed as output.

   The output ceiling was **not** lowered. It looks like a cost control and is not
   one. The limit is applied to each request, and OpenCode already clamps a reply
   at `OUTPUT_TOKEN_MAX = 256_000` — "no reply needs more, however much the model
   allows" — so the `750000` values were inert. The only thing a lower number
   could do is cut a single long reply, which fails the run and pays for a retry;
   that costs more than the reply would have. DeepSeek V4.1 Flash stays the model
   everywhere.

3. **Every agent step records what it spent.** `scripts/agents/usage.mjs` reads
   the CLI's own report (`opencode stats --json`) on the runner and writes one row
   to `public.agent_usage`: the allowance counted, the balance charge, the token
   breakdown, and the raw payload so a shape the extractor did not recognise is
   still auditable. It also writes a line to the run summary. **It never fails a
   step**; a missing secret or CLI ends as "nothing recorded".

4. **The gate is soft.** Before an autonomous run, the same module sums the
   allowance in the last five hours, the last seven days and the last thirty days
   and answers `soft=true` at three quarters of each window ($15, $40 and $75).
   `soft` never stops the thing the owner asked for. It trims what is optional:
   - the implementer runs **one** round instead of six;
   - PR Landing **merges on green** but defers the agent repair to the next pass;
   - the news digest publishes the **shared** digest and defers the per-reader
     ones;
   - `/oc`, the Telegram bridge and the planner are never gated.

   Every caller reads a missing or failed answer as "not soft", so a broken ledger
   cannot stop work.

   **Amendment (2026-11-07).** The month is a window too, and it is the one whose
   exhaustion refuses every call outright (`GoUsageLimitError`). On 2026-11-06 the
   plan's monthly limit was hit and the implementer spent six ninety-minute rounds
   proving it, because the gate only looked at five hours and seven days. The
   thirty-day sum closes that gap; the threshold stays three quarters of the
   window ($75 of $100).

   **Amendment (2026-11-07, the clock).** The workflow's `schedule` is not the only
   trigger. The planner's primary trigger is the pg_cron job, and it was still
   03:00 UTC after the workflow moved to 10:15, so the daily run that matters was
   billed at double price. The job moves to 10:15
   (`20261115160000_dispatch_the_planner_off_peak.sql`), the implementer's backstop
   moves to 12:45 so the planner's own dispatch goes first, the health monitor's
   six-hour ticks avoid the peak windows, and the gate answers `peak` so a repair
   that would start inside one is deferred instead of paid for at double.

5. **PR Landing stops retrying what an agent cannot fix.** A provider refusal
   (429, budget, capacity, allowance) is detected before the repair starts and
   deferred, and the per-pull-request attempt budget drops from five to two. The
   sweep interval moves from 30 minutes to two hours: a stranded pull request now
   waits longer, and it can no longer cost 48 agent turns in a day.

## Why there is no second, read-only usage key

The question that prompted this ADR was whether an account-level key with
"usage read" permission should be shared with the agents. It should not, because
the documented Console API exposes **no usage-read endpoint**: its endpoints are
Inference and Providers. A scoped key can be created with a `Usage: Read`
permission, but there is nothing documented to call with it, and a workflow built
on a guessed route would fail silently the first time the route changed — the
same class of defect this ADR removes.

What _is_ documented is better for this job:

- every inference response carries `usage.opencode.allowance` (Go only), the exact
  dollars counted toward the limit, beside `cost`, `list_cost` and the token
  breakdown;
- `opencode stats --json` reports the same detail for the run on the runner;
- the Console's **Activity → Usage** and its CSV export (7/30/90 days) remain the
  owner-facing truth for the plan as a whole, including usage this ledger does not
  see (a TUI session, another machine).

So the ledger is the workflows' short-horizon signal, and the Console is the
long-horizon one. A second privileged secret buys nothing those two do not
already say.

## Consequences

- The daily automation now runs in the afternoon in Damascus (13:15/15:45) rather
  than the early morning, because the implementer's six rounds need the whole
  off-peak stretch. The digest keeps its before-morning slot.
- Under allowance pressure a day produces one implemented issue instead of six.
  That is throughput, not quality: the issue is still implemented and merged with
  the same gates.
- The ledger undercounts anything the owner runs outside these workflows. The
  gate's thresholds are deliberately below the real window limits to absorb that.
- The extractor is shape-tolerant rather than exact, because the CLI's JSON shape
  is not part of a versioned contract. `raw` keeps every payload, so a shape
  change is a one-line fix with the evidence already stored.
- The CLI packages drift meanwhile (`opencode-ai@1.18.21` in PR Landing,
  `@opencode/cli@2.1.2`/`2.1.4` elsewhere, and the GitHub action's own pin). This
  ADR does not change a version — the prompts were tuned against them — and the
  parser tolerates a CLI that has no `stats` command.
