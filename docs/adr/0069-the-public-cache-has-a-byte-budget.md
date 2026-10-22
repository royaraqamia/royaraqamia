# The public cache has a byte budget and releases sign-out's account data

The service worker wrote every public page, RSC payload, image width and search
query into Cache Storage and never removed one. The browser's answer to filling
the origin quota is to evict the whole origin, which also reaches the Local Store
when storage is not persistent. The spec promises a ~150 MB public cache with LRU
eviction (#394), so the worker now counts bytes and evicts before that pressure
becomes the browser's decision.

## How the budget is enforced

Cache Storage exposes neither an access time nor a per-entry byte count, and
`navigator.storage.estimate()` reports the whole origin rather than our entries.
The worker therefore keeps an index in its own `royaraqamia-cache-meta` cache:
one JSON entry mapping URL → `{ size, lastAccess }`. The index is a sibling cache,
not a key in the runtime cache, because `caches.match()` searches every cache and
would otherwise be able to serve the bookkeeping.

- **Size** is the response body: `Content-Length` when the server sent one,
  otherwise the bytes of a cloned body. Headers alone would miss the common
  streamed response; reading the response itself would consume it.
- **Access** is stamped by every cache hit. Touches are collected in memory and
  folded into the index on the next write, so answering a read never waits on a
  disk write. A touch lost to worker termination only leaves LRU slightly
  optimistic.
- **Writes** are booked after `cache.put` and immediately trigger enforcement.
  `activate` rebuilds the index from what the caches actually hold, so entries
  written by an older worker or a dropped bookkeeping pass are counted before
  they are served.
- **Eviction** runs oldest access first until the accounted bytes reach 90% of
  the budget. Stopping exactly at the ceiling would make the next write evict
  again, turning a page view into an eviction per cache miss.

A promise chain in the worker realm serialises the read-modify-write. Cache
Storage has no atomic counter to race on, and concurrent fetch handlers must not
book the same write twice or evict while another write is mid-flight.

## What is never evicted

The offline page, the app-shell precache paths, and the current build's static
assets (`/_next/static/`, fonts, icons) are pinned. The offline page is the only
legible surface with no network; a hashed static chunk belongs to the build that
is already running. Their size is bounded by the build, not by browsing. If only
pinned entries remain over budget the worker logs it and stops: evicting the
shell would be the worse failure.

The Local Store and Outbox are IndexedDB and are never opened by cache
maintenance. A test shim makes any IndexedDB call throw, so a future maintenance
path cannot quietly gain one.

## Sign-out

`signOutSession()` and `logout()` ask the worker to purge before the session
ends; session expiry does the same from the auth listener. The worker deletes
every entry in the runtime cache except the offline page, the manifest and the
icons — pages, RSC payloads and public API reads may have been rendered for the
signed-in caller. `STATIC_CACHE` is build output rather than data and survives, so
the app remains usable offline; the push-preference marker is this device's
setting and survives too. The page waits at most two seconds for the
acknowledgement, because a purge must never make a sign-out hang.

The durable per-identity copy in IndexedDB is deliberately untouched: sign-out
keeps it by design, and removing it is #370's "Remove this device's copy".

## Consequences

`scripts/__tests__/sw.test.mjs` runs the real worker against a fake Cache Storage
and proves the budget under page churn, LRU order (a touched page outlives the
untouched one), the pinned set, and the sign-out purge. The budget is read from
`self.CACHE_BUDGET_BYTES` so a test can shrink it; production takes the 150 MB
constant.

The index adds one small Cache Storage entry and one write per cache miss. It is
rebuilt on every `activate`, so a corrupt or stale index costs a scan, not a
correctness failure.

## Amendment (2026-10-22, #488): the cache is named by schema, not by release

The caches used to be named from the build: `CACHE = self.CACHE_VERSION`
(`royaraqamia-v1.131.2-3118eaef`) and `STATIC_CACHE` from the commit suffix. Since
`activate` deletes every name that is not the current one, **every release threw
the whole offline library away** — each visited detail page, RSC payload, image
width and chunk — and fetched the route shells again on the next install. That is
why `/offline` reappeared after releases and why a release felt heavier than it
should. WhatsApp does not invalidate its local store on a version bump either.

- **The names are the schema**: `royaraqamia-data-v1` and `royaraqamia-static-v1`,
  from `CACHE_SCHEMA` in `public/sw.js`. A release reuses both; only bumping
  `CACHE_SCHEMA` — a change to the layout of what is stored — discards them.
  `CACHE_VERSION` keeps its job as the build identity that makes a new worker
  install and announce itself (ADR-0039, ADR-0042); it no longer names a cache.
- **Every entry carries its build.** `store()` (and the install precache) writes
  the response with an `x-sw-build` header set to the current `CACHE_VERSION`. The
  stamp lives inside the entry, so it survives `rebuildIndex` — a rebuilt index
  can never make a previous build's document look current.
- **A hit from another build is served and refreshed.** Paint is instant and
  unchanged; the background revalidation now asks with `cache: 'no-cache'`, so
  after a release the refresh reaches the server instead of accepting an
  HTTP-cache copy of the document that produced the stale copy.
- **Install skips what this build already holds.** `precacheRoutes` reads the
  cached entry's stamp first: an install that repeats (a re-registered worker, a
  `CACHE_URLS` message) fetches nothing, and a new build refreshes the routes once.
  Unchanged shells still revalidate rather than re-transfer; moving that refresh
  off the install event entirely is #489.
- **Eviction knows which build is in front of the user.** Entries stamped with an
  older build are evicted before the current build's, and `/_next/static/**` is
  pinned only for the current build. Old chunks stay until LRU pressure, because a
  document cached at build N still references them — that is the point of keeping
  the store — but they are not pinned forever, which a schema-named cache would
  otherwise have made them.

The one-time cost is the transition: the first worker carrying this change finds
the old build-named caches, deletes them, and builds the store again. Every
release after it keeps what the device already has.
