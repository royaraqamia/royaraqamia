try { importScripts('/sw-version.js'); } catch { self.CACHE_VERSION = 'royaraqamia-dev'; }
try { importScripts('/sw-push-config.js'); } catch { self.PUSH_CONFIG = null; }
try { importScripts('/sw-routing.js'); } catch { self.SWRouting = self.SWRouting || null; }
// Generated after `next build` from the routes the build actually prerendered.
// Absent in dev/test runs, where the worker keeps to its fixed shell.
try { importScripts('/sw-precache.js'); } catch { self.PRECACHE_ROUTES = []; }
try { importScripts('/sw-outbox.js'); } catch { self.SWOutbox = self.SWOutbox || null; }
// The cache names carry the cache's *schema*, not the build (#488). `activate`
// deletes every name that is not current, so a build-derived name made each
// release discard the whole offline library — every visited page, RSC payload,
// image width and chunk — and fetch the shells again. A schema name survives a
// release, and bumping `CACHE_SCHEMA` is the one thing that clears the store.
const CACHE_SCHEMA = 'v1';
const CACHE = `royaraqamia-data-${CACHE_SCHEMA}`;
const STATIC_CACHE = `royaraqamia-static-${CACHE_SCHEMA}`;
// The build that produced a cached response. `CACHE_VERSION` still changes per
// deployment — it is what makes a new worker install and announce itself
// (ADR-0039) — but it now identifies entries rather than naming a cache.
const BUILD_ID = self.CACHE_VERSION || 'dev';
const BUILD_HEADER = 'x-sw-build';
const FALLBACK_URL = '/offline';

// The deadline a cold SWR request gets (#447, documented in
// docs/specs/offline-first.md): the network must answer within it or the
// response gives way to the fallback, so a slow-but-alive connection cannot hang
// the document for the browser's own several-minute timeout. A cached copy is
// never behind this deadline — stale paint is instant — and a fetch the deadline
// cuts keeps running in the background, so a late answer still lands in the
// cache and the next visit gets the real page. A test may shrink it through the
// same realm global; production always takes 10000.
const NAVIGATION_TIMEOUT_MS = self.NAVIGATION_TIMEOUT_MS || 10_000;

// Field telemetry (ADR-0074, #474). `/offline` serves are counted by the door
// that led to them, and the cache outcomes tallied since the last report ride
// along with the next serve — so the volume is bounded by how often the offline
// page is actually shown, which the roadmap says is almost never. The payload is
// a door class and three tallies: never a URL, a user, a client id or a
// timestamp. A beacon cannot leave a device that is truly offline, so an
// undelivered report is kept and retried on the next request that reaches the
// network (ADR-0074's amendment); it is still droppable, and still a field
// signal rather than an audit. The sink is a Vercel log line a maintainer greps
// and a Sentry issue per door (spec: docs/specs/offline-first.md, "Storage &
// telemetry").
const OFFLINE_REPORT_PATH = '/api/offline-serve';
const OFFLINE_REPORT_VERSION = 1;
// One small entry, so it is outside the cache budget and survives a worker
// version change: `activate` keeps this name like the push-preference marker.
const OFFLINE_REPORT_STORE = 'royaraqamia-offline-report';
const OFFLINE_REPORT_KEY = '/__sw_offline_report__';
const OFFLINE_REPORT_RETRY_MS = self.OFFLINE_REPORT_RETRY_MS ?? 5 * 60_000;

const cacheOutcomes = { hits: 0, misses: 0, failures: 0 };

// A transparent 1x1 SVG, used when an image variant has no cache entry at all.
// The `img` box is fixed by the markup (a `fill` container or explicit
// width/height), so the placeholder holds the layout and the browser never draws
// its broken-image glyph. The intrinsic size stays 1x1 on purpose: a larger one
// would imply an aspect ratio the caller never asked for.
const IMAGE_PLACEHOLDER = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
// Stable cache key for "any rendering of this image source". Responsive images
// are cached per width, so without it a width first used offline has no entry.
const IMAGE_FALLBACK_PATH = '/__sw-image-fallback';

// Content hash of the generated PWA/favicon assets (see scripts/generate-icons.mjs).
// Appending it to every asset URL means a new build publishes new URLs, so a
// client's HTTP/PWA/favicon cache can never answer with the previous artwork —
// no "clear site data" needed. Left empty in raw clone/test runs.
const ASSET_VERSION = self.ASSET_VERSION || '';
const ASSET_QUERY = ASSET_VERSION ? `?v=${ASSET_VERSION}` : '';

const PRECACHE_URLS = [
  '/',
  FALLBACK_URL,
  `/manifest.json${ASSET_QUERY}`,
  `/icons/icon-192x192.png${ASSET_QUERY}`,
  `/icons/icon-512x512.png${ASSET_QUERY}`,
  `/icons/notification-icon-192x192.png${ASSET_QUERY}`,
  `/icons/badge-icon-96x96.png${ASSET_QUERY}`,
];

