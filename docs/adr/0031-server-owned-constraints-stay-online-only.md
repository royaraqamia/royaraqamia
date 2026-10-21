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

## Amendment (2026-10-20): the state lives where the action is attempted

[#368](https://github.com/royaraqamia/royaraqamia/issues/368) applied this ADR to auth, admin and MCP
surface by surface, and settled the rule the wording left open: **a surface shows its own state
wherever a user can attempt a server action from a document already on screen. The `/offline`
document answers a document request that cannot be served at all — it is not the state of a page that
is already open.**

The distinction matters because the worker can only speak for documents. Once a page is running, a
failed request is the page's own event, and handing that failure to a navigation fallback is neither
possible nor honest.

| Surface                                                                                 | Decision                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth/**`                                                                              | **In-form state.** Login, sign-up, OTP, reset and update each render the shared `NeedsConnection` inline when the submit never reached the server, because the message the transport writes («تعذّر الاتصال…») is otherwise shown in the same red banner as a wrong password. The auth documents stay never-cached, so a cold offline request still gets `/offline`. *(That                                           |
| became "the shells ride the SWR cache" on 2026-10-21, #447 — see the amendment below.)* |
| `/admin/**`                                                                             | **`/offline` for the document; in-page state for the reads.** The console's guard (`identity.resolveAdmin`) answers on the server, so a cached admin document could not authorize itself and must not be served. Inside a live page, the user picker, the certificate list and the certificate editor now name a failed read and offer its retry instead of showing an empty picker, an empty table or an empty form. |
| `/mcp/connect`                                                                          | **In-page state.** The approve/deny pair is a server POST that mints the authorization code; offline it is replaced by `NeedsConnection` rather than submitting into a browser error page.                                                                                                                                                                                                                            |
| `/mcp/guide`                                                                            | **`/offline` for the document.** The page is static instructions with no server action and nothing to lose, so there is no in-page state to show. It stays inside the `/mcp` never-cache prefix, which exists for the consent route.                                                                                                                                                                                  |
| `/account/connected-apps`                                                               | **In-page state.** A failed read caused by an unreachable server renders `NeedsConnection` with the retry; a server-answered failure keeps the ordinary error card, since those are different statements.                                                                                                                                                                                                             |

The shared presentation is still `frontend/ui/shared/needs-connection.tsx`, which grew an `inline`
variant for the form and picker cases; the title and vocabulary do not change between variants.

## Amendment (2026-10-21, #447): the auth shells ride the cache; the actions stay online-only

The row above said the auth documents stay never-cached so a cold offline request gets `/offline`.
Phase 0 of the offline-first roadmap reverses exactly that half: the auth _documents_ are static
client pages — nothing account-bearing is rendered into them, and the sign-in state machine is all
client-side — so `/auth` left the worker's never-cache list and its shells now ride the same
stale-while-revalidate cache as the public content. An offline reload of `/auth/login` paints the
form instead of the offline page. The install-time shell precache picks them up with every other
prerendered public shell (ADR-0071), and sign-out keeps them like it keeps those.

What has not moved is the boundary this ADR is named for. Sign-in, sign-up, OTP, reset, password
update and the Google handoff are server actions — Turnstile and Supabase cannot be answered from a
cache — so the forms keep their inline `NeedsConnection` state when the submit never reached the
server. The auth APIs keep their never-cache prefixes (`/auth/api`, and `/auth/callback` for the
OAuth code exchange), so a session read never lands in shared Cache Storage. "Server-owned
constraints stay online-only" narrowed to the network call; the page that shows the call no longer
has to be unreachable to get there.
