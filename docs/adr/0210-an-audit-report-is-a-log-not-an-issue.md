# 0210. An audit report is a log, not an issue

## Status

Accepted (2026-11-21). Amends ADR-0208 decisions 2 and 9 and its first
consequence. The cadence itself is unchanged; only the shape of what is
published and how the automation is watched changes.

## Context

ADR-0208 made each of six audits publish three issues a day, one of them a dated
report. The first two days produced 36 issues: 12 reports and 24 findings, all
open, none labelled `ready-for-agent`. The reports carry real coverage evidence
— commands, captures, deferred areas — but their own `Task` says no change is
asked for. They are a ledger in the tracker's clothing.

Three concrete defects showed up in the same run:

- The publisher's numeric redaction matched `2026-11-20`, so all 36 titles ended
  in `([number redacted])` instead of a date, and migration filenames in bodies
  lost their 14-digit prefix. An identifier the reader needs was being removed
  by a rule written to remove contact details.
- Sixteen bodies cited `/tmp/audit-evidence/...` paths and none linked the run
  or the artifact, which was retained for 14 days. The evidence a finding rests
  on was unreachable to whoever was handed the finding later.
- `issue-automation-health.yml` treated `!beat` as lapsed without a clock. On
  2026-11-19 at 14:06 UTC it re-dispatched Maintainability (due 14:10) and
  Product (due 15:10) as "heartbeat lapsed", and opened #1654, before either
  workflow had reached its first scheduled tick.

## Decision

1. **Reports are dated comments on one rolling issue per domain.** The
   publisher creates `audit(<domain>): daily report log (rolling)` lazily and
   appends each report with an
   `<!-- audit:report:<domain>:<date>:<title-slug> -->` marker, one per report,
   so a day with two clean-area reports keeps both. The marker makes the append
   idempotent under a retry. Findings stay separate issues, with the
   eight-section template unchanged.
2. **The daily guard counts entries, not issues.** Today's count is finding
   issues created today plus report comments carrying today's marker. The
   deadline rule is unchanged: a day with fewer than three entries fails
   publication so the health monitor re-dispatches and fills the gap.
3. **Redaction spares identifiers.** An ISO date and a migration's 14-digit
   filename prefix are stashed before the broad number rule and restored after
   it. Email, phone, credential and token rules are unchanged. The function
   lives in `scripts/audit/github-helpers.cjs` so both the runner and its test
   load the same code.
4. **Every published entry links its provenance.** The publisher appends the
   Actions run URL and evidence artifact name to findings, report comments and
   updates. Artifact retention goes from 14 to 90 days. Bodies name captures as
   `audit-evidence/<file>`; a bare `/tmp/` path is no longer written into one.
5. **A never-run workflow gets a clock.** Each health target carries its UTC
   cron hour and minute. With no heartbeat, the workflow's introduction commit
   supplies the start time and the first scheduled tick after it supplies the
   deadline. Before that tick a workflow is not lapsed. With a heartbeat, the
   26-hour rule is unchanged. The health workflow checks out the repository so
   the shared helper it loads actually exists in its workspace.
6. **Triage is an explicit human contract.** `docs/agents/audit-triage.md`
   states who labels findings, what counts as a report, the review window and
   that no domain is ever auto-implemented. The window is a convention; no gate
   measures it.
7. **The cadence decision is deferred, with its measurement named.** `docs/agents/cost.md`
   records how to read spend by workflow and a review point after 30 days. This
   change does not reduce the number of audits, their hours or their evidence
   bar.

## Why not the alternatives

- **Delete the reports.** A quiet day is indistinguishable from dead automation;
  the entry count is what makes the dead-man's switch work. The log keeps the
  proof and removes the tracker item.
- **Move reports to Discussions.** GitHub Discussions have no label-based
  `listForRepo` count the guard can use without a new API surface, and a
  discussion is further from the finding it explains than a comment on a
  domain's own log.
- **Loosen the redaction regex by hand in each workflow.** The guard, publisher
  and health monitor are three inline scripts; one shared, tested module is the
  only way to stop them drifting again.
- **Treat "no heartbeat" as "wait forever".** That avoids the false alert but
  disables the dead-man's switch for a workflow that never starts at all.
- **Auto-label findings once the Implementer has spare capacity.** The
  Implementer has three rounds against up to eighteen entries a day; the queue
  would never drain, and a security finding would reach a pull request without
  a reader.

## Consequences

- The tracker gains up to twelve finding issues a day instead of eighteen
  issues, plus six append-only report comments.
- The guard makes one extra API call per day to list comments on the rolling
  issue, and the publisher paginates that issue's comments once per run to make
  the append idempotent.
- Tracker noise is reduced, but a report is now behind one more click. The
  rolling issue's body points at the triage contract and each comment carries a
  dated marker.
- A workflow introduced mid-day is not re-dispatched before its first tick. A
  workflow that never runs is still detected 26 hours after its first tick.
- The shared helper is the first repo module required by an inline
  `actions/github-script` step; it is CommonJS so the absolute-path `require`
  works from `GITHUB_WORKSPACE`.
- The 30-day cadence review is a human decision. Nothing here changes spend.
