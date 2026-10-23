# Spec: Offline-first web and Android app

**Status:** accepted.
**Decisions:** ADR-0027 … ADR-0031, ADR-0058 … ADR-0061. Vocabulary: `CONTEXT.md` → _Offline_.
**Surfaces audit:** [`offline-surfaces-audit.md`](offline-surfaces-audit.md) — every route against the
scope table, and every ADR-0031 surface against the needs-connection state it promises (phase 4).

## Goal

The bar is WhatsApp's: what you send appears the instant you send it, and it is delivered even if you
close the app. We hold ourselves to the same bar across an ordinary browser tab, an installed PWA and
the Android shell, which is three properties in increasing order of difficulty:

1. **Instant local read** — Owned data paints from the Local Store, never behind a blocking spinner.
2. **Never-lost write** — a write is durable before it is acknowledged, and a write that can never be
   delivered is surfaced rather than dropped.
3. **Delivery with the app closed** — a queued write reaches the server while the tab is shut or the
   phone is in doze, without the user reopening anything.

Properties 1 and 2 are implemented (ADR-0028, ADR-0029). Property 3 is not, and it is what this spec
now exists to deliver: the app is _reliable_ offline today but it is not yet _instant in the way a
messenger is_.

## Non-goals

- Making server-bound features work offline. Media Downloader, rate refresh, MCP, Admin, auth and Web
  Push keep a clear "needs connection" state (ADR-0031).
- A CRDT or true multi-writer merge. Owned data is single-owner, so last-write-wins is enough
  (ADR-0029).
- Gating offline writes behind PWA installation.
- Being a messenger. We are matching WhatsApp's _delivery_ feel, not building chat.

## Scope

| Surface                                                               | Offline read                                                    | Offline write |
| --------------------------------------------------------------------- | --------------------------------------------------------------- | ------------- |
| Public content (Community, Rates, Certificates/Verify, Showcase)      | Yes — SWR cache                                                 | No            |
| Auth shells (login, signup, OTP, reset, password update)              | Yes — SWR cache since #447; every submit still needs the server | No            |
| Scanner (decodes on the device; owns no server surface)               | Yes — once the engine is cached                                 | No            |
| Account tools — HabitFlow, SpendTrack, LinkSnap, BlogPress            | Yes — from Local Store                                          | Yes — Outbox  |
| Non-inventory leads — Training Application, Project Request, Retainer | n/a                                                             | Yes — Outbox  |
| Consultation Booking (reserves Availability Slots)                    | No — a live read, refused offline with a needs-connection state | No            |
| Auth, Push, Media Downloader, Rates refresh, MCP, Admin               | No                                                              | No            |

Everything in the first and third rows must reach properties 1–3. The fourth row is the one addition
worth revisiting per surface: drafting a lead offline is already supported, and any other write that
loses nothing an operator cannot reconcile should join it. Consultation Booking stays online-only
because it reserves a scarce resource (ADR-0031).

## Limits of instant

Being honest about the floor is part of the spec, because a promise we cannot keep is worse than a
stated limit.

