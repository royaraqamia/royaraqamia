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

- **A route never visited, opened offline for the first time, cannot render.** There is no cached HTML
  or RSC payload to serve, and nothing can synthesise it. We shrink the window by precaching every
  route's shell, but a server-rendered page's data still needs one online visit first.
- **Server-bound surfaces stay server-bound.** Auth, consultation booking, rate refresh, the media
  downloader, admin and MCP show a needs-connection state by design (ADR-0031); they are not a gap to
  close.
- **The Android app's cold start is capped by the WebView.** The shell loads a remote URL (ADR-0036),
  so launch is a WebView start plus a first remote frame — structurally slower than a natively drawn
  messenger. We close the _visible_ part of it with the app's own skeleton as the launch screen
  (ADR-0061) rather than by bundling, and we do not pretend it is a native-first render.
- **"Instant" is perceived latency, not a benchmark.** The property is that owned data paints from the
  Local Store with no network wait and a write applies on tap. It is not a claim that every route
  renders in zero milliseconds.
- **A cold load waits no longer than ten seconds for the network.** `NAVIGATION_TIMEOUT_MS = 10000`
  (`public/sw.js`, #447): a request with no cached copy races the network against the deadline, and
  the fallback answers instead of the browser's own several-minute hang. The cut fetch keeps
  running, so a late response still enters the cache and the next visit gets the real page. A cached
  copy is never behind the deadline — stale paint stays instant — and never-cache API reads inside a
  painted page rely on the page's own states rather than on this rule.
- **A reload of an owned-data route, offline, lands on the offline page.** `/habitflow`,
  `/spendtrack`, `/linksnap` and `/blogpress` are in the worker's never-cache list (ADR-0031:
  their documents are server-rendered per user, so caching them risks leaking one session's
  data to the next on a shared device). In-session navigation still paints from the Local
  Store — that is the measured behaviour, and where it is not, it is a gap — but a reload or a
  deep link with the radio off has no document to serve. Closing it needs a data-free shell for
  those routes plus a client-side gate that paints the Local Store into it: a design step, not
  a one-line change, so it is recorded here rather than promised. `/device` is the one place
  that design has been built (ADR-0070): the queue and the device's copy are inspectable and
  removable with no network, precisely because that page renders no account data on the server.
  `/account` used to stand in this list too; #448 moved its children's guard client-side and
  its reads onto the never-cache API seams, so its shells ride the SWR cache (ADR-0031's #448
  amendment) and this limit no longer reaches them.
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
3. **The surfaces audit left a short list, and none of it is a promise.**
   [`offline-surfaces-audit.md`](offline-surfaces-audit.md) checked every route against the table above
   and every ADR-0031 surface for the needs-connection state it promises. It closed the three that were
   misreporting a connection failure — consultation availability, the media downloader, Web Push — and
   filed the rest. In-page states for auth, admin and MCP (#368) have since landed, with the
   per-surface decision recorded in the ADR-0031 amendment; the silent read-failure of a pull (#369)
   remains open. The account diagnostics view and "Remove this device's copy" that it filed as #370 now
   live in `/device` (ADR-0070). The mechanical leftovers (Community's read failures, one raw error
   string) are recorded there with the file that shows each.

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

| Request                                                                        | Strategy                                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| App shell, icons, fonts                                                        | cache-first                                                                |
| Public navigation / RSC payloads                                               | stale-while-revalidate (+ "updated X ago")                                 |
| Auth + account document shells                                                 | stale-while-revalidate (#447, #448; shell only, no account-bearing render) |
| Public read APIs that declare `public`                                         | SWR; an absent header is not permission                                    |
| Auth APIs and the OAuth callback, mutations, admin, push, `no-store`/`private` | never cache                                                                |

Account-scoped reads are `no-store` by construction at the authenticated seam, and the Quran sync
read is also on the never-cache list — a signed-in reader's bookmarks and position never enter Cache
Storage (#392). `scripts/__tests__/api-cache-contract.test.ts` fails an API GET route that is neither
on the never-cache list nor explicitly `no-store`/`public`.

Cache Storage is bounded in bytes and evicted least-recently-used first, with the offline page and
the current build's static assets pinned; sign-out purges the runtime cache except that shell, and
never touches the Local Store or Outbox ([ADR-0069](../adr/0069-the-public-cache-has-a-byte-budget.md), #394).

The build's public static routes are precached as HTML documents at install, derived from the build's
own route manifests and bounded to 6 MB (or what the cache budget has left), so a deep link to a route
this device never opened still paints its own shell offline
([ADR-0071](../adr/0071-the-public-route-shells-are-precached.md), #395). Dynamic detail routes,
account tools and every never-cache prefix stay out.

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

## UX

Instant local render (no blocking spinners on owned data), optimistic mutations, a persistent
online/offline + pending-count pill ("syncing…", "failed — retry"), per-item delivery badges, an
outbox/diagnostics view at `/device` — reachable from `/account`, cached so it works with the radio off
(ADR-0070) — and route View Transitions. On Android the same states must
survive the app being killed and relaunched, and a battery-optimization exemption is asked for at the
moment it matters — with the reason stated, since the request is otherwise opaque.

## Phases

**Phase 0 of the "never show `/offline`" roadmap (#447) landed on 2026-10-21.** Three diffs close the
most-complained paths without touching the dashboard architecture: a ten-second deadline for every
cold load (the limit above), the auth shells in the SWR cache with their forms answering offline
submits inline (ADR-0031's amendment; the shells join ADR-0071's precache), and the Android shell's
fallback page recovering exactly once when the radio returns (ADR-0067's amendment). With it,
`/offline` ends up serving only a brand-new install hit with no network, and `/admin`.

**Phase 1 (#448) landed the same day:** the `/account` subtree's shells joined the SWR cache. The
layout is no longer dynamic (`headers()` moved into `AccountFooter`), the guarded children guard
on the client through the session provider, `/account/posts` reads its feed through the
never-cache `/api/me/posts` seam, and the account views render the shared needs-connection state
for a failed read instead of routing the failure to `/offline`. The boundary the audit guards —
no account fragment in a cached response — is held by the never-cache API prefixes, not by the
documents.

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

  What is **not** proven here, on purpose: `lead-offline.spec.ts` has the same shape for a Project
  Request but is left out of the workflow because it writes a row the suite cannot remove against the
  live project; consultation booking is online-only and its spec asserts the needs-connection state,
  not a resume; and `spendtrack-multidevice.spec.ts` (a delete converging on a second device) is a
  flag-gated local run, not a CI job, because two devices need the device matrix in phase 7. Sign-ins
  are paced by `e2e/sign-in.ts` — five attempts per email per minute is a product limit the suite has
  to live under, not a flag to switch off.

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
