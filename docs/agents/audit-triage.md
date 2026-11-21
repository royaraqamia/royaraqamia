# Audit triage contract

The six specialised audits (ADR-0208) publish up to eighteen entries a day. The
Issue Implementer takes three `ready-for-agent` issues a day. Nothing between
them labels work automatically, and that gap is deliberate: an agent must not
promote its own finding into an unattended pull request, and a security finding
must never be implemented without a person reading it.

## Who decides

The repository owner (a human maintainer) decides. The audit **agent** is
told it may only name `bug`, `enhancement` or `documentation`: it never writes
`ready-for-agent` or an `opencode:*` label into its own deliverable. The
workflow's publisher then adds the workflow-owned `opencode:audit` and
`audit:<domain>` labels itself; those are provenance, not a triage decision.
The Implementer only selects issues carrying `ready-for-agent`, and the daily
guard never dispatches it from an audit. See ADR-0208 decision 3 and
[triage-labels.md](triage-labels.md).

No agent, including the Implementer itself, promotes a finding it authored.
The Implementer may leave a `ready-for-agent` issue in place when a round fails;
that is a retry of work a human already approved, not a new promotion.

## What gets a label

- **Finding** — a new issue with `## Evidence` and `confidence: high`. Read the
  evidence first. If it holds, add `ready-for-agent`; if it is stale, add a
  dated `<!-- audit:update -->` note instead. If it is a duplicate, comment on
  the canonical issue. Never close an audit finding on its behalf.
- **Report** — a dated comment on the domain's `audit(<domain>): daily report
log (rolling)` issue. It is a coverage and rotation record, not work. Do not
  label the rolling issue or file a task from it.
- **Confidential security finding** — read the private advisory, not just the
  redacted public issue. Decide reachability and severity yourself before any
  label is applied (ADR-0207).

## Window

Review the previous UTC day's entries before the next day's audits land. That
is a working convention, not an enforced gate: no workflow measures triage
latency, and a silent day is the one thing ADR-0208 refuses to allow. If the
window is missed, the entries stay open and unlabelled — they do not expire and
they are not auto-promoted.

With three Implementer rounds against up to eighteen published entries a day,
a backlog is expected. The backlog is a signal to review the cadence, not a
reason to auto-label.

## Which domains are never auto-implemented

None are. Every domain — performance, security, ui-ux, scalability,
maintainability and product — is human-gated. Security is additionally gated by
the private-advisory path: an exploitable finding is never filed publicly with
its exploit detail, so it cannot be acted on from the public issue alone.

## Evidence after publication

Every published entry links its Actions run and evidence artifact, retained for
90 days. A body that cites a bare `/tmp/audit-evidence/...` path predates this
contract; the run link is the way to find the capture. Reports and findings are
append-only: the publisher never rewrites a body it created.
