# 0135 — A digest is a receipt per item, not a window per run

Date: 2026-11-06

## Context

The Telegram digest for the Issue Planner and the Issue Implementer was built
from a fixed twenty-four-hour window: issues _created_ in the last day for the
planner, pull requests _merged_ in the last day for the implementer. It was
triggered on every completed Planner/Implementer run, plus a half-hourly
`pg_cron` tick that ran `catchUpDigests()`.

The only receipt was `telegram_digests`, one row per workflow **run**. It
prevented the same run being summarised twice, and it did that correctly. It did
nothing about the same _item_ appearing in two different digests, and that is
what the owner read: the same seventeen lines several times a day, because every
run re-read the same window. Each message also carried the run counts, the
latest run, and a link to the run log — all of which say nothing about what
changed.

## Decision

**The window is replaced by a receipt per item, and the message shrinks to the
heading and the lines the owner has not read.**

1. **`telegram_digest_items`** holds one row per `(kind, number)` with the state
   that was reported: `created` for an issue, `merged`, `closed` or `open` for a
   pull request. A digest renders only the `(item, state)` pairs the table does
   not hold, sends, then writes the receipts. A failed send writes nothing, so
   the next tick retries the same lines instead of losing them.

2. **Nothing new sends nothing.** A «لا جديد» line is the noise the change
   exists to remove. Liveness is not this job's responsibility: the short «تم»
   acknowledgements and the ⚠️ alert path already prove the bridge is awake.

3. **An open pull request is reported once, and only after thirty minutes.**
   A pull that is still open in its first half hour is being worked on; a run
   that opens and merges in four minutes made one change, not two. Past the
   grace it is stuck on CI, a review or a conflict, which is worth a line. The
   same pull is reported again when it merges, because the state changed.

4. **Every merge, whoever merged it.** Filtering by author would hide the
   owner's own work from the owner's own digest.

5. **Event-driven, not a fixed hour.** The digest is no longer a window, so
   frequency stops mattering: one after each completed run plus the existing
   catch-up tick, and a busy day gives several short messages that never repeat
   a line. Collapsing to a fixed hour would delay a merge without reducing
   volume, because the volume is items now, not messages.

6. **The one-time seed is silent.** Everything visible at the moment this
   shipped is written as already reported, keyed by a `telegram_state` row
   (`digest_items_seeded`) rather than "the receipts table is empty" — a quiet
   repository has no receipts to notice, and reading emptiness as "never
   seeded" would swallow the first item that ever arrived.

7. **The status lines and the run-log link are gone.** Heading, count, bullets,
   nothing else. The run link survives in the ⚠️ alert for Release Health and
   Migration Drift, which this does not touch.

## Consequences

- **A failed Planner or Implementer run now sends no digest at all**, because
  the digest no longer reads runs. If the owner wants those, they belong in the
  ⚠️ alert path as a separate, small change.
- The digest queries `state=all` for pull requests instead of `state=closed`;
  one request either way.
- The twelve-item cap and «… وN أخرى» are removed. `sendMarkdown` already splits
  long output, and a truncated line is a line that would never be reported.
- An issue whose title is edited after it was reported is not re-sent. The
  receipt is the item, not its text.
- `telegram_digests` stays: it is still what keeps `catchUpDigests()` from
  re-reading the same run every half hour, including runs that found nothing
  new.
