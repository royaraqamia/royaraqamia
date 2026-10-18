# Spec: Offline-first web and Android app

**Status:** accepted.
**Decisions:** ADR-0027 … ADR-0031, ADR-0058 … ADR-0061. Vocabulary: `CONTEXT.md` → _Offline_.

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

| Surface                                                               | Offline read                    | Offline write |
| --------------------------------------------------------------------- | ------------------------------- | ------------- |
| Public content (Community, Rates, Certificates/Verify, Showcase)      | Yes — SWR cache                 | No            |
| Scanner (decodes on the device; owns no server surface)               | Yes — once the engine is cached | No            |
| Account tools — HabitFlow, SpendTrack, LinkSnap, BlogPress            | Yes — from Local Store          | Yes — Outbox  |
| Non-inventory leads — Training Application, Project Request, Retainer | n/a                             | Yes — Outbox  |
| Consultation Booking (reserves Availability Slots)                    | cached availability read-only   | No            |
| Auth, Push, Media Downloader, Rates refresh, MCP, Admin               | No                              | No            |

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

## Where we are today

Honest list of what stands between us and the bar, each with the file that shows it:

1. **No web Background Sync.** `public/sw.js` has no `sync` event listener and nothing calls
   `registration.sync.register`, so a closed Chromium tab flushes nothing — even though the ADR-0029
   note implies Background Sync is in use.
2. **The Android shell has no background path.** It is a remote-URL WebView (ADR-0036) whose manifest
   declares no `<service>`, no `<receiver>`, and none of `FOREGROUND_SERVICE`,
   `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` or a battery-optimization exemption. When the app is
   backgrounded or killed, the WebView and its service worker stop, so nothing flushes until the user
   reopens the app.
3. **Flush-on-write exists in one product of five.** BlogPress flushes from `subscribeWrites`; HabitFlow
   (`use-habit-sync.ts`), SpendTrack (`use-spendtrack.ts`), LinkSnap (`use-linksnap.ts`) and Leads
   (`use-lead-submission.ts`) subscribe only to re-render, so an _online_ write can sit pending until
   the next focus or reload.
4. **Durable storage is only requested on install.** `requestPersistentStorage()` is wired to
   `appinstalled` alone (`use-pwa.ts`), so an ordinary tab user's Outbox stays evictable.
5. **The offline e2e suite never runs in CI.** Every `e2e/*-offline.spec.ts` is `test.skip(!ENABLED)`
   behind its own env flag, and no workflow sets one — so sync-resume, the single property that
   matters most, is verified only by jsdom unit tests and manual runs.

## Architecture

1. **Local Store** — one durable IndexedDB database per identity (`guest` | `user:<id>`), per product.
   Holds Owned data and the Outbox. Forward-only, additive migrations (native IDB `version` +
   `onupgradeneeded`).
2. **Outbox** — ordered intents replayed to the server. Client-minted UUIDv7 `client_id`, idempotent
   upserts, tombstones for deletes, exponential backoff + jitter, surfaced permanent failures. It is
   the **only** writer to the server; nothing else in this spec is allowed to become a second one.
3. **Service worker** (`public/sw.js`, grown not replaced) — cache tiers + the never-cache list, plus
   the `sync` handler for web Background Sync. `activate` touches Cache Storage only, never
   IndexedDB.
4. **Sync coordination** — Web Locks leader for flushing; BroadcastChannel for cross-tab
   invalidation. Triggers are now three tiers, in the order they are worth relying on:
   1. **In-page** — `online` / `visibilitychange` / focus / manual retry. Present today, and the
      fallback everywhere.
   2. **Web Background Sync** — a Chromium tab's service worker flushes with the tab closed
      (ADR-0058). Absent in Safari and Firefox, where tier 1 is the whole story.
   3. **Native Android** — a silent high-priority FCM data message wakes a WorkManager job that drains
      the Outbox (ADR-0059). This is the only tier that works with the app killed.
5. **Sync hints** (ADR-0060) — server→client signals that there is new data to pull: Supabase Realtime
   `postgres_changes` while foregrounded, and the FCM data message while backgrounded. A hint triggers
   a **pull**, never a blind merge; conflict resolution stays last-write-wins on `updated_at`.

### Cache tiers

| Request                                            | Strategy                                   |
| -------------------------------------------------- | ------------------------------------------ |
| App shell, icons, fonts                            | cache-first                                |
| Public navigation / RSC payloads                   | stale-while-revalidate (+ "updated X ago") |
| Public read APIs                                   | SWR with max-age                           |
| Auth, mutations, admin, push, `no-store`/`private` | never cache                                |

### Delivery states

Property 3 needs a per-item state a user can read at a glance, the way a messenger's clock and ticks
work: **queued** (durable, not yet acknowledged), **sent** (server accepted), **failed** (permanent,
with retry). The Outbox already distinguishes these; the work is to surface them per item everywhere,
not only as a count.

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

## Identity & auth

- Network failure is **never** a logout; the cached session keeps the shell signed in, and only
  server-bound actions show "needs connection".
- **Claim on sign-in:** guest rows move into the account namespace and are pushed (dedupe by
  `client_id`, LWW merge).
- Sign-out keeps the account namespace on disk; `/account` offers **"Remove this device's copy"**.
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
outbox/diagnostics view under `/account`, and route View Transitions. On Android the same states must
survive the app being killed and relaunched, and a battery-optimization exemption is asked for at the
moment it matters — with the reason stated, since the request is otherwise opaque.

## Phases

0. **Baseline** — this spec, ADR-0058 … ADR-0061, and the `CONTEXT.md` vocabulary.
1. **Close the web gaps** — flush-on-write in all five products, `persist()` on a real save, and the
   offline suite running in CI.
2. **Web Background Sync** — the `sync` handler plus registration from the write path, with flush-on-open
   as the documented fallback where the API is absent (ADR-0058).
3. **Sync hints** — Realtime for owned data while foregrounded, pulling on a hint (ADR-0060).
4. **Remaining surfaces** — audit every route against the table; bring the feasible leftovers offline
   and give each ADR-0031 surface a legible needs-connection state.
5. **Android background sync** — FCM data wake, WorkManager drain, battery-exemption UX, delivery
   badges in the shell (ADR-0059).
6. **Android launch** — extend the launch theme into the app's own chrome skeleton so cold start reads
   as content arriving, staying stateless and OTA-free (ADR-0061).
7. **Verify and harden** — the device matrix below, chaos tests, and the offline suite as a CI gate.

## Verification

- **Offline e2e in CI:** `context.setOffline(true)`, `serviceWorkers: 'allow'`, asserting cached read,
  offline write and **sync-resume** (offline → mutate → reconnect → server state correct) — per product
  family, not behind a flag that no workflow sets.
- **Android device matrix**, on real hardware: app backgrounded, app force-stopped, doze, process death
  mid-flush, no network at launch, low storage/quota, worker swap mid-queue, multiple tabs.
- **Unit tests:** Outbox, IndexedDB repositories, migration chains, the sync engine's ordering and
  backoff, the SW `sync` handler, and the FCM wake payload.
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
