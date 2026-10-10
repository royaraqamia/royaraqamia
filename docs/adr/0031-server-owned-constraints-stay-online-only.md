# Server-owned constraints stay online-only

Offline-first has a boundary: some operations are only meaningful against a live server. We decided
that the **Media Downloader** (needs an external provider), **rate refresh** (needs live feeds),
**MCP**, all **Admin** operations, **sign-in/sign-up** (Turnstile + OTP) and **Web Push** remain
online-only, each with an explicit "needs connection" state rather than a silent failure.

The sharpest case is **Consultation Booking**: it reserves scarce Availability Slots and needs a
live conflict check, so an offline booking could silently collide. It therefore stays online-only,
even though the non-inventory lead forms — Training Application, Project Request, Retainer inquiry —
do queue offline, because a queued lead loses nothing an operator cannot reconcile.

## Considered Options

- **Queue Consultation Bookings offline.** Rejected: two devices can queue the same slot, and the
  loser only finds out after the fact — an inventory bug disguised as a feature.
- **Cache rates as owned data and let the client refresh.** Rejected: the client cannot fetch the
  external feeds; it may only _display_ the last snapshot read-only.
- **Queue auth/OTP offline.** Rejected: Turnstile and OTP are inherently server-side.

## Consequences

The boundary is documented so a future reader does not "fix" these into offline support. Each
online-only surface gets a distinct, legible offline state; the sync-status UI (ADR-0027) is shared
across them. Reading cached last-known values (e.g. the last Rate Snapshot) is still allowed — it is
_writing_ and _refreshing_ that remain online-only.
