try { importScripts('/sw-version.js'); } catch { self.CACHE_VERSION = 'royaraqamia-dev'; }
try { importScripts('/sw-push-config.js'); } catch { self.PUSH_CONFIG = null; }
try { importScripts('/sw-routing.js'); } catch { self.SWRouting = self.SWRouting || null; }
try { importScripts('/sw-outbox.js'); } catch { self.SWOutbox = self.SWOutbox || null; }
const CACHE = self.CACHE_VERSION;
const STATIC_CACHE = 'royaraqamia-static-' + (self.CACHE_VERSION ? self.CACHE_VERSION.split('-').pop() : 'v1');
const FALLBACK_URL = '/offline';

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
  PRECACHE_URLS.map((url) => new URL(url, self.location.origin).pathname)
);

// Precaching is best-effort per URL. `cache.addAll` is all-or-nothing: one 404
// would reject the install and leave the previous worker in place forever, so
// every URL is fetched independently and failures are only reported.
async function precache(cache, urls) {
  const results = await Promise.allSettled(urls.map((url) => cache.add(url)));
  const failed = urls.filter((_, index) => results[index].status === 'rejected');
  if (failed.length > 0) console.log('[sw] precache failed:', failed.join(', '));
  const stored = urls.filter((_, index) => results[index].status === 'fulfilled');
  await recordCachedEntries(cache, stored);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await precache(cache, PRECACHE_URLS);
    })()
  );
});

const PUSH_PREF_CACHE = 'royaraqamia-push-prefs';

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (
            key !== CACHE &&
            key !== STATIC_CACHE &&
            key !== PUSH_PREF_CACHE &&
            key !== CACHE_META_NAME
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
function isPinned(key) {
  let url;
  try {
    url = new URL(key);
  } catch {
    return false;
  }
  if (url.pathname === FALLBACK_URL) return true;
  if (url.pathname.startsWith('/_next/static/') || isFont(url) || isIcon(url)) return true;
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

// Oldest access first; pinned entries are skipped even when they are the oldest.
// If only pinned entries remain the budget cannot be met, and evicting the
// offline page or the current build would be the worse failure: it is logged.
async function enforceBudget(index) {
  let total = accountedBytes(index);
  if (total <= CACHE_BUDGET_BYTES) return;

  const target = Math.floor(CACHE_BUDGET_BYTES * CACHE_EVICT_TO);
  const candidates = Object.keys(index.entries)
    .filter((key) => !isPinned(key))
    .sort((a, b) => {
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

async function recordEntry(key, size) {
  await withIndex(async (index) => {
    index.entries[key] = { size, lastAccess: stampAccess() };
    await enforceBudget(index);
  });
}

// Books entries that were written by `cache.add` rather than through `store`.
async function recordCachedEntries(cache, urls) {
  const sized = [];
  for (const url of urls) {
    const response = await cache.match(url);
    if (response) sized.push([cacheKeyOf(url), await sizeOf(response)]);
  }
  if (sized.length === 0) return;
  await withIndex(async (index) => {
    for (const [key, size] of sized) {
      index.entries[key] = { size, lastAccess: stampAccess() };
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
    await cache.put(request, response);
    await recordEntry(cacheKeyOf(request), size);
  } catch (error) {
    // A failed write must not turn a good response into a failed fetch.
    console.log('[sw] cache write failed', String(error));
  }
}

// Rebuilds the index from what Cache Storage actually holds. `activate` is where
// entries written by a previous worker version, or by a write whose bookkeeping
// was dropped, get counted again.
async function rebuildIndex() {
  await withIndex(async (index) => {
    const live = new Set();
    for (const name of [CACHE, STATIC_CACHE]) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      for (const request of requests) {
        const key = cacheKeyOf(request);
        if (live.has(key)) continue;
        const previous = index.entries[key];
        index.entries[key] = {
          size: await sizeOf(await cache.match(request)),
          lastAccess: previous ? previous.lastAccess : stampAccess(),
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
const SIGN_OUT_SHELL_PATHS = new Set([
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
    touchCache(request);
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok && isCacheable(response)) {
      await store(STATIC_CACHE, request, response.clone());
    }
    return response;
  } catch {
    // The earlier match was already falsy, so never resolve to `undefined`:
    // respondWith(undefined) throws. Fall back to the offline page for
    // navigations and a clean 503 for everything else.
    if (isNavigationRequest(request)) {
      const fallback = await caches.match(FALLBACK_URL);
      if (fallback) return fallback;
    }
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
        touchCache(request);
        return cached;
      }
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
      touchCache(request);
      return cached;
    }
    if (isNavigationRequest(request)) {
      return caches.match(FALLBACK_URL);
    }
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, onMiss, event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) touchCache(request);
  const revalidate = fetch(request)
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
      if (onMiss) return onMiss(request);
      if (isNavigationRequest(request)) {
        const fallback = await caches.match(FALLBACK_URL);
        if (fallback) return fallback;
      }
      return new Response('Offline', { status: 503 });
    });

  // `cached` can answer the request while this chain keeps running, so the
  // lifetime extension is registered before the response is handed back — after
  // `respondWith` settles the event is no longer active.
  if (event) event.waitUntil(revalidate.catch(() => undefined));

  return cached || revalidate;
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
// page so the user lands somewhere legible rather than on a browser error.
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    if (isNavigationRequest(request)) {
      const fallback = await caches.match(FALLBACK_URL);
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503 });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.method !== 'GET') return;

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
