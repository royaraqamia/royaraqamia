# Spec: Offline-first web app

**Status:** draft — awaiting confirmation before implementation.
**Decisions:** ADR-0027 … ADR-0031. Vocabulary: `CONTEXT.md` → _Offline_.

## Goal

Make the web app usable — and where logically possible writable — with no network, in an ordinary
browser tab and an installed PWA, so it feels like a native app on intermittent, metered
connections. Success: the app opens to last-known data instantly, works with the radio off, and no
user action is ever lost.

## Non-goals

- Making server-bound features work offline (Media Downloader, rate refresh, MCP, Admin, auth,
  push). They keep a clear "needs connection" state.
- A CRDT / true multi-writer merge. Owned data is single-owner.
- Gating offline writes behind PWA installation.

## Scope

| Surface                                                               | Offline read                  | Offline write |
| --------------------------------------------------------------------- | ----------------------------- | ------------- |
| Public content (Community, Rates, Certificates/Verify, Showcase)      | Yes — SWR cache               | No            |
| Account tools — HabitFlow, SpendTrack, LinkSnap, BlogPress            | Yes — from Local Store        | Yes — Outbox  |
| Non-inventory leads — Training Application, Project Request, Retainer | n/a                           | Yes — Outbox  |
| Consultation Booking (reserves Availability Slots)                    | cached availability read-only | No            |
| Auth, Push, Media Downloader, Rates refresh, MCP, Admin               | No                            | No            |

## Architecture

1. **Local Store** — one durable IndexedDB database per identity (`guest` | `user:<id>`), per
   product. Holds Owned data and the Outbox. Forward-only, additive migrations (native IDB
   `version` + `onupgradeneeded`).
2. **Outbox** — ordered intents replayed to the server. Client-minted UUIDv7 `client_id`, idempotent
   upserts, tombstones for deletes, exponential backoff + jitter, surfaced permanent failures.
3. **Service worker** (`public/sw.js`, grown not replaced) — cache tiers + Background Sync hook +
   the never-cache list. `activate` touches Cache Storage only, never IndexedDB.
4. **Sync coordination** — Web Locks leader for flushing; BroadcastChannel for cross-tab
   invalidation; triggers on `online` / `visibilitychange` / focus / manual retry.

### Cache tiers

| Request                                            | Strategy                                   |
| -------------------------------------------------- | ------------------------------------------ |
| App shell, icons, fonts                            | cache-first                                |
| Public navigation / RSC payloads                   | stale-while-revalidate (+ "updated X ago") |
| Public read APIs                                   | SWR with max-age                           |
| Auth, mutations, admin, push, `no-store`/`private` | never cache                                |

### Data contract

Owned tables gain additive columns:

```
client_id   uuid    -- unique per user
updated_at  timestamptz
deleted_at  timestamptz null
```

Endpoints for owned records become idempotent upserts keyed on `(user_id, client_id)`; deletes set
`deleted_at`. RLS stays user-scoped; native clients never use the service role. `shared/contracts`
Zod schemas grow the same fields.

## Rendering

Owned data renders from the Local Store: hydrate IndexedDB → paint → refresh from the server in the
background. Server loaders remain the initial seed/warm path. Shared/read data stays RSC, served
from the SW cache.

## Identity & auth

- Network failure is **never** a logout; the cached session keeps the shell signed in, and only
  server-bound actions show "needs connection".
- **Claim on sign-in:** guest rows move into the account namespace and are pushed (dedupe by
  `client_id`, LWW merge).
- Sign-out keeps the account namespace on disk; `/account` offers **"Remove this device's copy"**.
- Token refresh is deferred until reconnection.

## Storage & telemetry

- `navigator.storage.persist()` requested after a real save/install gesture; denial honoured.
- Public cache capped (~150 MB) with LRU eviction; **owned data and Outbox are never evicted**.
- Analytics/errors are best-effort, bounded, droppable; they share none of the Outbox guarantees.

## UX

Instant local render (no blocking spinners on owned data), optimistic mutations, a persistent
online/offline + pending-count pill ("syncing…", "failed — retry"), per-item pending badges, an
outbox/diagnostics view under `/account`, and route View Transitions.

## Phases

0. Harden the SW shell + `storage.persist` + cache tiers + never-cache list.
1. **HabitFlow** as the reference implementation: IndexedDB repository, Outbox, Background Sync,
   sync UX. (Its existing guest `local` mode is the seed.)
2. SpendTrack, LinkSnap, BlogPress.
3. Lead-form Outbox (Training, Project Request, Retainer).
4. Public-content SWR caching + "updated X ago".

## Verification

- **Playwright offline suite**: `context.setOffline(true)`, `serviceWorkers: 'allow'`; assert cached
  read, offline write, and **sync-resume** (offline → mutate → reconnect → server state correct).
- Unit tests: Outbox, IndexedDB repositories, migration chains.
- Gates: `npx tsc --noEmit`, `npm run lint`, `npm test` (+ the new suites) in CI.

## Open questions

1. **BlogPress media upload** cannot queue offline — drafts queue, images need a live upload. What
   is the offline state of an un-uploaded image?
2. **Community compose/publish** offline: queue drafts, or online-only?
3. **LinkSnap analytics** are server-side; offline visits cannot be counted. Accept, or buffer?
4. **Rates** offline: last snapshot read-only with "refresh" disabled — confirm the affordance.
5. **Consultation availability** cached read-only offline — needed at all?
