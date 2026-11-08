# Scheduled agent automation is externally triggered and idempotent

The **Issue Planner** and **Issue Implementer** (ADR 0026) both hung off GitHub's `schedule`
trigger, with a fixed three-hour gap between them. In practice that trigger proved unreliable:
GitHub's scheduler delivered runs one to six hours late and, on a bad day, not at all, so the
pipeline could silently miss its window — and because the implementer ran on a fixed clock offset,
it could fire _before_ the planner whose output it depends on. We now drive the pipeline from four
layered triggers plus a day-guard:

- **Primary, punctual:** Supabase pg_cron calls the GitHub Actions dispatch API via
  `public.dispatch_github_workflow` (a SECURITY DEFINER function reading a fine-grained PAT from
  the Vault, ideally dedicated to this repository and scoped to `Actions: write`), firing the
  planner at 03:00 UTC to the minute.
- **Chained:** when the planner finishes it dispatches the implementer through the Actions
  dispatch API, so the implementer always sees that day's fresh issues — no offset to race.
  (Not `workflow_run`: opencode's GitHub runner accepts only a fixed set of event types and
  rejects `workflow_run` outright — the bug that previously broke this link.)
- **Backstops:** the original `schedule` triggers stay, needing no configuration, for when the
  external dispatcher or its secret is unavailable.
- **Catch-up:** `issue-automation-health.yml` every six hours checks the age of each workflow's
  last success, re-dispatches any that lapsed (using the default `GITHUB_TOKEN`), confirms the
  dispatch actually started a run, and opens or closes a single `opencode:alert` issue. The
  confirmation matters because a dispatch is fire-and-forget: the API answers `204` even when it
  starts nothing, which is how the 2026-10-19/20 misses stayed invisible until the 26-hour check.
- **Idempotency:** a calendar-day `Daily guard` on each workflow means only the first successful run
  on a given UTC day does work, so the redundant triggers never double-file issues or implement a
  second issue in a day. Keying on the calendar day rather than a rolling window is deliberate: a
  backstop that lands hours late could otherwise push the next day's punctual run inside a shrinking
  window and silently suppress it. `workflow_dispatch` accepts `force: true` to override the guard.

## Considered options

- **Keep only the daily `schedule`.** Rejected: it is the source of the problem — late and
  occasionally dropped, with no self-detection.
- **Widen the planner→implementer offset.** Rejected: still races whenever the planner slips, and
  wastes a full day's latency instead of fixing the ordering.
- **React to the `issues: [labeled]` event.** Rejected for the reason in ADR 0026: GitHub does not
  run workflows in response to events caused by the default `GITHUB_TOKEN`. `workflow_dispatch` —
  called directly through the dispatch API, as both the planner chain and the health catch-up do —
  is exempt from that rule, which is what makes chaining and re-dispatch work.
- **One external trigger, no guards.** Rejected: any overlap between the external dispatch and the
  scheduled backstop would double-run the pipeline.
- **A token in an env var instead of the Vault.** Rejected: the trigger runs in the database, and
  the Vault is already where `push_webhook_token` lives.

## Consequences

A day is now started by one punctual external call which chains the rest, so the pipeline no longer
depends on GitHub's schedule being on time; a missed day is re-dispatched within six hours, and if
the re-dispatch is itself dropped the issue says so instead of reporting a recovery that never
happened.
Redundant triggers are cheap and safe (free minutes and models on a public repo, de-duped by the
guard). The dispatch token is privileged: when scoped to this repository's `Actions: write` its
blast radius is bounded to starting workflows, but the deployment currently reuses the repo
automation token rather than a dedicated one, so a Vault compromise equals that token's scope —
documented, with a rotation runbook, in `docs/security.md`. If the Vault secret is never
provisioned the pipeline degrades to the old schedule-plus-monitor behaviour rather than breaking.

## Amendment (2026-11-05): a failed run is re-dispatched, not just a lapsed one

The catch-up above keys on the age of the last **success**, which answers a schedule that never
fired and misses the one that fired and died. A planner run that ends `failure` leaves the last
success recent, so nothing re-dispatches it until 26 hours have passed — and the failure it most
often meets is transient: `[prefill_cap_refused] the cell is at capacity`, an upstream 429 the
agent's own five attempts at five-second intervals cannot outlast, on a job that then takes six
minutes to reach the same point again. One refusal therefore cost a whole day of planning
(2026-11-05, Issue Planner run 41958766207).

So `issue-automation-health.yml` now also re-dispatches a target whose most recent completed run
concluded `failure` or `timed_out`, whether or not its heartbeat has lapsed, and skips a target
that already has a run queued or in flight. That retry is deliberately quiet — it is logged, not
filed as an issue — because the schedule is on time and a single retry is not evidence of
degradation; the `opencode:alert` issue still means the heartbeat lapsed, which is what a retry
that keeps failing turns into within a day. The bound is the check's own cadence: at most four
retries a day per workflow, each of which that workflow's `Daily guard` makes cheap to answer.

## Amendment (2026-11-08): a merged pull request is a heartbeat, not just a green run

The heartbeat above is a run with `conclusion: success`, and for the implementer that is the wrong
witness. Its six rounds run as one matrix, so a single round that times out marks the whole run
`failure` after the other five merged — run 42471280585 on 2026-11-08 landed five pull requests and
still concluded `failure`. Worse, a run can leave the record altogether: the successful runs from
2026-11-03 to 2026-11-08 had been deleted by hand by the time the alert was read, so the newest
`success` the API could return was 2026-11-03 while thirty-three agent pull requests had merged
since. The alert said five days dead about a pipeline that was merging hourly.

The consequence was not only a false alarm. `lapsed` being permanently true also made the recovery
path unreachable: every re-dispatch it confirmed (41974018828, 42128797928, 42228638128, 42436752576) was a run that never executed and no longer exists, so the check reported catch-ups that
had done nothing.

So a heartbeat is now the newer of the last successful run and — for a target that lands work — the
last pull request its agent merged (`opencode-agent[bot]`, label `opencode`, read from
`pulls.list` rather than the search index, which lags a merge by minutes). A merge can only raise the
heartbeat, never lower it, and it cannot be deleted out of the record the way a run can. The alert
body now names which of the two it read, so a lapse can still be diagnosed from the issue alone.