- **A route never visited, opened offline for the first time, cannot render its own document — but it
  no longer replaces the screen.** There is no cached HTML or RSC payload for it, and nothing can
  synthesise one. The worker refreshes every _static_ route's shell in the background after it
  installs (ADR-0071, #489), so for those the window closes with the first online visit — during it,
  once the refresh reaches that route — rather than with the install. A detail route whose pages come
  from a dynamic segment — `/u/[username]`, `/community/[slug]`, `/quran/[surah]`, `/verify/[code]` —
  is a pattern, not a document, so the build has no shell for it; a first offline deep link is
  answered with the **nearest cached ancestor** instead (`/community` for `/community/<slug>`, `/`
  for `/u/<username>`, since `/u` has no document of its own), at the URL the user asked for, with an
  inline card saying that link is not available offline (#490, ADR-0071's #490 amendment). That is
  the case a profile link opened from a message hits. One online visit caches the page like any other
  navigation, and the next offline open renders it in full.
- **Server-bound surfaces stay server-bound.** Auth, consultation booking, rate refresh, the media
  downloader, admin and MCP show a needs-connection state by design (ADR-0031); they are not a gap to
  close. Since #447–#450 that state lives inside a cached document for every one of them except
  `/admin` and the MCP consent screen, which still ask the network for their document — the boundary
  the next bullet states.
- **The Android app's cold start is capped by the WebView.** The shell loads a remote URL (ADR-0036),
  so launch is a WebView start plus a first remote frame — structurally slower than a natively drawn
  messenger. We close the _visible_ part of it with the app's own skeleton as the launch screen
  (ADR-0061) rather than by bundling, and we do not pretend it is a native-first render.
- **The floor is two doors, and one surface that still knocks.** `/offline` answers two
  situations: a brand-new install's first hit with no network (nothing has been cached yet, by
  definition); and `/admin`, whose guard answers on the server (`identity.resolveAdmin`) so a cached
  document could not authorize itself. A never-visited dynamic detail route used to be the third
  door (#473); since #490 it keeps its parent's chrome and says so inline instead, so it no longer
  reaches a different screen. `/mcp/connect` is the one other user-facing surface that asks
  the network for its document, and it is not a gap left behind: its URL carries `client_id`,
  `redirect_uri`, the PKCE challenge and `state`, so a bare precached path cannot answer it, and the
  document renders the client the user is being asked about — a consent that cannot reach the server
  mints nothing, and the form says so in place (#450). Every other user-facing route precaches or
  SWR-caches its shell and paints its own needs-connection state inside it.
- **"Instant" is perceived latency, not a benchmark.** The property is that owned data paints from the
  Local Store with no network wait and a write applies on tap. It is not a claim that every route
  renders in zero milliseconds.
- **A cold load waits no longer than three seconds for the network.** `NAVIGATION_TIMEOUT_MS = 3000`
  (`public/sw.js`, #447, lowered by #491): a request with no cached copy races the network against
  the deadline, and the nearest cached shell answers instead of the browser's own several-minute
  hang. Ten seconds was the same rule with an unusable number — ten seconds of blank reads as a
  broken app, not as protection. The cut fetch keeps running, so a late response still enters the
  cache and the next visit gets the real page. A cached copy is never behind the deadline — stale
  paint stays instant — and never-cache API reads inside a painted page rely on the page's own
  states rather than on this rule.
- **An owned-data route's shell needs one online visit, then it reloads offline.** `/habitflow`,
  `/spendtrack`, `/linksnap` and `/blogpress` used to be in the worker's never-cache list
  (ADR-0031: their documents were server-rendered per user, so caching them risked leaking one
  session's data to the next on a shared device), and an offline reload landed on `/offline`.
  #449 made them data-free static shells with a client gate that paints the Local Store into
  them (ADR-0073), so their documents are SWR-cached and precached like the public ones: a
  reload or deep link paints the product's own chrome and its local rows, never the offline
  page. `/device` was the pilot for that shape (ADR-0070): the queue and the device's copy are
  inspectable and removable with no network, precisely because that page renders no account
  data on the server. `/account` took the same step in #448 (ADR-0031's #448 amendment). The
  first visit still needs the network — there is no document before it — and server-owned
  values inside these pages (SpendTrack's currency, BlogPress's categories and tags) answer
  only when their own never-cache read does.
- **Background delivery on the web is Chromium-only.** Safari and Firefox have no `SyncManager`, so
  there a closed tab flushes nothing: the in-page triggers are the whole story, and the pending count
  says so rather than implying a delivery that will not happen. We do not gate a feature on it, and the
  Android shell covers the same ground natively (ADR-0059).
- **A product whose writes need a credential the browser will not attach cannot drain in the
  background.** Every wired product now replays through the session cookie, which the browser sends on
  a same-origin fetch from any realm. LinkSnap used to be the exception — its API took a bearer token
  from React state, which a worker cannot read — so its routes now resolve the cookie when the header
  is absent (`backend/transport/session-or-bearer-handler.ts`) and its transport carries no token
  (#385). A future product that invents its own credential would re-open this limit.

## Where we are today

Honest list of what stands between us and the bar, each with the file that shows it:

1. **The Android shell's background path exists, and its reach is narrower than its mechanism.** A write
   survives the app closing: a WorkManager job - a 15-minute floor plus a one-shot the page asks for
   through `RoyShellSync.schedule()` - loads `/sync-flush.html` in a headless WebView, replays the Outbox
   there, and only then pulls (ADR-0059, [the shell notes](../mobile/android-shell.md)). A change made
   elsewhere reaches a closed shell too: the device that delivered it asks the server for a silent
   high-priority FCM wake, and the receiver enqueues that same drain. What is still open is the
   battery-optimization prompt and delivery badges in the shell; and the background _pull_ covers
   HabitFlow, SpendTrack, the Quran Reader, LinkSnap (#385) and — since #384, whose client pull it
   reuses — BlogPress. Those five products refresh, including a BlogPress fought with on a phone that
   never opens the app. So a laptop write refreshes a phone's habits, expenses, Quran reading
   position, links and posts before the phone is opened.
2. **The offline e2e suite's owned-data half runs in CI, and the sign-in is paced to the product's
   own limit.** Every spec is `test.skip(!ENABLED)` behind its own env flag; the `E2E: Offline` workflow
   sets them for every wired spec except `lead-offline`, which stays out because it writes a row the
   suite cannot remove, and runs them serially. Serial is necessary but not sufficient: the login
   endpoint allows five attempts per email per minute and seven specs signed in inside half a minute, so
   the sixth and seventh came back as a 400 whose message is the rate limit — red for a reason that
   looked like the product and was the suite (#386). Every sign-in now goes through `e2e/sign-in.ts`,
   which paces attempts to that window and waits it out when one is refused. `E2E_TEST_EMAIL` /
   `E2E_TEST_PASSWORD` are repository secrets; without them the owned-data specs skip rather than fail,
   so the job still says what it covered. What the repairs had accumulated is the argument for keeping
   it wired: a failed lazy chunk replaced the whole HabitFlow route with an error card; LinkSnap's spec
   clicked a button whose Arabic label it spelled differently from the component, and waited for a menu
   item spelled differently from the one the component renders; BlogPress could not create a draft at
   all against a test account that had no `public.users` profile row — and proved convergence by
   reloading a page that paints from the Local Store either way. Each was invisible to every other
   check in the repo.
3. **The surfaces audit's list is closed down to its mechanical leftovers.**
   [`offline-surfaces-audit.md`](offline-surfaces-audit.md) checked every route against the table above
   and every ADR-0031 surface for the needs-connection state it promises. It closed the three that were
   misreporting a connection failure — consultation availability, the media downloader, Web Push — and
   filed the rest. In-page states for auth, admin and MCP (#368) landed and the per-surface decision is
   recorded in the ADR-0031 amendment; #369's silent read-failure of a pull is closed by the ADR-0027
   amendment. The account diagnostics view and "Remove this device's copy" that it filed as #370 live in
   `/device` (ADR-0070). Phase 3 (#450) then closed the route half of the list: `/downloader` and
   `/consultation/book` are data-free cached shells whose actions name the connection, `/mcp/guide` left
   the `/mcp` never-cache prefix, and `/mcp/connect` stays a network document for the reason the
   [Limits of instant](#limits-of-instant) records. The mechanical leftovers (Community's read failures,
   one raw error string) were closed by #475: the feed's page, search and "load more" reads now go through
   the transport, so an unreachable server names the connection and an answered failure is an ordinary
   error card — each with its own retry — and the BlogPress upload replay speaks Arabic instead of an
   English literal.
4. **A dynamic detail deep link keeps its parent's chrome, and the item itself still needs one
   visit.** The worker answers a navigation it has no copy of with the longest cached ancestor
   (`shellPrefixCandidates` in `public/sw-routing.js`, `serveNearestShell` in `public/sw.js`, #490)
   and records the swap in its bookkeeping cache, which
   `frontend/ui/shared/offline-route-card.tsx` reads after hydration to draw the shared
   needs-connection card. So `/community/<slug>`, `/quran/<surah>`, `/u/<username>` and
   `/verify/<code>` show the app rather than `/offline` — at the cost that what renders is the
   ancestor's content, not the item the user asked for, until that item has been opened online once.
   The marker is per navigation: the worker clears it before every navigation it answers, so a later
   online visit never inherits a card. A card needs a page that runs, so the background refresh also
   queues the `/_next/static` files each shell names and drains twelve per idle window
   (`ROUTE_REFRESH_ASSET_BATCH`) from a build-stamped queue in the worker's bookkeeping cache — the
   chunks of a never-visited route otherwise arrive only with a visit, which is exactly the case the
   prefix serve exists for.

## Architecture

1. **Local Store** — one durable IndexedDB database per identity (`guest` | `user:<id>`), per product.
   Holds Owned data and the Outbox. Forward-only, additive migrations (native IDB `version` +
   `onupgradeneeded`).
2. **Outbox** — ordered intents replayed to the server. Client-minted UUIDv7 `client_id`, idempotent
   upserts, tombstones for deletes, exponential backoff + jitter, surfaced permanent failures. It is
   the **only** writer to the server; nothing else in this spec is allowed to become a second one.
3. **Service worker** (`public/sw.js`, grown not replaced) — cache tiers + the never-cache list, plus
   the `sync` handler that answers Background Sync. The handler is glue; the drain itself is the app's
   own code, bundled by `scripts/build-sw-outbox.mjs` into a git-ignored `public/sw-outbox.js` and
   loaded with `importScripts`, so the worker replays through the same engine, the same transports and
   the same Outbox access as the page rather than a second implementation of them. `activate` touches
   Cache Storage only, never IndexedDB.
4. **Sync coordination** — Web Locks leader for flushing; BroadcastChannel for cross-tab
   invalidation. Triggers are now three tiers, in the order they are worth relying on:
   1. **In-page** — `online` / `visibilitychange` / focus / manual retry. Present today, and the
      fallback everywhere.
   2. **Web Background Sync** — a Chromium tab's service worker flushes with the tab closed
      (ADR-0058). The page registers the tag only when its own flush left intents queued, so a write it
      already delivered never wakes the worker. Absent in Safari and Firefox, where tier 1 is the whole
      story.
   3. **Native Android** — a silent high-priority FCM data message wakes a WorkManager job that drains
      the Outbox (ADR-0059). This is the only tier that works with the app killed.
5. **Sync hints** (ADR-0060) — a server→client signal that there is new data to pull: Supabase Realtime
   `postgres_changes` while foregrounded, and the FCM data message while backgrounded. A hint triggers a
   **pull**, never a blind merge: the payload is ignored beyond "something changed", so our own write
   echoed back costs one wasted request, and the merge that follows is the same pending-aware
   last-write-wins every other pull runs. `frontend/api/sync-hints.ts` owns the subscription — one
   channel per table, filtered to `user_id`, dropped while the document is hidden, and a burst of
   changes folded into one pull. It listens only to tables whose surface has a pull to trigger
   (HabitFlow's `habits`/`habit_logs`, SpendTrack's four, LinkSnap's `short_links`, the Quran Reader's
   `quran_reading_positions`/`quran_bookmarks`, and BlogPress's `posts` — filtered on `author_id`,
   since posts key ownership there), published by
   `supabase/migrations/*_publish_*_realtime_hints.sql` — one file per slice that adds tables, because
   an applied migration never runs again; the lead forms read on the server through their loader, so
   they have nothing to pull and are not published. A tab that was hidden catches up through
   its own focus pull — the subscription is gone by then, which is why a hint never has to be replayed.

### Cache tiers

| Request                                                                                     | Strategy                                                                                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| App shell, icons, fonts                                                                     | cache-first                                                                                                        |
| Public navigation / RSC payloads                                                            | stale-while-revalidate (+ "updated X ago")                                                                         |
| Auth + account document shells                                                              | stale-while-revalidate (#447, #448; shell only, no account-bearing render)                                         |
| Product dashboard shells (HabitFlow, SpendTrack, LinkSnap, BlogPress)                       | stale-while-revalidate (#449; shell only, painted from the Local Store)                                            |
| Consultation booking + media downloader shells                                              | stale-while-revalidate (#450; shell only — packages and the link probe are client reads on their never-cache APIs) |
| MCP guide                                                                                   | stale-while-revalidate (#450; static instructions, no server action)                                               |
| Public read APIs that declare `public`                                                      | SWR; an absent header is not permission                                                                            |
| Auth APIs and the OAuth callback, mutations, admin, MCP consent, push, `no-store`/`private` | never cache                                                                                                        |

Account-scoped reads are `no-store` by construction at the authenticated seam, and the Quran sync
read is also on the never-cache list — a signed-in reader's bookmarks and position never enter Cache
Storage (#392). `scripts/__tests__/api-cache-contract.test.ts` fails an API GET route that is neither
on the never-cache list nor explicitly `no-store`/`public`.

Cache Storage is bounded in bytes and evicted least-recently-used first, with the offline page and
the current build's static assets pinned; sign-out purges the runtime cache except that shell, and
never touches the Local Store or Outbox ([ADR-0069](../adr/0069-the-public-cache-has-a-byte-budget.md), #394).
The caches themselves are named by **schema** (`royaraqamia-data-v1`, `royaraqamia-static-v1`), not by
release, so a deployment keeps the device's whole library and only a schema bump discards it. Each
entry is stamped with the build that produced it: a document from an earlier build is served at once
and refreshed through the network, and the background route refresh skips a shell the current build
already holds
([ADR-0069's #488 amendment](../adr/0069-the-public-cache-has-a-byte-budget.md#amendment-2026-10-22-488-the-cache-is-named-by-schema-not-by-release)).

The build's public static routes are cached as HTML documents by a **background refresh** after
the worker installs — idle windows, four routes at a time, two fetches in flight, resumed from what
the device holds (#489) — derived from the build's
own route manifests and bounded to 6 MB (or what the cache budget has left), so a deep link to a route
this device never opened still paints its own shell offline once the refresh has reached it
([ADR-0071](../adr/0071-the-public-route-shells-are-precached.md), #395). The install itself fetches
only `/`, `/offline`, the manifest and the icons. Dynamic detail routes,
account tools' API prefixes and every never-cache prefix stay out; the product dashboard roots joined
the list in #449 (ADR-0073) once they became data-free shells, and `/consultation/book`,
`/downloader` and `/mcp/guide` in #450. On the #450 build the list is 29 documents and 1,705,315 bytes
(1.63 MB) measured from the build's own HTML, against the 32-route cap and the 6 MB ceiling.

An RSC payload is stored **one per page, not one per router variant** (#492). The App Router appends
`_rsc` to a flight request — a hash of the request's own headers — so two navigations to the same page
from different router states arrive on different URLs and, keyed by the full URL, missed each other. A
_live_ payload (the answer a navigation asks for) is keyed by its path and the caller's own query with
that hash folded to a constant, so the second navigation paints from Cache Storage. A _prefetched_
body is deliberately not shared: it is partial by design, and Next refuses it as a navigation answer
by falling back to a full document load, so a prefetch keeps its own URL. Navigations also run through
`NavigationPreloadManager`, so the document request starts while the worker is still booting rather
than after it.

### Delivery states

Property 3 needs a per-item state a user can read at a glance, the way a messenger's clock and ticks
work: **queued** (durable, not yet acknowledged), **sent** (server accepted), **failed** (permanent,
with retry). The Outbox already distinguishes these; the work is to surface them per item everywhere,
not only as a count. `/device` is where the queue itself is listed per item, with the last error and a
retry; the in-place badge beside each write is still the product's own job.

### Data contract

Owned tables carry the additive columns ADR-0029 introduced:

```
client_id   uuid    -- unique per user
updated_at  timestamptz
deleted_at  timestamptz null
```

Endpoints for owned records are idempotent upserts keyed on `(user_id, client_id)`; deletes set
`deleted_at`. RLS stays user-scoped; native clients never use the service role. `shared/contracts`
Zod schemas carry the same fields.

## Rendering

Owned data renders from the Local Store: hydrate IndexedDB → paint → refresh from the server in the
background, on a sync hint or on focus. Server loaders remain the initial seed and warm path. Shared
and public data stays RSC, served from the SW cache.

The product dashboards follow that rule down to the document: their roots are static data-free shells
(#449, ADR-0073), the session and the URL's filters are resolved on the client, and everything the
account owns is painted from the store the pull keeps current. No loader seeds a product store any
more — the pull is the only source of server data, so there is one path to keep in step.

**A missing chunk costs the component, never the page.** Every lazy boundary (`next/dynamic`,
`React.lazy`, the below-the-fold sections) loads through `tolerateChunkFailure`
(`frontend/ui/shared/lazy-chunk.ts`), so a chunk that cannot be fetched — a first tap with the radio
off, a `setTimeout 0` mount, an aborted prefetch — renders nothing where it would have been rather
than rejecting. A rejected import is a **render error**: React hands it to the nearest error boundary,
and for the root-layout floats that boundary is the route, so the user used to lose the page they were
reading because of a chunk they never asked for (#332).

## Identity & auth

- Network failure is **never** a logout; the cached session keeps the shell signed in, and only
  server-bound actions show "needs connection".
- **Claim on sign-in:** guest rows move into the account namespace and are pushed (dedupe by
  `client_id`, LWW merge).
- Sign-out keeps the account namespace on disk; `/account` links to `/device`, where
  **"Remove this device's copy"** says how many stores and unsynced writes it takes with it
  (ADR-0070).
- Token refresh is deferred until reconnection.

## Storage & telemetry

- `navigator.storage.persist()` is requested after a real save gesture **or** install, not install
  alone; a denial is honoured and means the store is evictable.
- Public cache capped (~150 MB) with LRU eviction; **Owned data and the Outbox are never evicted**.
- Android: Java `SharedPreferences` holds the FCM token; nothing else moves native.
- Analytics/errors are best-effort, bounded and droppable; they share none of the Outbox guarantees.
- **Every fallback serve is counted by door** (ADR-0074, #474): the worker labels each one
  (`navigation-deadline`, `navigation-offline`, `navigation-prefix`, `online-only-deadline`,
  `online-only-offline`, `static-offline`, `api-offline`, `no-fallback`) and posts one beacon per
  serve to `/api/offline-serve`, carrying the cache hit/miss/failure tallies since the previous
  report. `navigation-prefix` is the graceful fallback (#490): an ancestor shell answered and the
  client drew the inline card, so the door separates "the user saw the parent's chrome" from "the
  user saw `/offline`". What
  is deliberately not collected: **no URL** (not even a path), no user, session or client id, no
  cookies (`credentials: 'omit'`), no timing, no sizes. The beacon is droppable — it is not awaited,
  and a limiter outage drops it rather than opening a write path. A beacon the network refuses (the
  radio is off) is kept in one small Cache Storage entry, merged per door and retried on the next
  request that reaches the network — so a device that reconnects before the next worker change
  delivers what it could not send; a worker killed mid-write still loses it.
- **Where a maintainer reads it:** the endpoint writes one `logger.info` line, so the field signal is
  a Vercel log query — filter on `[offline-serve]` and group the door. A door changing shape is the
  regression signal: `navigation-*` climbing means ordinary routes stopped caching, `no-fallback`
  means the shell itself is missing. The endpoint also emits one Sentry message per door (fingerprint
  `offline-serve/<door>`): `warning` for `no-fallback`, `navigation-deadline` and
  `online-only-deadline`, `info` for the accepted doors, so an alert rule pages without a log query.
  Nothing in the app reads the count back.

## UX

Instant local render (no blocking spinners on owned data), optimistic mutations, a persistent
online/offline + pending-count pill ("syncing…", "failed — retry"), per-item delivery badges, an
outbox/diagnostics view at `/device` — reachable from `/account`, cached so it works with the radio off
(ADR-0070) — and route View Transitions. On Android the same states must
survive the app being killed and relaunched, and a battery-optimization exemption is asked for at the
moment it matters — with the reason stated, since the request is otherwise opaque.

## Phases

**Phase 0 of the "never show `/offline`" roadmap (#447) landed on 2026-10-21.** Three diffs close the
most-complained paths without touching the dashboard architecture: a cold-load deadline for every
navigation (the limit above — ten seconds when it landed, three since #491), the auth shells in the SWR
cache with their forms answering offline submits inline (ADR-0031's amendment; the shells join
ADR-0071's precache), and the Android shell's fallback page recovering exactly once when the radio
returns (ADR-0067's amendment). With it, `/offline` ends up serving only a brand-new install hit with no
network, and `/admin`.

**Phase 1 (#448) landed the same day:** the `/account` subtree's shells joined the SWR cache. The
layout is no longer dynamic (`headers()` moved into `AccountFooter`), the guarded children guard
on the client through the session provider, `/account/posts` reads its feed through the
never-cache `/api/me/posts` seam, and the account views render the shared needs-connection state
for a failed read instead of routing the failure to `/offline`. The boundary the audit guards —
no account fragment in a cached response — is held by the never-cache API prefixes, not by the
documents.

**Phase 2 (#449) landed on 2026-10-21:** the four product dashboard roots are static data-free
shells painted from their Local Stores (ADR-0073). BlogPress's layout guard moved client-side (its
editor keeps the server guard and the never-cache prefix), `/blogpress/calendar` follows the root,
and the worker's never-cache list narrows from the product prefixes to their APIs and the two
data-bearing subroutes. With it, `/offline` serves only a brand-new install hit with no network,
`/admin`, and the server-guarded editor.

**Phase 3 (#450) landed the same day:** `/consultation/book` and `/downloader` stopped being
`force-dynamic` documents — the package read, the optional sign-in hint and the link probe are
client reads on their never-cache APIs — so both are precached shells whose forms name the
connection they still need. `/mcp` became an exact never-cache entry with the consent document on
its own prefix, which lets `/mcp/guide` ride the SWR cache; `/mcp/connect` stays a network document
for the reason the [Limits of instant](#limits-of-instant) states. The precache is re-measured, not
estimated: 29 documents, 1,705,315 bytes, against the 32-route cap and the 6 MB install ceiling
(ADR-0071's amendment). The device half of this phase — the cold-start drill matrix and the
weak-network soak — is owner-run and recorded in
[the shell notes](../mobile/android-shell.md), not something a CI job can claim.

Phases 1–4 have landed. Where each one's state is written down: the [Architecture](#architecture)
section for the mechanisms, the [surfaces audit](offline-surfaces-audit.md) for what a route shows when
the server is unreachable, and the [Verification](#verification) section for what runs.

0. **Baseline** — this spec, ADR-0058 … ADR-0061, and the `CONTEXT.md` vocabulary.
1. **Close the web gaps** — flush-on-write in all five products, `persist()` on a real save, and the
   offline suite running in CI.
2. **Web Background Sync** — the `sync` handler plus registration from the write path, with flush-on-open
   as the documented fallback where the API is absent (ADR-0058).
3. **Sync hints** — Realtime for owned data while foregrounded, pulling on a hint (ADR-0060).
4. **Remaining surfaces** — audit every route against the table; bring the feasible leftovers offline
   and give each ADR-0031 surface a legible needs-connection state.
5. **Android background sync** — _5a, landed:_ the drain — a WorkManager job (a 15-minute floor plus a
   one-shot the page asks for through `RoyShellSync.schedule()`) loads `/sync-flush.html` in a headless
   WebView, replays the Outbox and then pulls what it can (ADR-0059). _5b, landed:_ the FCM data wake —
   a device that delivered a write asks the server to wake the account's other devices, a silent
   high-priority data message reaches `SyncMessagingService`, and the receiver enqueues the same drain;
   the background pull covers HabitFlow, SpendTrack, the Quran Reader, LinkSnap and BlogPress
   (`PULLABLE_PRODUCTS`). _5c,
   half-landed:_ the battery-exemption prompt — a drain that ends with work still owed, or a wake the
   app receives in the background, asks once with the reason in the notification's copy, and the tap
   opens the platform's one-tap exemption dialog (ADR-0059's amendment; #381). The delivery badges in
   the shell are the open half.
6. **Android launch** — extend the launch theme into the app's own chrome skeleton so cold start reads
   as content arriving, staying stateless and OTA-free (ADR-0061).
7. **Verify and harden** — the device matrix below, chaos tests, and the offline suite as a CI gate.

## Verification

- **Offline e2e in CI:** the `E2E: Offline` workflow runs `context.setOffline(true)` with
  `serviceWorkers: 'allow'`, asserting cached read and **sync-resume** (offline → mutate → reconnect →
  server state correct). Which surfaces have that proof, and which do not:

  | Surface                    | Sync-resume proof                                                                                                                                                | Spec                                                   |
  | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
  | SpendTrack                 | expense written offline, server row after reconnect                                                                                                              | `spendtrack-offline.spec.ts`                           |
  | HabitFlow                  | habit written offline, server row after reconnect                                                                                                                | `habitflow-sync-resume.spec.ts`                        |
  | LinkSnap                   | link created offline, server row after reconnect — and a second proof that the list paints from the Local Store offline; the drain registry now covers it (#385) | `linksnap-offline.spec.ts`                             |
  | BlogPress                  | draft edit made offline, server body after reconnect                                                                                                             | `blogpress-offline.spec.ts`                            |
  | Quran Reader               | mark made offline, account row after reconnect                                                                                                                   | `quran-sync.spec.ts`                                   |
  | Public shell + breakpoints | cached read at 320 / 375 / 428 / 768 px, never a 503; a never-visited public route deep-links to its own shell offline                                           | `public-offline.spec.ts`, `responsive-offline.spec.ts` |

  Two more specs prove a mechanism rather than a product: `sync-flush.spec.ts` queues a write, closes
  the page and restores the network, so only the Android shell's drain page can deliver it; and
  `sync-chaos.spec.ts` loses a create's acknowledgement and proves the replay is the same row.

  The render drill is separate from the resume proof: `product-offline-render.spec.ts` (#449) visits
  each product root once online, reloads it with the radio off, and asserts the product's own chrome —
  and the row written offline, where the root shows owned rows — instead of `/offline`. It is the
  check that the shells are cached documents rather than per-user renders. `public-offline.spec.ts`
  carries the same assertion for the #450 shells: a context that opened neither `/downloader` nor
  `/consultation/book` deep-links to each with the radio off and reads its heading, not the offline
  page's retry link. Since #490 the same spec pins the dynamic-detail boundary from the side that
  matters: a detail route this context never opened (`/quran/7`, `/verify/<code>`, `/u/<username>`)
  keeps its parent's chrome and shows the inline card rather than `/offline`, and the same link
  renders the item itself once it has been opened online — the limit stays one visit deep rather than
  one segment deep. `product-offline-render.spec.ts` proves the product half of it with
  `/linksnap/unlock/<code>`.

  What is **not** proven here, on purpose: `lead-offline.spec.ts` has the same shape for a Project
  Request but is left out of the workflow because it writes a row the suite cannot remove against the
  live project; consultation booking is online-only and its spec asserts the needs-connection state,
  not a resume; and `spendtrack-multidevice.spec.ts` (a delete converging on a second device) is a
  flag-gated local run, not a CI job, because two devices need the device matrix in phase 7. Sign-ins
  are paced by `e2e/sign-in.ts` — five attempts per email per minute is a product limit the suite has
  to live under, not a flag to switch off.

- **The fallback counter is proven without a network.** `scripts/__tests__/sw.test.mjs` answers only
  the beacon in its fake network and asserts each door — including `navigation-prefix`, and that a
  prefix serve keeps `/offline` for an empty cache and for `/admin` — the tallies, the absence of a
  URL and that the page does not wait on the report; `backend/controllers/__tests__/offline-metrics.test.ts`
  pins the schema → log-line seam (unknown door, negative tally and unknown version refused before a
  bucket is spent). The field side is the Vercel log query named in
  [Storage & telemetry](#storage--telemetry).
- **Android device matrix**, on real hardware: app backgrounded, app force-stopped, doze, process death
  mid-flush, no network at launch, low storage/quota, worker swap mid-queue, multiple tabs.
- **Needs-connection states are asserted where they were missing.** Consultation's availability and
  package reads carry a failure state and a retry instead of the "none available" empty state; the media
  downloader renders the inspection failure it used to swallow and names the connection while offline;
  Web Push distinguishes an unreachable server from a permission denial. The audit that found them
  ([`offline-surfaces-audit.md`](offline-surfaces-audit.md)) is the record of what every route shows when
  the server is unreachable, and what it left open is issues #368 and #369 — filed rather than
  listed, so a reader can tell the difference between a closed gap and a known one. #370, the
  diagnostics view, is closed by `/device` (ADR-0070).
- **Unit tests:** Outbox, IndexedDB repositories, migration chains, the sync engine's ordering and
  backoff, the SW `sync` handler, the device-copy reader and the FCM wake payload.
- **Realtime hints, and what their e2e cannot be.** The subscription's visibility rule, its burst
  folding and its "a channel that cannot open costs latency, never the surface" behaviour are covered
  against an injected subscriber, and each surface's wiring is covered by asserting that a hint runs
  that surface's pull. That a subscribed table is also a _published_ one is pinned by a test, because a
  subscription to an unpublished table fails silently.
- **The publication itself is checked against the live project:**
  `node --env-file=.env scripts/check-realtime-hints.mjs` subscribes as the test account, writes a row
  through the service role, and fails when no change arrives — one table per subscribed product, since
  the publication, the RLS and the filter are not table-specific. Run before the migration applies it
  reports three misses, which is what makes it evidence rather than a formality. No Playwright test can
  replace it: two devices cannot be driven from one browser because only one page is visible and a
  hidden one holds no subscription, so the two-device case belongs to the device matrix in phase 7.
- **Background Sync itself cannot be driven from Playwright.** Playwright's Chromium launches with
  Background Sync disabled: the API is present but inert, so `register` rejects and even `getTags()`
  answers "Background Sync is disabled". No e2e can cover the tier — not the registration and not the
  event — which is why it is covered where it can be: unit tests for the drain's identity rules and the
  page's registration condition, and a sandboxed test for the worker's listener. The code degrades to
  `false` when the API refuses, which is the branch the suites actually exercise. What the offline
  suite proves is the _fallback_ — flush-on-open — which is why it stays a real gate rather than a
  gesture. The device matrix in phase 7 is where a real background flush gets exercised.
- **The Android drain page, where a browser can reach it.** `e2e/sync-flush.spec.ts` (gated on
  `SYNC_FLUSH_E2E=1`) queues a write with the radio off, closes the app's page, restores the network, and
  only then loads `/sync-flush.html` with the shell's `RoyShellSync` bridge stubbed — the page reports
  `pending: 0` with the product's intent replayed, and the server has the write. That is exactly the page
  the shell's WorkManager job loads, so the spec covers the half a browser can reach; the wake itself is
  native and is measured in [the shell notes](../mobile/android-shell.md).
- **The drain's own scheduling** is pinned on the JVM: `SyncFlushResultTest` holds the worker's only
  decision (an unreadable report, a failed session lookup or pending work all mean "come back", never
  "nothing to do"), and `ShellServerTest` holds the URL arithmetic the update check and the drain share.
  What no test can hold is WorkManager actually waking a killed app - that is a device result.
- **The wake, short of the phone.** The FCM client's wake is pinned to a data-only, high-priority
  message with no `notification` block; the service sends it to every token but the caller's; the
  controller owns the same three guards as the device registry (session, same origin, a per-user limit)
  and fans out to nobody but the caller. On the JVM, `ShellSyncWakeTest` holds what counts as a wake and
  the manifest wiring that leaves one receiver, and `scripts/__tests__/sync-flush-page.test.mjs` holds
  the type string to the server's. What none of that can hold is an FCM delivery to a closed app - that
  is a device result, and [the shell notes](../mobile/android-shell.md) name where it stands.
- **The background pull** is the drain page's second half: it runs `PULLABLE_PRODUCTS` after the queue
  (`refresh-products.test.ts`, `sync-flush-entry.test.ts`, and each product's pull module through the
  hook that now shares it). Its coverage is the honest part: five products today, with the reason the
  one absent product is absent written in `sync-products.ts`.
- **Performance budget:** `npm run perf:check` gates every phase. Local-first reads should move the
  numbers the right way, but Background Sync, Realtime and extra caching all cost something, so a phase
  that regresses `perf/budget.json` does not land — the budget is a gate, not a report.
- **Gates:** `npx tsc --noEmit`, `npm run lint`, `npm test` (+ the new suites) and `npm run build` in CI.

## Open questions

1. **BlogPress media upload** cannot queue offline — drafts queue, images need a live upload. What is
   the offline state of an un-uploaded image?
2. **Community compose/publish** offline: queue drafts, or online-only?
3. **LinkSnap analytics** are server-side; offline visits cannot be counted. Accept, or buffer?
4. **Rates** offline: last snapshot read-only with "refresh" disabled — confirm the affordance.
5. **Consultation availability** cached read-only offline — needed at all?
6. **Android flush mechanism**: drain the Outbox by running the web sync code in a headless WebView
   (one implementation), or mirror the Outbox natively and replay in Java (no WebView dependency)?
   ADR-0059 commits to the first and names the second as the revisit trigger.
