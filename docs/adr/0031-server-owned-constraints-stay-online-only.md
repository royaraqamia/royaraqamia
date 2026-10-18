# Server-owned constraints stay online-only

Offline-first has a boundary: some operations are only meaningful against a live server. We decided
that the **Media Downloader** (needs an external provider), **rate refresh** (needs live feeds),
**MCP**, all **Admin** operations, **sign-in/sign-up** (Turnstile + OTP) and **Web Push** remain
online-only, each with an explicit "needs connection" state rather than a silent failure. (What
"rate refresh" means here — the server's refresh, not a control on the rates board — is settled by
the [2026-10-18 amendment](#amendment-2026-10-18-the-board-has-no-refresh-control).)

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

## Amendment (2026-10-18): the board has no refresh control

The decision above names **rate refresh** among the online-only surfaces, and a `RatesRefresh` button
once carried that "needs connection" state in the rates header. It was dropped from
`app/rates/page.tsx` on 2026-10-11 and left behind as dead code — imported nowhere, with only its own
unit test for company — and #333 resolved that by deleting it rather than wiring it back.

The reason is this ADR's own rejected option: the client cannot fetch the external feeds, so a control
in the header could only re-render the Rate Snapshot the server already holds. `router.refresh()` does
not bypass the `unstable_cache` entry in `backend/loaders/rates.ts`, so for up to an hour the button
returned a byte-identical board with no acknowledgement of the press — the silent failure this ADR
exists to remove, wearing a control.

**Refreshing stays server-owned.** The authorized refresh route (the cron's entry point) and
`loadRatesBoard`'s refresh-on-read once the snapshot passes three hours, both bounded by the one-hour
cache, are the only things that move the board. The page reports the snapshot instead of offering to
fetch it: the provider quote date, and the «قد تكون البيانات متأخِّرة» badge when the snapshot is past
the staleness bound (ADR-0011).

**The offline state stays explicit, and stays shared.** Rates renders read-only behind the site-wide
`ConnectivityIndicator`, which announces «غير متَّصل» and how old the cached copy is (ADR-0027), so
nothing fails silently. `e2e/public-offline.spec.ts` holds the absence of a refresh control as the
design, not as an accident.
