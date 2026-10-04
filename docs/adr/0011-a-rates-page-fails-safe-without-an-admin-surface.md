# A rates page fails safe without an admin surface

A public rates page has one dominant failure mode: silently serving stale numbers as if they
were current, which is a correctness bug, not an outage. We decided the page must fail safe and
be observable, and that we will **not** build an Admin Console surface for it in v1. Every
**Rate Sync Run** is recorded (outcome, provider quote date, counts) so "when did the feed last
succeed" is answerable without a UI; the public page always shows the quote date and warns when
it is too old; failures go to Sentry (already wired) and repeated failures notify an operator; a
health endpoint exposes the last successful quote date to external uptime monitoring. A failed
run never overwrites the last good **Rate Snapshot** — the page keeps serving it, visibly aged.

## Considered options

- **Log-only.** Rejected: logs nobody reads do not surface a silently stale page.
- **An Admin Console sync-health panel.** Rejected for v1: it duplicates what the
  `rate_sync_runs` record and the health endpoint already expose, and puts the safety net in a
  place only an Admin visit will find. Revisit if the feed proves flaky.
- **Fail the page when the feed is down.** Rejected: a slightly stale rate beats no rate; showing
  the age is more useful than showing nothing.

## Consequences

Trust is treated as the product: correctness on stale data is prioritised over feature breadth.
The `rate_sync_runs` table is the single source of truth for feed health, so any future admin
view or alert is a read of existing data, never a new pipeline.