// Public static route shells (#395, ADR-0071). Generated from the build's own
// route manifests, so this is whatever the current build prerendered — never a
// hand-maintained list and never a dynamic detail route. Deduped and limited to
// same-origin paths here as a last guard against a malformed generated file.
const PRECACHE_ROUTES = Array.isArray(self.PRECACHE_ROUTES)
  ? [...new Set(self.PRECACHE_ROUTES)].filter(
      (route) => typeof route === 'string' && route.startsWith('/') && !route.startsWith('//')
    )
  : [];

// Install-time ceiling for those shells, bytes. The public cache's own budget
// (below) still wins: the worker only spends what is left of it. ADR-0071
// documents both numbers and why the list carries HTML shells only.
const ROUTE_PRECACHE_BUDGET_BYTES = self.ROUTE_PRECACHE_BUDGET_BYTES || 6 * 1024 * 1024;

// The public cache's byte ceiling (ADR-0069). A test may shrink it through the
// same realm global; production always takes the spec's ~150 MB.
const CACHE_BUDGET_BYTES = self.CACHE_BUDGET_BYTES || 150 * 1024 * 1024;
// Evicting exactly to the ceiling leaves the next write one byte over it, so a
// pass trims to 90% and churn pays for one large read rather than every write.
const CACHE_EVICT_TO = 0.9;
// Size/access bookkeeping lives in its own cache: Cache Storage exposes no
// metadata, and a sibling entry in `CACHE` would be served by `caches.match`.
const CACHE_META_NAME = 'royaraqamia-cache-meta';
const CACHE_META_KEY = '/__sw_cache_index__';
const CACHE_META_VERSION = 1;

const PRECACHE_PATHS = new Set(
  [...PRECACHE_URLS, ...PRECACHE_ROUTES].map((url) => new URL(url, self.location.origin).pathname)
);

// Precaching is best-effort per URL. `cache.addAll` is all-or-nothing: one 404
// would reject the install and leave the previous worker in place forever, so
// every URL is fetched independently and failures are only reported.
//
// The response is written through `stampBuild` rather than `cache.add`, so a
// pinned entry carries the build that produced it like every other entry the
// worker writes. `no-cache` revalidates: an unchanged shell answers from the
// HTTP cache instead of transferring again.
async function precache(cache, urls) {
  const failed = [];
  const stored = [];
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await cache.put(url, stampBuild(response));
        stored.push(url);
      } catch {
        failed.push(url);
      }
    })
  );
  if (failed.length > 0) console.log('[sw] precache failed:', failed.join(', '));
  await recordCachedEntries(cache, stored);
}

// The route shells are fetched one at a time so the budget can stop the list
// before an entry is written. A single failed route is logged and skipped; it
// never blocks the rest. `cache.add` cannot do this because it gives no answer
// about the response's size until after it has already stored it.
async function precacheRoutes(cache, urls) {
  if (urls.length === 0) return;

  let budget = ROUTE_PRECACHE_BUDGET_BYTES;
  try {
    const accounted = await withIndex(async (index) => accountedBytes(index));
    budget = Math.min(ROUTE_PRECACHE_BUDGET_BYTES, Math.max(0, CACHE_BUDGET_BYTES - accounted));
  } catch (error) {
    // The index is an optimisation. If it cannot be read, the install-time
    // ceiling still bounds the list; `recordEntry` enforces the cache budget.
    console.log('[sw] route precache budget read failed', String(error));
  }

  let spent = 0;
  let stoppedAt = urls.length;
  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    if (spent >= budget) {
      stoppedAt = index;
      break;
    }
    try {
      const parsed = new URL(url, self.location.origin);
      if (parsed.origin !== self.location.origin || isNeverCache(parsed)) continue;
      // A shell this build already holds needs no request at all: the cache
      // survives a release, so an install that repeats (a re-registered worker,
      // a `CACHE_URLS` message) costs nothing. A new build finds the previous
      // build's stamp and refreshes the route.
      const existing = await cache.match(url);
      if (existing && buildOf(existing) === BUILD_ID) continue;
      // `no-cache` revalidates against the server instead of letting a stale
      // HTTP-cache copy of a previous build become this build's shell.
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) {
        console.log('[sw] route precache failed:', url, response.status);
        continue;
      }
      if (!isCacheable(response)) {
        console.log('[sw] route precache skipped (not cacheable):', url);
        continue;
      }
      const size = await sizeOf(response);
      if (spent + size > budget) {
        stoppedAt = index;
        break;
      }
      await cache.put(url, stampBuild(response));
      await recordEntry(cacheKeyOf(url), size);
      spent += size;
    } catch (error) {
      // A failed URL must not reject `install`: that would leave the previous
      // worker in place, and every other route it fetches goes to waste.
      console.log('[sw] route precache failed:', url, String(error));
    }
  }

  if (stoppedAt < urls.length) {
    console.log(
      '[sw] route precache budget reached; skipped:',
      urls.slice(stoppedAt).join(', ')
    );
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await precache(cache, PRECACHE_URLS);
      await precacheRoutes(cache, PRECACHE_ROUTES);
    })()
  );
});

