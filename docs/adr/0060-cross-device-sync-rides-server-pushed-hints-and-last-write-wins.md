# Cross-device sync rides server-pushed hints and last-write-wins

Owned data is single-owner (ADR-0028), so the only cross-device question is _latency_: how soon
device B learns that device A wrote. We answer it with a **hint**, not a payload and not a merge. The
server pushes a signal — Supabase Realtime `postgres_changes` while the app is foregrounded, the FCM
data message of ADR-0059 while it is backgrounded — and on the hint the device **pulls** and
reconciles with last-write-wins on `updated_at` (ADR-0029). The Outbox stays the only writer; a hint
can only cause a pull, so a hint that arrives at the wrong moment costs a wasted request and can never
corrupt state.

## Considered Options

- **A CRDT per record.** Rejected: single-owner, near-single-device data does not justify the storage
  and reasoning cost, and it would be a second merge rule beside the LWW the Outbox already uses.
- **Server-authoritative with version choreography (`etag`/`If-Match`).** Rejected: the device is
  authoritative for its own records, so version negotiation buys conflict handling for a conflict that
  mostly cannot happen.
- **No hints; pull on focus, as today.** Rejected: it is the latency being removed, and it is visible
  whenever two devices are open at once.
- **Realtime carrying the changed rows as the payload.** Rejected: it would make the subscription a
  second writer and skip the idempotent upsert path the contract is built on.

## Consequences

While foregrounded, each account surface holds a live subscription with its own reconnect logic, and
the subscription's payload is ignored beyond "something changed". Owned tables must be in the
`supabase_realtime` publication, which is a migration and a per-environment setting. The pull on a
hint is the same code path as the pull on focus, so there is no second reconciliation to reason about.
