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
- **Chained:** the implementer is woken by `workflow_run` the moment the planner completes, so it
  always sees that day's fresh issues — no offset to race.
- **Backstops:** the original `schedule` triggers stay, needing no configuration, for when the
  external dispatcher or its secret is unavailable.
- **Catch-up:** `issue-automation-health.yml` checks the age of each workflow's last success,
  re-dispatches any that lapsed (using the default `GITHUB_TOKEN`), and opens or closes a single
  `opencode:alert` issue.
- **Idempotency:** an 18-hour `Daily guard` on each workflow means only the first successful run in
  a window does work, so the redundant triggers never double-file issues or implement a second
  issue in a day. `workflow_dispatch` accepts `force: true` to override the guard.

## Considered options

- **Keep only the daily `schedule`.** Rejected: it is the source of the problem — late and
  occasionally dropped, with no self-detection.
- **Widen the planner→implementer offset.** Rejected: still races whenever the planner slips, and
  wastes a full day's latency instead of fixing the ordering.
- **React to the `issues: [labeled]` event.** Rejected for the reason in ADR 0026: GitHub does not
  run workflows in response to events caused by the default `GITHUB_TOKEN`. `workflow_dispatch` and
  `workflow_run` are exempt from that rule, which is what makes chaining and re-dispatch work.
- **One external trigger, no guards.** Rejected: any overlap between the external dispatch and the
  scheduled backstop would double-run the pipeline.
- **A token in an env var instead of the Vault.** Rejected: the trigger runs in the database, and
  the Vault is already where `push_webhook_token` lives.

## Consequences

A day is now started by one punctual external call which chains the rest, so the pipeline no longer
depends on GitHub's schedule being on time; a missed day is re-dispatched and surfaced as an issue.
Redundant triggers are cheap and safe (free minutes and models on a public repo, de-duped by the
guard). The dispatch token is privileged: when scoped to this repository's `Actions: write` its
blast radius is bounded to starting workflows, but the deployment currently reuses the repo
automation token rather than a dedicated one, so a Vault compromise equals that token's scope —
documented, with a rotation runbook, in `docs/security.md`. If the Vault secret is never
provisioned the pipeline degrades to the old schedule-plus-monitor behaviour rather than breaking.