const PUSH_PREF_CACHE = 'royaraqamia-push-prefs';

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Only a schema bump (or the one-off move off the build-derived names
      // this replaced) changes one of these, so a release deletes nothing and
      // the offline library it was built on survives it (#488).
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (
            key !== CACHE &&
            key !== STATIC_CACHE &&
            key !== PUSH_PREF_CACHE &&
            key !== CACHE_META_NAME &&
            key !== OFFLINE_REPORT_STORE
          ) {
            return caches.delete(key);
          }
        })
      );
      // After the stale caches are gone, count what survived (and what the
      // previous worker wrote without bookkeeping) before serving from it.
      await rebuildIndex();
    })()
  );
  self.clients.claim();
});

// Routing rules live in `sw-routing.js` (loaded above) so they can be unit
// tested outside the worker realm.
const {
  isNavigationRequest,
  isNextStaticAsset,
  isRSCPayload,
  isFont,
  isIcon,
  isImage,
  isNextImage,
  isApiCall,
  isCacheable,
  isPubliclyCacheable,
  isNeverCache,
} = self.SWRouting;

// ---------------------------------------------------------------------------
// Cache budget and LRU eviction (ADR-0069)
//
// Cache Storage has no access time and no per-entry byte count, so the worker
// keeps both in a small index entry beside the data. Reads touch the index in
// memory; the next write folds those touches in and evicts oldest-first until
// the accounted bytes fit. Local Store and Outbox live in IndexedDB and are not
// reachable from anything in this section — cache maintenance only ever calls
// `caches`.
// ---------------------------------------------------------------------------

function cacheKeyOf(input) {
  const raw = typeof input === 'string' ? input : (input && input.url) || String(input);
  try {
    return new URL(raw, self.location.origin).href;
  } catch {
    return raw;
  }
}

// The body, not the headers, is what fills the quota. `Content-Length` is the
// cheap answer when the server sent one; otherwise the body is measured. Both
// run on a clone, so the response can still be stored and served afterwards.
async function sizeOf(response) {
  if (!response) return 0;
  try {
    const declared =
      response.headers && typeof response.headers.get === 'function'
        ? response.headers.get('content-length')
        : null;
    const size = declared === null ? NaN : Number(declared);
    if (Number.isFinite(size) && size >= 0) return size;
    if (typeof response.clone !== 'function') return 0;
    const body = await response.clone().arrayBuffer();
    return body.byteLength;
  } catch {
    return 0;
  }
}

function emptyIndex() {
  return { version: CACHE_META_VERSION, entries: {} };
}

async function readIndex() {
  try {
    const meta = await caches.open(CACHE_META_NAME);
    const stored = await meta.match(CACHE_META_KEY);
    if (!stored) return emptyIndex();
    const parsed = await stored.json();
    if (
      !parsed ||
      parsed.version !== CACHE_META_VERSION ||
      !parsed.entries ||
      typeof parsed.entries !== 'object'
    ) {
      return emptyIndex();
    }
    return parsed;
  } catch {
    return emptyIndex();
  }
}

async function writeIndex(index) {
  try {
    const meta = await caches.open(CACHE_META_NAME);
    await meta.put(
      CACHE_META_KEY,
      new Response(JSON.stringify(index), {
        headers: { 'content-type': 'application/json' },
      })
    );
  } catch (error) {
    // Bookkeeping is an optimisation; losing it costs a rebuild, not a fetch.
    console.log('[sw] cache index write failed', String(error));
  }
}

let maintenance = Promise.resolve();
let accessClock = Date.now();
const pendingTouches = new Map();

function stampAccess() {
  accessClock = Math.max(Date.now(), accessClock + 1);
  return accessClock;
}

// A served hit is remembered in memory, never awaited: answering a read must
// not wait on a disk write. A touch dropped by worker termination only makes
// LRU slightly optimistic; it cannot lose an entry the index still lists.
function touchCache(input) {
  pendingTouches.set(cacheKeyOf(input), stampAccess());
}

