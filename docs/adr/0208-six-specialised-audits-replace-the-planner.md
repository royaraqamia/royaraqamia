# 0208. Six specialised audits replace the planner

## Status

Accepted (2026-11-19).

## Context

The generic Issue Planner reviewed the whole repository once a day and filed three
findings from whatever it happened to read. That is a reasonable shape for a small tree
and a poor one for this one: a single prompt cannot hold the evidence standards of a
security review, a visual measurement, a query plan and a product decision at once, and
the week's attention lands wherever the model looked first.

Three facts forced the change:

- The repository is public. A security finding with exploit detail and a production-data
  sample cannot be published as an ordinary issue, yet the planner had only one path.
- The origin moved to Render (ADR-0174). The planner and implementer still carried Vercel
  credentials and a Vercel CLI, and treated deployments as a thing to inspect on Vercel.
- The planner chained the implementer. Six audits filing three issues each would have
  handed an unattended implementer eighteen ready-made tasks a day; a six-round
  implementer would have fallen twelve behind on the first day.

## Decision

1. **One scanner per domain, six in total.** Performance, Security, UI/UX, Scalability,
   Maintainability and Product each have a workflow, a prompt and a source label
   (`audit:<domain>`). Each scans the whole codebase in its own domain every day, on both
   clients: a web route is checked with its Android pair from `docs/mobile/parity.json`.
2. **Three issues a day, measured on the tracker.** The guard counts issues created today
   with the workflow's label, not "a run succeeded". One of the three is a dated audit
   report naming what was checked; the other two are reproduced findings or clean-area
   reports with their evidence. If fewer than three exist, a later trigger fills the gap.
   There is no day with zero issues and no day with four.
3. **No implementation, no silent handoff.** Audits have `contents: read`, never commit,
   push, open a pull request or label a finding `ready-for-agent`. A maintainer applies
   that label to the findings they want implemented. The implementer drops from six
   rounds to three and is woken by its own schedule and the health monitor only.
4. **Evidence or nothing.** Every body carries `## Evidence` (the command and its output,
   the MCP result, the capture and measurements, the `check:visual` output or the cited
   URL), plus `## Long-term fix` and `## Why not a quick fix`. A temporary patch is not a
   finding. Production is read-only: Supabase through the existing MCP, Render through
   `RENDER_API_KEY` against its API, with services discovered rather than assumed.
5. **One shared runner.** `.github/actions/audit-runner` owns setup, the guard, the
   toolchain, the pinned CLI and publication. The six workflow files only choose an hour,
   a domain and a prompt. The runner installs OpenCode **2.3.2** with the CLI installer:
   the `anomalyco/opencode/github` action directory was removed in 2.x, so the 1.x action
   pin cannot run it. Audits publish with `github-script` and need no GitHub App token.
6. **Render instead of Vercel.** The shared `opencode-runner` action gains an
   `install-vercel` input; the audits set it to `false`. No Vercel secret, CLI or
   deployment claim appears in an audit.
7. **Public by default, private where needed.** Exploitable security findings become
   private security advisories (`security-events: write`) with a redacted public
   hardening issue. Every public body is scrubbed of contact details, member content,
   tokens and credentials. Screenshots stay as evidence artifacts; raw production
   captures are not pasted into public issues.
8. **Edits are append-only.** An audit may comment on its own or another open issue with a
   dated `<!-- audit:update -->` marker when evidence goes stale, but never rewrites,
   closes, reopens or relabels one. De-duplication is semantic in the agent and an exact
   title guard in the publisher.
9. **Schedules and recovery.** Six pg_cron jobs at 10:10-15:10 UTC replace the planner's
   job; GitHub schedules are backstops; `issue-automation-health.yml` watches all seven
   agent workflows. The hours are inside the off-peak window of ADR-0133. Audit runs are
   recorded in the allowance ledger and never gated by it — a budget gate could skip a
   day, which is the one contract this decision makes absolute.

## Why not the alternatives

- **Keep one planner and add a domain argument.** The six evidence standards would still
  share one prompt and one wall clock, and a scan would be one sixth as deep.
- **Let the audits label findings `ready-for-agent`.** Eighteen autonomous tasks a day
  against a three-round implementer is a queue that never drains, and a security finding
  should never be auto-implemented.
- **Gate publication on "a run succeeded".** The planner's timeout on 2026-11-07 proved a
  successful-looking pipeline can file nothing; counting filed issues is the only guard
  that can answer a missed day.
- **Publish fewer issues on a quiet day.** A silent day is indistinguishable from a dead
  automation. A clean, measured report is honest evidence and keeps the day visible.
- **Keep the 1.x GitHub action and hope.** Its `opencode github run` wrapper does not
  exist in 2.x; the run would fail in a way no workflow change could repair.

## Consequences

- The tracker gains up to eighteen issues a day, most of them reports. A maintainer's job
  is to read the reports and choose which findings get `ready-for-agent`, not to triage a
  queue the audits filled themselves.
- Six full toolchains install each day (Chromium, JDK 21, Android SDK, Gradle cache).
  That is runner time, not model spend, and it is the price of a finding that is actually
  measured on both clients.
- Private vulnerability reporting must stay enabled for the security audit's advisory
  path; if the API refuses, the publisher falls back to a redacted public issue and logs
  the warning.
- The old `opencode:planned` label is no longer applied by any workflow.
