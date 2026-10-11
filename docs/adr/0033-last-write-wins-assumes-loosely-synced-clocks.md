# Last-write-wins assumes loosely-synced clocks; future skew is clamped at the boundary

Offline replay resolves conflicts by **last-write-wins on the client-supplied
`updated_at`** (ADR-0029). There is no CRDT and no server-issued logical clock, so
the winner is decided by comparing wall-clock timestamps minted on the devices.

That is sound only if those clocks are loosely in step. Two skew modes, with very
different blast radius:

- **A clock behind.** The device's write carries a timestamp earlier than it
  really happened, so it can lose a conflict a correct clock would have won. The
  data is arguably wrong, but the row is not poisoned and a later write fixes it.
- **A clock ahead.** The device stamps a write in the future and then wins _every_
  subsequent conflict against correctly-clocked devices, forever — the row is
  effectively pinned. This is the dangerous mode.

We bound the dangerous mode at the data boundary: a `BEFORE INSERT OR UPDATE`
trigger clamps a logical `updated_at` more than a short tolerance (5 minutes)
ahead of server `now()` down to `now()`. A past-skewed clock is left alone — the
failure is then just "this edit lost", which is visible and recoverable, not a
permanent pin. The same trigger already maintains `server_updated_at`, the
monotonic watermark the sync cursor pages on, so nothing new is added for
SpendTrack (the only product carrying the watermark triggers today).

## Considered options

- **Do nothing.** Rejected: one broken clock can permanently wedge a row and no
  other device can correct it.
- **Clamp both directions.** Rejected: clamping the past to `now()` collapses LWW
  to "last arrival wins", discarding the ordering it exists to provide.
- **Hybrid logical clock (HLC).** The correct general answer — an event time
  that never runs backward and stays close to wall time, with the server supplying
  the upper bound. Deferred: it changes every client id/timestamp mint site and
  the wire format. Revisit if multi-device writes become common; the 5-minute
  clamp is the interim bound.
- **Server-assigned `updated_at`.** Rejected: it removes the device's ability to
  order an offline edit without the server, which is the point of local-first.

## Consequences

`updated_at` stays the client's logical time (LWW key); `server_updated_at` stays
the server's monotonic watermark (sync cursor). The clamp is applied by the
existing SpendTrack trigger; other offline products (HabitFlow, LinkSnap) do not
yet carry it and should adopt the same guard when they gain watermark triggers.