// Holds a lock across the whole read-modify-write in this worker realm. Cache
// Storage has no atomic counter, so a shared promise chain is what keeps two
// concurrent fetches from booking a write twice or evicting mid-write.
function withIndex(mutate) {
  const run = async () => {
    const index = await readIndex();
    for (const [key, at] of pendingTouches) {
      const entry = index.entries[key];
      if (entry && at > entry.lastAccess) entry.lastAccess = at;
    }
    pendingTouches.clear();
    const result = await mutate(index);
    await writeIndex(index);
    return result;
  };
  const next = maintenance.then(run, run);
  maintenance = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

// The offline page and the build's own static assets are never evicted: the
// page is the only legible surface with no network, and a hashed `_next/static`
// chunk belongs to the build already shipped. Their size is bounded by the
// build rather than by how much the user browses.
//
// Since the caches outlive a release, "the build" has to be read from the entry
// rather than from the cache name: a chunk stamped with an older build is still
// content-addressed and still valid for the document that references it, but it
// is also the only copy of one, so it is evictable and goes first when the store
// is over budget (`enforceBudget`).
function isPinned(key, entry) {
  let url;
  try {
    url = new URL(key);
  } catch {
    return false;
  }
  if (url.pathname === FALLBACK_URL) return true;
  if (url.pathname.startsWith('/_next/static/')) return Boolean(entry) && entry.build === BUILD_ID;
  if (isFont(url) || isIcon(url)) return true;
  return PRECACHE_PATHS.has(url.pathname);
}

async function removeEntry(key) {
  await Promise.all(
    [CACHE, STATIC_CACHE].map(async (name) => {
      try {
        const cache = await caches.open(name);
        if (await cache.match(key)) await cache.delete(key);
      } catch (error) {
        console.log('[sw] cache delete failed', String(error));
      }
    })
  );
}

function accountedBytes(index) {
  let total = 0;
  for (const key of Object.keys(index.entries)) {
    total += index.entries[key].size || 0;
  }
  return total;
}

// Marks a cached response with the build that produced it. The header lives
// inside the entry, so the stamp survives `rebuildIndex` without a second index
// write, and a hit can tell this build's document from one a release left
// behind.
function stampBuild(response) {
  try {
    const stamped = new Response(response.body, response);
    stamped.headers.set(BUILD_HEADER, BUILD_ID);
    return stamped;
  } catch {
    return response;
  }
}

function buildOf(response) {
  try {
    return (response && response.headers && response.headers.get(BUILD_HEADER)) || '';
  } catch {
    return '';
  }
}

// Oldest access first; pinned entries are skipped even when they are the oldest.
// If only pinned entries remain the budget cannot be met, and evicting the
// offline page or the current build would be the worse failure: it is logged.
async function enforceBudget(index) {
  let total = accountedBytes(index);
  if (total <= CACHE_BUDGET_BYTES) return;

  const target = Math.floor(CACHE_BUDGET_BYTES * CACHE_EVICT_TO);
  const candidates = Object.keys(index.entries)
    .filter((key) => !isPinned(key, index.entries[key]))
    .sort((a, b) => {
      // A previous build's entry goes before this build's, so the store drifts
      // towards the build in front of the user instead of holding two.
      const stale = (entry) => (entry.build === BUILD_ID ? 0 : 1);
      const byBuild = stale(index.entries[b]) - stale(index.entries[a]);
      if (byBuild !== 0) return byBuild;
      const byAccess = (index.entries[a].lastAccess || 0) - (index.entries[b].lastAccess || 0);
      return byAccess !== 0 ? byAccess : a.localeCompare(b);
    });

  for (const key of candidates) {
    if (total <= target) break;
    const size = index.entries[key].size || 0;
    await removeEntry(key);
    delete index.entries[key];
    total -= size;
  }

  if (total > CACHE_BUDGET_BYTES) {
    console.log('[sw] cache budget exceeded by pinned entries', total, CACHE_BUDGET_BYTES);
  }
}

async function recordEntry(key, size, build = BUILD_ID) {
  await withIndex(async (index) => {
    index.entries[key] = { size, lastAccess: stampAccess(), build };
    await enforceBudget(index);
  });
}

// Books the pinned and route entries `precache` writes directly, which have a
// size and a stamp but no `recordEntry` call of their own.
async function recordCachedEntries(cache, urls) {
  const sized = [];
  for (const url of urls) {
    const response = await cache.match(url);
    if (response) sized.push([cacheKeyOf(url), await sizeOf(response), buildOf(response)]);
  }
  if (sized.length === 0) return;
  await withIndex(async (index) => {
    for (const [key, size, build] of sized) {
      index.entries[key] = { size, lastAccess: stampAccess(), build };
    }
    await enforceBudget(index);
  });
}

// A cache write is part of the worker's lifetime: the browser may terminate it
// as soon as the in-flight promise chain settles, so an unawaited `put` can be
// dropped. Every strategy awaits this; the detached revalidation path also ties
// it to `event.waitUntil` (see `staleWhileRevalidate`).
async function store(cacheName, request, response) {
  try {
    const size = await sizeOf(response);
    const cache = await caches.open(cacheName);
    await cache.put(request, stampBuild(response));
    await recordEntry(cacheKeyOf(request), size);
  } catch (error) {
    // A failed write must not turn a good response into a failed fetch.
    console.log('[sw] cache write failed', String(error));
  }
}

// Rebuilds the index from what Cache Storage actually holds. `activate` is where
// entries written by a previous worker version, or by a write whose bookkeeping
// was dropped, get counted again. The build comes back from the entry's own
// stamp, so a rebuild never makes an old document look current.
async function rebuildIndex() {
  await withIndex(async (index) => {
    const live = new Set();
    for (const name of [CACHE, STATIC_CACHE]) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      for (const request of requests) {
        const key = cacheKeyOf(request);
        if (live.has(key)) continue;
        const response = await cache.match(request);
        const previous = index.entries[key];
        index.entries[key] = {
          size: await sizeOf(response),
          lastAccess: previous ? previous.lastAccess : stampAccess(),
          build: buildOf(response),
        };
        live.add(key);
      }
    }
    for (const key of Object.keys(index.entries)) {
      if (!live.has(key)) delete index.entries[key];
    }
    await enforceBudget(index);
  });
}

