# Offline surfaces audit

Phase 4 of the offline plan ([`docs/specs/offline-first.md`](specs/offline-first.md)): every route
checked against the spec's scope table, and every surface
[`ADR-0031`](adr/0031-server-owned-constraints-stay-online-only.md) keeps online-only checked for the
"explicit needs-connection state" it promises.

**It produces a gap list, not a rewrite.** What landed with this change is listed as closed, what needs
a decision is filed as an issue, and what is mechanical is recorded below with the file that shows it.

Recorded 2026-10-19 against `main` at `4d93e0cb`.

## Method

Each route's client path was read rather than its intent:

1. **Every page** — `app/**/page.tsx` (60 routes), checked for a Local Store read, an Outbox write, or a
   server-only load.
2. **What the service worker can serve** — the never-cache list and the navigation fallback
   (`public/sw-routing.js`, `public/sw.js`), so "offline" for a route is either a cached document or the
   `/offline` document.
3. **What the user is told** — the site-wide `ConnectivityIndicator` (`frontend/ui/shared/connectivity-indicator.tsx`,
   offline only), the per-product `SyncStatusPill` (`sync-status-pill.tsx`), and every per-surface
   offline string in the tree.
4. **Route handlers were not audited** (128 `route.ts` files). This is about what a page does when the
   server is unreachable, not about the API's own behaviour.

## The spec's scope table, checked

| Surface                                                    | Verdict                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public content — Community, Rates, Certificates, Showcase  | **Holds.** `/rates` renders the last snapshot with the staleness badge (`app/rates/page.tsx:94`); `/scan` and `/quran` are `force-static`; cached documents serve offline.                                          |
| Scanner                                                    | **Holds.** A certificate lookup that cannot resolve degrades to a link rather than an error.                                                                                                                        |
| Account tools — HabitFlow, SpendTrack, LinkSnap, BlogPress | **Holds**, with the exception the spec records: BlogPress's list/calendar are server reads behind a publish gate (LinkSnap joined the background drain in #385).                                                    |
| Non-inventory leads — Training, Project Request, Retainer  | **Holds.** All three render `LeadQueuedPanel` when a lead is waiting and the pill for the count.                                                                                                                    |
| Consultation Booking                                       | **Did not hold.** Booking was refused offline with a banner, but the availability read had no failure state: a request that never reached the server rendered as "no appointments are open". Closed in this change. |
| Auth, Push, Media Downloader, Rates refresh, MCP, Admin    | **Partly.** Three of the six needed work; see the next table.                                                                                                                                                       |

Two route-level reads outside the table also fail silently today (Community's "load more" and search).
They are reads of cached public content rather than offline-capable surfaces, so they are recorded
below rather than closed here.

## ADR-0031 surfaces, one by one

| Surface              | Route(s)                                                | State before this change                                                                                  | Outcome                                                                  |
| -------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Media Downloader     | `/downloader`                                           | The link inspection's failure message was never rendered (dead state) and the submit stayed live offline. | **Closed here.**                                                         |
| Consultation Booking | `/consultation/book`                                    | A failed availability or package read rendered the "none available" empty state.                          | **Closed here.**                                                         |
| Web Push             | `PushNotificationToggle` (account UI)                   | An unreachable server was reported as a browser permission denial.                                        | **Closed here.**                                                         |
| Rate refresh         | `/rates`                                                | Read-only board, staleness badge, no refresh control by design.                                           | **Holds** (ADR-0031 amendment, 2026-10-18).                              |
| MCP                  | `/mcp/guide`, `/mcp/connect`, `/account/connected-apps` | The `/offline` document for a document request; a load-error card on connected-apps.                      | **Filed** [#368](https://github.com/royaraqamia/royaraqamia/issues/368). |
| Admin                | `/admin/**` (18 routes)                                 | The `/offline` document; no in-page state, and reads that swallow their failure.                          | **Filed** [#368](https://github.com/royaraqamia/royaraqamia/issues/368). |
| Auth                 | `/auth/**` (6 routes)                                   | The `/offline` document; no in-form state.                                                                | **Filed** [#368](https://github.com/royaraqamia/royaraqamia/issues/368). |

The `/offline` document is not a silent failure — it tells the user — but it is not the surface's own
state, and it cannot cover an action attempted from a page that is already open. #368 is where that is
decided per surface.

## Closed in this change

1. **Consultation Booking: a failed read is no longer an empty calendar.**
   `use-booking-flow.ts` grew `slotsError`/`packagesError` and a retry for each, and the two steps render
   them (`slot-step.tsx`, `package-step.tsx`) instead of their "no appointments" / "no packages" empty
   states. When a list is already loaded and the _refresh_ fails, the list stays usable with a line
   saying it may be out of date — the booking's own submit path runs a live conflict check, so nothing
   is lost by keeping it.
2. **Media Downloader: the inspection's failure is rendered, and offline names the connection.**
   The message existed and nothing drew it (`probe.status === 'unknown'` was excluded from
   `probeRefusal`); it now renders, and while the browser is offline the page says the download needs a
   connection and disables the submit. The inspection's copy blames the link, which is the wrong cause
   when there is no radio.
3. **Web Push: an unreachable server is not a permission denial.**
   `subscribeToPush()` returns `unreachable` for a failed registration instead of `denied`, and the
   toggle shows a connection message with the toggle itself as the retry. `denied` is now only ever the
   browser's own refusal.

The three share one presentation: `frontend/ui/shared/needs-connection.tsx` (title, the surface's own
message, an optional retry), so the next surface has one component to reach for instead of a fourth
private spelling of the same state.

## Open gaps

### Filed

- **[#370](https://github.com/royaraqamia/royaraqamia/issues/370)** — closed by `/device` (ADR-0070): the
  queue is inspectable per item, retryable, and "Remove this device's copy" deletes the account namespace
  and reports what it took.
- **[#368](https://github.com/royaraqamia/royaraqamia/issues/368)** — in-page needs-connection states for
  auth, admin and MCP, and the admin reads that swallow their failures.
- **[#369](https://github.com/royaraqamia/royaraqamia/issues/369)** — a failed pull leaves the sync pill
  silent; the pill tracks the Outbox and a stale read looks fresh.

### Recorded, mechanical

Each is a fix in the file named rather than a decision, so none of them needs an issue of its own:

- Community "load more" swallows its failure — the button appears to do nothing
  (`app/community/_components/community-index-results.tsx:112`).
- Community search swallows its failure — offline reads as «لا توجد نتائج»
  (`app/community/_components/community-search.tsx:68`).
- Admin user lookup swallows its failure — an empty picker rather than a failed one
  (`frontend/ui/admin/user-select.tsx:60`; also under #368).
- Admin certificate edit swallows its failure — the page loads into an empty form
  (`app/admin/certificates/[id]/edit/page.tsx:26`).
- A failed BlogPress media upload surfaces the raw English `Failed to fetch`
  (`frontend/state/blogpress/use-post-upload.ts:94` from `frontend/api/blogpress.ts:41`).
- A Local Store that fails to open only logs; the lead path still degrades to the network
  (`frontend/state/leads/use-lead-submission.ts:141`, `frontend/state/blogpress/use-blogpress-store.ts:103`).

### Limits, not gaps

The spec's [Limits of instant](specs/offline-first.md#limits-of-instant) is where the floor is stated —
a never-visited route cannot render offline, a reload of an owned-data route lands on `/offline`, and
a product that invents a credential the browser will not attach cannot drain in the background (#385
closed LinkSnap's case). This audit found nothing there to correct.
