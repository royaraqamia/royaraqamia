# 0209 — The Telegram bot stops reporting on workflows

Date: 2026-11-19

## Context

The bot had two ways to send a message because another workflow ran. The `digest`
job reacted to the six specialised audits and Issue Implementer, listing new
issues and pull requests; the `alerts` job reacted to a red Release Health or
Migration Drift check. A `pg_cron` tick also dispatched the bridge twice an hour
so a digest could catch a run the `workflow_run` event missed, and two manual
dispatch modes could replay either set on demand. ADR 0135 made the digest a
receipt per item, which fixed duplicate lines but not the underlying complaint:
the owner did not want a running commentary from other workflows in the chat.

## Decision

**No workflow, cron job or manual mode can make the bot send a message about
another workflow.**

1. `.github/workflows/telegram.yml` loses the `workflow_run` trigger, the
   `digest` and `alerts` jobs, and the `digest-audits` / `digest-implementer`
   dispatch modes. The bridge job no longer has to exclude `workflow_run`.
2. `scripts/telegram/jobs.mjs` loses `digest`, `catchUpDigests`, `alerts`, their
   issue/pull collectors, their receipt helpers and the digest/alert text
   formatters; `scripts/telegram-bridge.mjs` loses the matching modes and
   exports. `drain` no longer performs a digest catch-up before answering.
3. A new migration unschedules `telegram-bridge-digest-tick`, drops
   `telegram_digests` and `telegram_digest_items`, and deletes the
   `digest_items_seeded` state row. It is destructive DDL, so the apply gate in
   `docs/supabase.md` leaves it to a person rather than applying it unattended.
4. ADR 0135 and the digest reference in ADR 0204 are kept as history; this
   decision supersedes the design they describe, not the record of it.
5. The news digest is a separate product for readers and is untouched. So is
   the conversational bot: messages, reminders, memory distillation and the
   two-tap merge are all still there.

## Consequences

- A completed audit, Implementer run or red check produces no Telegram message.
  Those results are read on GitHub, not in the chat.
- Dispatching a removed mode now fails with `Unknown mode`; the chat keeps no
  path that can send a digest or an alert.
- Dropping the two receipt tables destroys the per-run and per-item records.
  Nothing reads them once the jobs are gone.
- The owner can still ask the bot in a message what a workflow did. That is an
  ordinary answer from a turn with repository access, not an unsolicited report.