// Sign-out drops every runtime cache entry except the offline shell files that
// carry no account state. `STATIC_CACHE` is build output, not data, and the push
// preference marker is this device's setting, not an account's; IndexedDB (the
// Local Store and Outbox) is out of scope and is never opened from here.
//
// `/device` belongs on this list with the offline page (ADR-0070): it is a
// data-free shell that paints the Local Store after mount, and a borrowed device
// needs it *after* sign-out to remove the copy sign-out deliberately kept.
// The build's public route shells belong here too (#395): they were prerendered
// without a session and contain nothing account-bearing.
const SIGN_OUT_SHELL_PATHS = new Set([
  ...PRECACHE_ROUTES,
  FALLBACK_URL,
  '/device',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/notification-icon-192x192.png',
  '/icons/badge-icon-96x96.png',
]);

function isSignOutShell(key) {
  let url;
  try {
    url = new URL(key);
  } catch {
    return false;
  }
  return SIGN_OUT_SHELL_PATHS.has(url.pathname);
}

async function purgeAccountCaches() {
  const cache = await caches.open(CACHE);
  const requests = await cache.keys();
  await withIndex(async (index) => {
    for (const request of requests) {
      const key = cacheKeyOf(request);
      if (isSignOutShell(key)) continue;
      await cache.delete(request);
      delete index.entries[key];
    }
  });
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    cacheOutcomes.hits += 1;
    touchCache(request);
    return cached;
  }
  cacheOutcomes.misses += 1;
  try {
    const response = await fetch(request);
    if (response.ok && isCacheable(response)) {
      await store(STATIC_CACHE, request, response.clone());
    }
    return response;
  } catch {
    cacheOutcomes.failures += 1;
    // The earlier match was already falsy, so never resolve to `undefined`:
    // respondWith(undefined) throws. Fall back to the offline page for
    // navigations and a clean 503 for everything else.
    if (isNavigationRequest(request)) return serveOffline('static-offline');
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, timeoutMs = 3000, options = {}) {
  const mayServe = (response) => !options.requireExplicitPublic || isPubliclyCacheable(response);
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), timeoutMs)
  );
  try {
    const response = await Promise.race([fetch(request), timeout]);
    // A 5xx is a failed read even though `fetch` resolved. Serve the last good
    // cached response when one exists; otherwise the error is the answer.
    if (response.status >= 500) {
      const cached = await caches.match(request);
      if (cached && mayServe(cached)) {
        cacheOutcomes.hits += 1;
        touchCache(request);
        return cached;
      }
      cacheOutcomes.failures += 1;
      return response;
    }
    if (response.ok && isCacheable(response) && mayServe(response)) {
      await store(CACHE, request, response.clone());
    }
    return response;
  } catch {
    // A cached API response is only a fallback when it still opts in. Entries
    // persisted before an endpoint turned account-scoped must not be replayed.
    const cached = await caches.match(request);
    if (cached && mayServe(cached)) {
      cacheOutcomes.hits += 1;
      touchCache(request);
      return cached;
    }
    cacheOutcomes.failures += 1;
    if (isNavigationRequest(request)) return serveOffline('api-offline');
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, onMiss, event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) {
    cacheOutcomes.hits += 1;
    touchCache(request);
  } else {
    cacheOutcomes.misses += 1;
  }
  // A copy from another build is still served — instant paint, and the chunks
  // that document references are still in the cache — but the refresh behind it
  // must reach the server rather than accept an HTTP-cache copy of the build
  // that produced it (#488).
  const staleBuild = Boolean(cached) && buildOf(cached) !== BUILD_ID;
  // A cold load has two ways to reach the fallback: the deadline below, and the
  // revalidation rejecting afterwards. Only the one the user actually sees is
  // reported — otherwise one navigation would count twice, once per door.
  let missed = false;
  const miss = (door) => {
    if (missed) return new Response('Offline', { status: 503 });
    missed = true;
    cacheOutcomes.failures += 1;
    return missResponse(request, onMiss, door);
  };
  const revalidate = fetch(request, staleBuild ? { cache: 'no-cache' } : undefined)
    .then(async (response) => {
      if (response.ok && isCacheable(response)) {
        const write = (async () => {
          await store(CACHE, request, response.clone());
          await rememberImageFallback(new URL(request.url), response.clone());
        })().catch((error) => {
          // A bookkeeping failure must not turn a good response into an error.
          console.log('[sw] cache write failed', String(error));
        });
        await write;
      }
      return response;
    })
    .catch(async () => {
      if (cached) return cached;
      return miss('navigation-offline');
    });

  // The revalidation outlives the response either way: a deadline-swallowed cold
  // load must still write the late answer into the cache for the next visit,
  // and the browser may terminate the worker as soon as `respondWith` settles.
  if (event) event.waitUntil(revalidate.catch(() => undefined));

  // A cached copy answers instantly and unconditionally; stale paint never
  // waits on the network.
  if (cached) return cached;

  // A cold load races the network against the navigation deadline (#447). The
  // deadline resolves `undefined`, never an error, so `Promise.race` cannot
  // turn the timeout itself into a rejection: the loser keeps running as the
  // background revalidation registered above.
  const deadlineSunder = new Promise((resolve) =>
    setTimeout(() => resolve(undefined), NAVIGATION_TIMEOUT_MS)
  );
  const winner = await Promise.race([revalidate, deadlineSunder]);
  if (winner === undefined) return miss('navigation-deadline');
  return winner;
}

