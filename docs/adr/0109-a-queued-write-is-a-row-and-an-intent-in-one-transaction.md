# A queued write is a row and an intent in one transaction

> **Status:** accepted (2026-11-01, #650). Shapes the app's Local Store; the web's
> Outbox is unchanged, and the two now share one fixture instead of one opinion.

Once the app can write, three failure modes stop being theoretical, and each is a
decision rather than a bug:

1. **A write that is painted but not durable.** The screen shows the row, the
   process dies in the next millisecond, and the queue never heard about it. The
   user's tap is gone and nothing said so.
2. **A write that replays as somebody else.** The queue is rows, a sign-out swaps
   the partition, and a replay that resolves its store per intent can remove the
   same `seq` from the next identity's file.
3. **A pull that silently discards a write.** The server's snapshot arrives while
   an edit is still queued, and a blind upsert replaces the row the user is
   looking at with the server's older copy.

## The decision

**The row and the intent commit together.** `HabitDao.commitHabit` and
`commitLog` write the entity and its `OutboxIntentRow` in one Room transaction, so
either both persist or neither does. "Durable before it is acknowledged" (the
offline-first spec's second property) is this transaction, not the request that
follows it.

**The queue is rows in the identity's own database.** The Outbox is a table in
`habitflow__guest.db` or `habitflow__user:<id>.db`, not a file of its own, so the
partition that decides whose rows these are decides whose writes these are. A
drain resolves its DAO **once**, for the identity it started under, and stops if
that identity changes mid-run — resolving it per intent is the failure in (2)
above. A sign-out closes the connection and keeps the rows; the intent is drained
when that identity is next signed in, and by no one else.

**The replay rules are one fixture, run by both engines.** Ordering, backoff, the
permanent/transient split, what counts as drained, which request an intent
becomes, and who wins a conflict are written down in
`shared/fixtures/offline-writes/habitflow.json`, and both the web's `SyncEngine`
and the app's `OutboxDrainer` are held to it by their own suites. The rules are
not restated in this ADR on purpose: a rule written twice drifts, and a drift here
loses a write rather than a label.

**A pull is pending-aware.** `conflictWinner` — the same rule on both sides —
keeps a row whose write is still queued, and otherwise lets the server replace the
local copy only when its `updatedAt` is _strictly_ newer. Ties go to the device, so
a pull cannot undo an edit made in the same millisecond.

## What this does not decide

- **Delivery with the app closed.** A drain triggered by the radio returning or by
  the next launch is this ADR; a WorkManager job that wakes a killed process is
  #651.
- **The add and delete controls.** The store and the queue support create, update,
  toggle and delete, and the fixtures cover all four requests. The screen exposes
  the toggle; the add form and the delete affordance are the next control slice,
  and the site's own words for them are not invented here.
- **A claim on sign-in.** A guest's queue waits for a sign-in rather than being
  sent as nobody; moving the guest's rows and intents into the account namespace is
  still owed from ADR-0107.

## Consequences

The app holds a queue it did not have, so the pill grows the two states the web
already draws — pending and failed-with-retry — and the "failed" one is a button,
because a refusal a user cannot act on is a dead end. The database moves to
version 2 with a migration that only adds the table (`android/app/schemas/`), and
the migration is tested against the exported version 1 shape.

The drill is the acceptance criterion a JVM test cannot reach: `npm run
android:outbox-drill` builds the APK, cuts the radio, queues a write, force-stops
the process, restores the radio, and reads the row back from the server's own
snapshot inside the five-second budget. The device half is a debug-only activity,
so a release APK carries no way to seed a write.