// What answers a request that has neither a cached copy nor a network answer.
// (The deadline path reaches here resolved; the failure path reaches through
// the catch above.)
//
// The door names the path that missed, so the field count can tell the accepted
// doors (a first install, an online-only route) from a real regression
// (ADR-0074): `navigation-deadline` vs `navigation-offline` separates "too slow"
// from "no network" on an ordinary page, and `online-only-*` is the surface
// ADR-0031 deliberately keeps out of Cache Storage.
async function missResponse(request, onMiss, door) {
  if (onMiss) return onMiss(request);
  if (isNavigationRequest(request)) return serveOffline(door);
  return new Response('Offline', { status: 503 });
}

/**
 * Answers the offline page and reports which door led here. `no-fallback` means
 * the page itself was missing from Cache Storage — the first-install shape (the
 * install has not finished precaching, or something evicted the shell), which
 * is the one case that must stay visible rather than being counted as a door.
 */
async function serveOffline(door) {
  const fallback = await caches.match(FALLBACK_URL);
  void reportOfflineServe(fallback ? door : 'no-fallback');  if (fallback) return fallback;
  return new Response('Offline', { status: 503 });
}

/**
 * Sends one beacon and resolves whether the server took it. Deliberately not
 * awaited by the caller: `/offline` must paint instantly, and the user is
 * already waiting on a failure. `keepalive` is the best effort at outliving the
 * worker, and `credentials: 'omit'` keeps the request free of the visitor's
 * session — the endpoint reads nothing but the body.
 */
function postOfflineReport(report) {
  return fetch(OFFLINE_REPORT_PATH, {
    method: 'POST',
    credentials: 'omit',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  })
    .then((response) => response.ok)
    .catch(() => false);
}

function emptyOutcomes() {
  return { hits: 0, misses: 0, failures: 0 };
}

function addOutcomes(a, b) {
  return {
    hits: a.hits + b.hits,
    misses: a.misses + b.misses,
    failures: a.failures + b.failures,
  };
}

async function readPendingReport() {
  try {
    const cache = await caches.open(OFFLINE_REPORT_STORE);
    const response = await cache.match(OFFLINE_REPORT_KEY);
    if (!response) return null;
    const parsed = await response.json();
    if (!parsed || parsed.version !== OFFLINE_REPORT_VERSION || !parsed.doors) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writePendingReport(doors) {
  const cache = await caches.open(OFFLINE_REPORT_STORE);
  await cache.put(
    OFFLINE_REPORT_KEY,
    new Response(JSON.stringify({ version: OFFLINE_REPORT_VERSION, doors }), {
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

async function clearPendingReport() {
  try {
    const cache = await caches.open(OFFLINE_REPORT_STORE);
    await cache.delete(OFFLINE_REPORT_KEY);
  } catch {
    // Losing the marker only costs one duplicate report, never the page.
  }
}

/**
 * Keeps a report the network refused, merged per door so a long offline stretch
 * costs one entry rather than one per serve. A worker killed before the write
 * settles still loses it: this is a signal, not an audit.
 */
async function keepOfflineReport(report) {
  const pending = await readPendingReport();
  const doors = { ...((pending && pending.doors) || {}) };
  doors[report.door] = addOutcomes(doors[report.door] || emptyOutcomes(), report.cache);
  await writePendingReport(doors);
}

let lastReportFlush = 0;

/**
 * Tries the reports an offline serve could not deliver. Called on every GET the
 * worker sees, so a device that comes back online flushes on its own first
 * request; throttled because a beacon is not worth a cache read per request.
 */
async function flushOfflineReports(force = false) {
  const now = Date.now();
  if (!force && now - lastReportFlush < OFFLINE_REPORT_RETRY_MS) return;
  lastReportFlush = now;
  const pending = await readPendingReport();
  if (!pending) return;
  const remaining = {};
  for (const door of Object.keys(pending.doors)) {
    const delivered = await postOfflineReport({
      version: OFFLINE_REPORT_VERSION,
      door,
      cache: pending.doors[door],
    });
    if (!delivered) remaining[door] = pending.doors[door];
  }
  if (Object.keys(remaining).length === 0) await clearPendingReport();
  else await writePendingReport(remaining);
}

/**
 * Counts one `/offline` serve and gets the report out: straight to the endpoint
 * when the network answers, kept for the next request when it does not.
 */
async function reportOfflineServe(door) {
  const cache = { ...cacheOutcomes };
  cacheOutcomes.hits = 0;
  cacheOutcomes.misses = 0;
  cacheOutcomes.failures = 0;
  const report = { version: OFFLINE_REPORT_VERSION, door, cache };
  const delivered = await postOfflineReport(report);
  if (!delivered) {
    await keepOfflineReport(report);
    return;
  }
  await flushOfflineReports(true);
}

/**
 * A responsive image is cached per width, so a width the browser never fetched
 * offline has no entry — and a 503 there renders as a broken image. Answer with
 * the last successful rendering of the same source, or a layout-stable
 * placeholder when no width of it was ever cached.
 */
function imageFallbackKey(source) {
  return `${self.location.origin}${IMAGE_FALLBACK_PATH}?src=${encodeURIComponent(source)}`;
}

async function rememberImageFallback(url, response) {
  if (!isNextImage(url)) return;
  const source = url.searchParams.get('url');
  if (!source) return;
  await store(STATIC_CACHE, imageFallbackKey(source), response);
}

async function offlineImage(request) {
  const url = new URL(request.url);
  if (isNextImage(url)) {
    const source = url.searchParams.get('url');
    if (source) {
      const key = imageFallbackKey(source);
      const cached = await caches.match(key);
      if (cached) {
        touchCache(key);
        return cached;
      }
    }
  }
  return new Response(IMAGE_PLACEHOLDER, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-store',
    },
  });
}

// Online-only surfaces (ADR-0031): go straight to the network, never to Cache
// Storage. A navigation that cannot reach the network falls back to the offline
// page so the user lands somewhere legible rather than on a browser error. The
// same navigation deadline bounds a slow navigation (#447): /offline arrives
// after the deadline instead of whenever the browser's own timeout gives up.
// Non-navigations (API reads on never-cache prefixes) stay unbounded — those
// run inside an already-painted page whose failure state is the app's own job.
async function networkOnly(request) {
  const navigation = isNavigationRequest(request);
  try {
    if (!navigation) return await fetch(request);
    const deadlineSunder = new Promise((resolve) =>
      setTimeout(() => resolve(undefined), NAVIGATION_TIMEOUT_MS)
    );
    const winner = await Promise.race([fetch(request), deadlineSunder]);
    if (winner === undefined) {
      cacheOutcomes.failures += 1;
      return missResponse(request, undefined, 'online-only-deadline');
    }
    return winner;
  } catch {
    if (navigation) {
      cacheOutcomes.failures += 1;
      return serveOffline('online-only-offline');
    }
    return new Response('Offline', { status: 503 });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.method !== 'GET') return;

  // Retry what a truly-offline serve could not send (ADR-0074's amendment).
  void flushOfflineReports();

  // Online-only surfaces bypass the cache entirely (ADR-0031).
  if (isNeverCache(url)) {
    event.respondWith(networkOnly(request));
    return;
  }

  if (isNextStaticAsset(url) || isFont(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isIcon(url) || isImage(url) || isNextImage(url)) {
    event.respondWith(staleWhileRevalidate(request, offlineImage, event));
    return;
  }

  if (isApiCall(url)) {
    event.respondWith(networkFirst(request, 5000, { requireExplicitPublic: true }));
    return;
  }

  // Public navigations and RSC payloads paint from cache instantly, then
  // refresh in the background (stale-while-revalidate). Offline-first reads.
  if (isNavigationRequest(request) || isRSCPayload(url)) {
    event.respondWith(staleWhileRevalidate(request, undefined, event));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, undefined, event));
});

self.addEventListener('message', (event) => {
  event.waitUntil((async () => {
    const messageOrigin = event.origin;
    if (messageOrigin && messageOrigin !== self.location.origin) return;

    const source = event.source;
    if (!source || !('id' in source)) return;

    const client = await self.clients.get(source.id);
    if (!client) return;

    const clientOrigin = new URL(client.url).origin;
    if (clientOrigin !== self.location.origin) return;

    if (event.data?.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
    if (event.data?.type === 'CACHE_URLS') {
      const urls = event.data.urls;
      const cache = await caches.open(CACHE);
      await precache(cache, urls);
    }
    if (event.data?.type === 'PURGE_ACCOUNT_CACHES') {
      await purgeAccountCaches();
      // The page waits for this acknowledgement; a dropped port is fine (the
      // purge already happened and the sign-out continues either way).
      const port = event.ports && event.ports[0];
      if (port) port.postMessage({ type: 'ACCOUNT_CACHES_PURGED' });
    }
  })());
});

/**
 * Web Background Sync (ADR-0058).
 *
 * The page registers this tag when its own flush could not finish — a write made
 * offline, or one the server refused — and the browser fires this event when the
 * network comes back, usually with no page open at all. That case is the point:
 * it is the only one a page cannot cover for itself. The drain lives in the
 * generated `sw-outbox.js`, so the worker replays through the same engine, the
 * same transports and the same Outbox access the page uses, and takes the same
 * Web Lock an open tab would.
 */
self.addEventListener('sync', (event) => {
  const outbox = self.SWOutbox;
  if (!outbox || event.tag !== outbox.tag) return;

  event.waitUntil(
    outbox.drain().catch((error) => {
      console.log('[sw] outbox drain failed', String(error));
      // Rethrow: a rejected event leaves the registration pending, so the
      // browser comes back for whatever is still queued. Resolving would retire
      // it, and with no page open nothing else would come back at all.
      throw error;
    })
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBuffersEqual(a, b) {
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

async function isPushDisabledByPreference() {
  try {
    const cached = await caches.match('/__push_disabled__');
    return Boolean(cached);
  } catch {
    return false;
  }
}

/**
 * Re-subscribes when the push service rotates the subscription endpoint.
 * This MUST live inside the service worker: `pushsubscriptionchange` is
 * delivered to the SW context, typically while no page is open, so listeners
 * registered from a page never run — without this the server keeps pushing to
 * a dead endpoint and no native notification can ever show.
 */
async function resubscribePush() {
  const publicKey = self.PUSH_CONFIG && self.PUSH_CONFIG.publicKey;
  if (!publicKey) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (await isPushDisabledByPreference()) return;

  const expectedKey = urlBase64ToUint8Array(publicKey);
  const existing = await self.registration.pushManager.getSubscription();
  if (existing) {
    const getKey = existing.getKey;
    const currentKey = getKey ? getKey.call(existing, 'applicationServerKey') : null;
    if (currentKey && arrayBuffersEqual(currentKey, expectedKey)) return;
    await existing.unsubscribe();
  }

  const fresh = await self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: expectedKey,
  });
  await fetch('/api/push/subscribe', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fresh.toJSON()),
  });
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(resubscribePush().catch(() => undefined));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    const data = event.data ? event.data.json() : {};
    if (data && typeof data === 'object') payload = data;
  } catch {
    payload = {};
  }

  const title = typeof payload.title === 'string' ? payload.title : 'رؤيَة رقَميَّة';
  const notificationId = typeof payload.notificationId === 'string' ? payload.notificationId : undefined;

  const options = {
    body: typeof payload.body === 'string' && payload.body.length > 0 ? payload.body : undefined,
    icon: `/icons/notification-icon-192x192.png${ASSET_QUERY}`,
    badge: `/icons/badge-icon-96x96.png${ASSET_QUERY}`,
    data: {
      url: typeof payload.url === 'string' ? payload.url : '/',
      type: typeof payload.type === 'string' ? payload.type : undefined,
      notificationId,
    },
  };
  if (notificationId) options.tag = notificationId;

  // Field diagnostics: surfaced through service-worker console listeners
  // (e.g. e2e/push.spec.ts) since OS-delivered toasts aren't introspectable.
  console.log('[sw] push event received', JSON.stringify(payload));
  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .then(() => console.log('[sw] showNotification OK'))
      .catch((err) => {
        console.log('[sw] showNotification FAILED', String(err));
        throw err;
      })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin);

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          await client.navigate(targetUrl.href);
        } catch {
          // Uncontrolled client (loaded before the SW took control) can't be
          // navigated; focus it and keep its current page instead.
        }
        await client.focus();
        return;
      }
      await self.clients.openWindow(targetUrl.href);
    })()
  );
});
