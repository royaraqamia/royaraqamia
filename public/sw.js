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
// same realm global; production always takes 3000.
//
// Three seconds, not ten (#491): ten seconds of blank is not a deadline the user
// experiences as protection, it is ten seconds of a broken app. The number is
// the whole change — the write path is untouched, so what the cut fetch brings
// back still lands in the cache. It is a separate constant from
// `OFFLINE_REPORT_RETRY_MS`, which keeps its own meaning.
const NAVIGATION_TIMEOUT_MS = self.NAVIGATION_TIMEOUT_MS || 3_000;

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

// ---------------------------------------------------------------------------
// Navigation preload (#492)
//
// A navigation that reaches the network used to wait for this worker to boot
// before the request even started. With preload enabled the browser issues the
// document request alongside the worker start, and the fetch handler collects
// the answer from `event.preloadResponse` instead of issuing a second one. The
// strategies below all take it, so the same rule holds for a public document
// (stale-while-revalidate) and for the never-cache surfaces (network-only).
// ---------------------------------------------------------------------------

/**
 * The network leg of a navigation: the browser's own preload when it made one,
 * otherwise a fetch this worker issues.
 *
 * A preload that resolves `undefined` means the browser preloaded nothing for
 * this request (the API is absent, or the event carried no preload), so the
 * fetch still has to happen. A *stale-build* refresh passes no preload at all:
 * it has to reach the server rather than accept whatever the HTTP cache kept
 * from the build it is trying to leave (#488).
 */
async function preloadedOrFetch(request, preload, init) {
  if (preload) {
    const response = await preload.catch(() => undefined);
    if (response) return response;
  }
  return fetch(request, init);
}

async function enableNavigationPreload() {
  const manager = self.registration && self.registration.navigationPreload;
  if (!manager || typeof manager.enable !== 'function') return;
  try {
    await manager.enable();
  } catch (error) {
    // A refused preload costs the navigation the worker's boot, not the page:
    // every strategy falls back to `fetch` on its own.
    console.log('[sw] navigation preload enable failed', String(error));
  }
}

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

// Ceiling for those shells, bytes. The public cache's own budget (below) still
// wins: the worker only spends what is left of it. ADR-0071 documents both
// numbers and why the list carries HTML shells only.
const ROUTE_PRECACHE_BUDGET_BYTES = self.ROUTE_PRECACHE_BUDGET_BYTES || 6 * 1024 * 1024;

// How the background refresh spends that ceiling (#489). `install` fetches only
// the fixed shell; the route list arrives after activation, a small batch per
// idle window, two fetches at a time. The window count follows the list, so one
// pass always covers it however far the cap grows: a fixed 4 x 8 covered 32
// routes, and at 33 it silently left the last one (`/verify`) for a pass the
// next request would have to start (#555).
const ROUTE_REFRESH_BATCH = self.ROUTE_REFRESH_BATCH || 4;
const ROUTE_REFRESH_WINDOWS =
  self.ROUTE_REFRESH_WINDOWS ||
  Math.max(8, Math.ceil((self.PRECACHE_ROUTES || []).length / ROUTE_REFRESH_BATCH));
const ROUTE_REFRESH_CONCURRENCY = 2;
// The chunks those documents name are collected in the same windows (#490), a
// smaller handful per window: `/_next/static` files are what make a shell run, and
// a burst of them beside a page the user is on is exactly what #489 stopped. The
// queue resumes across windows and across workers, so coverage converges over a
// few passes rather than in one.
const ROUTE_REFRESH_ASSET_BATCH = self.ROUTE_REFRESH_ASSET_BATCH || 12;
// A completed pass is not repeated for a while: one page load issues dozens of
// same-origin GETs, and each one is another chance to walk a list the device
// already holds. A pass that stopped early skips this wait and continues.
const ROUTE_REFRESH_INTERVAL_MS = self.ROUTE_REFRESH_INTERVAL_MS ?? 60_000;
// The delay before a window when the realm has no `requestIdleCallback` (a
// service worker does not, on today's browsers). Long enough to stay out of a
// document's own hydration burst, short enough that one visit converges.
const ROUTE_REFRESH_IDLE_MS = self.ROUTE_REFRESH_IDLE_MS ?? 500;
const ROUTE_REFRESH_IDLE_TIMEOUT_MS = self.ROUTE_REFRESH_IDLE_TIMEOUT_MS ?? 5_000;

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
// The index keys route shells by absolute URL (`cacheKeyOf`), so the refresh
// reads "what does this device already hold for the list" the same way.
const PRECACHE_ROUTE_KEYS = PRECACHE_ROUTES.map((url) => cacheKeyOf(url));

// Precaching only ever fetches this origin, and the check lives here rather than
// at each caller. The route list arrives from the build's generated file and the
// shell list is a literal, so neither is untrusted today; the guard is here
// because this is the one function that fetches whatever it is handed, and an
// unvalidated URL is a client-side request forgery: anything running on this
// origin could ask the worker to fetch an internal address and store the answer
// for it to read back. A URL that does not resolve to this origin is refused.
function sameOriginUrl(input) {
  try {
    const url = new URL(input, self.location.origin);
    return url.origin === self.location.origin ? url : null;
  } catch {
    return null;
  }
}

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
    urls.map(async (input) => {
      const url = sameOriginUrl(input);
      if (!url) {
        failed.push(String(input));
        return;
      }
      // Resolved back to a path, so what the worker requests is a same-origin
      // document and never an absolute URL some caller supplied.
      const target = `${url.pathname}${url.search}`;
      try {
        const response = await fetch(target, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await cache.put(target, stampBuild(response));
        stored.push(target);
      } catch {
        failed.push(target);
      }
    })
  );
  if (failed.length > 0) console.log('[sw] precache failed:', failed.join(', '));
  await recordCachedEntries(cache, stored);
}

// ---------------------------------------------------------------------------
// Route-shell refresh after activation (#489)
//
// `install` fetches the irreducible shell: `/`, `/offline`, the manifest and the
// four icons. The build's route shells are not part of it — 29 documents and
// 1.63 MB (ADR-0071) fetched one at a time competes with the page the user is
// looking at, and the browser may terminate the worker mid-list.
//
// They arrive here instead: a few per idle window, two at a time, starting with
// `activate` and continued by the fetch events that follow. The idle gate is
// `requestIdleCallback` where the realm has one and a small delay otherwise,
// which is what keeps a route fetch off a document that is still hydrating.
// Progress is the cache itself — a pass skips a route this build already holds
// — so a worker the browser stops, or a device that goes offline, resumes at
// the next window rather than starting over.
// ---------------------------------------------------------------------------

let routeRefresh = null;
let lastRouteRefreshAt = 0;
let routeRefreshPending = false;

/** Resolves when the page is idle enough to carry a couple of route fetches. */
function whenIdle() {
  if (typeof self.requestIdleCallback === 'function') {
    return new Promise((resolve) => {
      self.requestIdleCallback(() => resolve(), { timeout: ROUTE_REFRESH_IDLE_TIMEOUT_MS });
    });
  }
  return new Promise((resolve) => setTimeout(resolve, ROUTE_REFRESH_IDLE_MS));
}

// ---------------------------------------------------------------------------
// Route assets: the half of a shell that makes it a page (#490)
//
// A precached document is a picture of the route. Hydration needs the
// `/_next/static` files the document names — layout chunks, the route's own
// chunk, the stylesheet — and a route this device never visited has none of them,
// so a prefix-served shell would paint and then stay inert: no card, no
// interactivity. ADR-0071 recorded that as a known limit ("only documents, not
// their route-specific chunks"); the prefix fallback turns it into a
// user-visible one, so the refresh collects them alongside the document.
//
// They are content-addressed by the build, so one file serves every document
// that names it: a queue dedupes the passes, and an asset the cache already holds
// costs no request. The queue is the record, like the route list is for
// documents — the pass takes a bounded handful per idle window, so a shell's
// chunks never arrive as one burst beside the page the user is on, and a worker
// the browser stops resumes from the file it wrote. Assets are not charged
// against the route-shell ceiling — that ceiling bounds documents — and `store`
// still books them into ADR-0069's budget.
// ---------------------------------------------------------------------------

const DOCUMENT_ASSET_PATTERN = /(?:src|href)="(\/_next\/static\/[^"?#]+)"/g;
// Queued asset URLs, beside the worker's other bookkeeping (the meta cache
// survives `activate` and is not part of the byte budget). Keyed by build: a
// release's leftovers name files that no longer exist, so they are dropped.
const ASSET_QUEUE_KEY = '/__sw_asset_queue__';
const ASSET_QUEUE_VERSION = 1;

/** The same-origin static files a document references. */
function documentAssets(html) {
  const assets = new Set();
  for (const match of html.matchAll(DOCUMENT_ASSET_PATTERN)) assets.add(match[1]);
  return [...assets];
}

async function readAssetQueue() {
  try {
    const meta = await caches.open(CACHE_META_NAME);
    const stored = await meta.match(ASSET_QUEUE_KEY);
    if (!stored) return [];
    const parsed = await stored.json();
    if (!parsed || parsed.version !== ASSET_QUEUE_VERSION) return [];
    if (parsed.build !== BUILD_ID || !Array.isArray(parsed.urls)) return [];
    return parsed.urls.filter((url) => typeof url === 'string');
  } catch {
    return [];
  }
}

async function writeAssetQueue(urls) {
  try {
    const meta = await caches.open(CACHE_META_NAME);
    if (urls.length === 0) {
      await meta.delete(ASSET_QUEUE_KEY);
      return;
    }
    await meta.put(
      ASSET_QUEUE_KEY,
      new Response(
        JSON.stringify({ version: ASSET_QUEUE_VERSION, build: BUILD_ID, urls }),
        { headers: { 'content-type': 'application/json' } }
      )
    );
  } catch (error) {
    // Bookkeeping only: losing the queue costs a re-collection, not a page.
    console.log('[sw] route asset queue write failed', String(error));
  }
}

/**
 * Caches up to `budget` queued assets, front first, dropping each as it is dealt
 * with. Sequential on purpose: this runs while the user is on a page, so it
 * trickles rather than bursts. A failure is logged and the pass moves on.
 */
async function drainAssetQueue(queue, budget) {
  let drained = 0;
  while (queue.length > 0 && drained < budget) {
    const asset = queue.shift();
    drained += 1;
    // The queue is written from documents this worker fetched and re-read from
    // Cache Storage, which anything on this origin can also write, so the same
    // same-origin rule applies to it as to `precache`.
    const target = sameOriginUrl(asset);
    if (!target) continue;
    const assetPath = `${target.pathname}${target.search}`;
    try {
      if (await caches.match(assetPath)) continue;
      const response = await fetch(assetPath, { cache: 'no-cache' });
      if (!response.ok) {
        console.log('[sw] route asset failed:', assetPath, response.status);
        continue;
      }
      if (!isCacheable(response)) continue;
      await store(STATIC_CACHE, target.href, response);
    } catch (error) {
      console.log('[sw] route asset failed:', assetPath, String(error));
    }
  }
}

// What this device may still spend on route shells: the list's own ceiling and
// the cache budget (ADR-0069), minus what the shells already accounted for. A
// resumable pass is measured against what it holds, not against this run's
// writes alone.
function routeRefreshBudget(index) {
  const held = PRECACHE_ROUTE_KEYS.reduce(
    (total, key) => total + ((index.entries[key] && index.entries[key].size) || 0),
    0
  );
  return Math.max(
    0,
    Math.min(ROUTE_PRECACHE_BUDGET_BYTES - held, CACHE_BUDGET_BYTES - accountedBytes(index))
  );
}

// One window's worth of routes, `ROUTE_REFRESH_CONCURRENCY` at a time. A 404, a
// non-cacheable response or a network error is logged and skipped: the rest of
// the list is worth more than the entry that failed. `held` carries each route
// shell's current bytes, so a refresh that replaces a previous build's copy only
// spends its growth. Returns the bytes left.
async function refreshRouteWindow(cache, urls, budget, held, collect) {
  let remaining = budget;
  let cursor = 0;
  let exhausted = false;

  const lane = async () => {
    while (!exhausted && cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;
      try {
        const parsed = new URL(url, self.location.origin);
        if (parsed.origin !== self.location.origin || isNeverCache(parsed)) continue;
        // `no-cache` revalidates: an unchanged shell answers from the HTTP cache
        // instead of transferring again, and a stale copy cannot become this
        // build's shell.
        const response = await fetch(url, { cache: 'no-cache' });
        if (!response.ok) {
          console.log('[sw] route refresh failed:', url, response.status);
          continue;
        }
        if (!isCacheable(response)) {
          console.log('[sw] route refresh skipped (not cacheable):', url);
          continue;
        }
        const size = await sizeOf(response);
        const key = cacheKeyOf(url);
        const growth = Math.max(0, size - (held.get(key) || 0));
        // Claimed before the write is awaited, so two lanes cannot both spend
        // the last bytes of the budget.
        if (growth > remaining) {
          exhausted = true;
          console.log('[sw] route refresh budget reached; skipped:', url);
          continue;
        }
        remaining -= growth;
        held.set(key, size);
        const html = await response
          .clone()
          .text()
          .catch(() => '');
        await cache.put(url, stampBuild(response));
        await recordEntry(key, size);
        // The chunks this document references are queued with it (#490): a shell
        // without them paints but cannot hydrate.
        await collect(html);
      } catch (error) {
        console.log('[sw] route refresh failed:', url, String(error));
      }
    }
  };

  await Promise.all(Array.from({ length: ROUTE_REFRESH_CONCURRENCY }, lane));
  return remaining;
}

/** Runs one pass over the list and returns how many routes are still pending. */
async function refreshRouteShells() {
  const cache = await caches.open(CACHE);
  // The queue is the record of what this build still needs to fetch, exactly as
  // the cached documents are for the route list (#490).
  const assets = await readAssetQueue();
  const queued = new Set(assets);
  const collect = async (html) => {
    if (!html) return;
    for (const asset of documentAssets(html)) {
      if (queued.has(asset)) continue;
      queued.add(asset);
      assets.push(asset);
    }
  };

  // `/` is fetched by `install`, not by this list, so its chunks are collected
  // here: it is the last prefix a deep link falls back to (#490) and the one
  // document every installed device holds.
  const home = await cache.match('/');
  if (home && typeof home.clone === 'function') {
    await collect(
      await home
        .clone()
        .text()
        .catch(() => '')
    );
  }

  const pending = [];
  for (const url of PRECACHE_ROUTES) {
    const existing = await cache.match(url);
    // A shell this build already holds needs no request: a repeated pass (a
    // re-registered worker, a device finishing a list it started yesterday)
    // costs nothing, and a released build finds the previous stamp and refreshes
    // the route once.
    if (existing && buildOf(existing) === BUILD_ID) continue;
    pending.push(url);
  }
  if (pending.length === 0 && assets.length === 0) return 0;

  let budget;
  let held;
  try {
    ({ budget, held } = await withIndex((index) => ({
      budget: routeRefreshBudget(index),
      held: new Map(
        PRECACHE_ROUTE_KEYS.map((key) => [
          key,
          (index.entries[key] && index.entries[key].size) || 0,
        ])
      ),
    })));
  } catch (error) {
    // The index is an optimisation. Without it the list's own ceiling still
    // bounds the pass, and `recordEntry` enforces the cache budget per write.
    console.log('[sw] route refresh budget read failed', String(error));
    budget = ROUTE_PRECACHE_BUDGET_BYTES;
    held = new Map();
  }

  for (let window = 0; window < ROUTE_REFRESH_WINDOWS; window += 1) {
    if (budget <= 0 || (pending.length === 0 && assets.length === 0)) break;
    await whenIdle();
    if (pending.length > 0) {
      budget = await refreshRouteWindow(
        cache,
        pending.splice(0, ROUTE_REFRESH_BATCH),
        budget,
        held,
        collect
      );
    }
    // A bounded handful of chunks per window: the same "never beside the page the
    // user is on" rule the documents follow (#489), scaled to a list of files.
    await drainAssetQueue(assets, ROUTE_REFRESH_ASSET_BATCH);
    await writeAssetQueue(assets);
  }

  // No budget left is a different stop from "the pass ran out of windows": a
  // route that does not fit today will not fit on the next GET either, so the
  // worker stops trying until the cache frees up (a new worker, or a release
  // that replaces entries) instead of walking the list on every request.
  if (budget <= 0) {
    console.log('[sw] route refresh has no budget left:', pending.length, 'pending');
    return 0;
  }

  const outstanding = pending.length + assets.length;
  if (outstanding > 0) {
    console.log('[sw] route refresh paused; next window continues:', outstanding);
  }
  return outstanding;
}

/**
 * Starts (or continues) the background refresh and returns it for
 * `event.waitUntil`, or null when there is nothing to do. `activate` calls it
 * for the pass every install is guaranteed, and the fetch handler calls it so a
 * pass that hit the budget, went offline or was cut short resumes on the next
 * request instead of waiting for the next launch. An empty route list does not
 * skip the pass: the fixed shell's own chunks are collected by the same code
 * (#490).
 */
function maybeRefreshRouteShells() {
  if (routeRefresh) return routeRefresh;
  const now = Date.now();
  if (!routeRefreshPending && now - lastRouteRefreshAt < ROUTE_REFRESH_INTERVAL_MS) return null;
  lastRouteRefreshAt = now;
  routeRefresh = refreshRouteShells()
    .then((pending) => {
      // A pass that stopped early skips the interval, so the next event picks up
      // the tail instead of waiting a minute for it.
      routeRefreshPending = pending > 0;
    })
    .catch((error) => {
      // A refresh must never surface as a failed event; the next window retries.
      console.log('[sw] route refresh failed', String(error));
    })
    .finally(() => {
      routeRefresh = null;
    });
  return routeRefresh;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // The irreducible shell only (#489). The build's route shells follow in
      // idle windows after activation, so the install is a handful of requests
      // rather than the whole list competing with the page in front of the user.
      await precache(cache, PRECACHE_URLS);
    })()
  );
});

const PUSH_PREF_CACHE = 'royaraqamia-push-prefs';

/**
 * The Quran's offline recitation, kept by the page (`frontend/shared/local-store/
 * audio.ts`, ADR-0081). The worker never reads or writes it — it belongs to the
 * page, keyed by content hash — but activation deletes every cache it does not
 * name, and a release must not take a reader's downloaded surah with it (#559).
 * The name is asserted against that module by `frontend/shared/local-store/__tests__/
 * audio.test.ts`, so the two cannot drift apart silently.
 */
const AUDIO_CACHE = 'quran-audio-v1';

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Navigations begin at preload from now on (#492): the browser's own
      // request runs while this worker boots, and the fetch handler collects it.
      await enableNavigationPreload();
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
            key !== OFFLINE_REPORT_STORE &&
            key !== AUDIO_CACHE
          ) {
            return caches.delete(key);
          }
        })
      );
      // After the stale caches are gone, count what survived (and what the
      // previous worker wrote without bookkeeping) before serving from it.
      await rebuildIndex();
      // The route-shell refresh starts here (#489), as a background pass: it is
      // deliberately not awaited, because activation must not wait on a network
      // list the page never asked for, and a stalled route fetch would hold up
      // the swap it is meant to stay behind. `activate` is still the right hook
      // — it is the one event every install is guaranteed after, and the page
      // that triggered the install was uncontrolled while `install` ran, so it
      // may never make a request this worker sees. A request that does arrive
      // attaches to the same pass; a worker stopped mid-pass keeps what it
      // wrote, and the next request or launch continues from the cache.
      void maybeRefreshRouteShells();
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
  cacheKeyFor,
  isFont,
  isIcon,
  isImage,
  isNextImage,
  isApiCall,
  shellPrefixCandidates,
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
// The build's public route shells belong here too (#395): they were prerendered
// without a session and contain nothing account-bearing.
const SIGN_OUT_SHELL_PATHS = new Set([
  ...PRECACHE_ROUTES,
  FALLBACK_URL,
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

async function staleWhileRevalidate(request, onMiss, event, options = {}) {
  const cache = await caches.open(CACHE);
  // The one entry a hit and a write share (#492). A document keeps its own URL; a
  // live RSC payload is keyed by its normalised one, so a navigation answers the
  // next navigation — and a document and a prefetched body keep entries of their
  // own, which neither may answer from the other.
  const key = options.cacheKey || request;
  const cached = await cache.match(key);
  if (cached) {
    cacheOutcomes.hits += 1;
    touchCache(key);
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
  const revalidate = preloadedOrFetch(
    request,
    // The browser's preload is the same request with the router's own headers,
    // so it can be answered from the HTTP cache like any other; a stale build
    // must not be, which is why it keeps the explicit revalidation.
    staleBuild ? null : options.preload,
    staleBuild ? { cache: 'no-cache' } : undefined
  )
    .then(async (response) => {
      if (response.ok && isCacheable(response)) {
        const write = (async () => {
          await store(CACHE, key, response.clone());
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
  if (isNavigationRequest(request)) {
    // A never-cache surface (`/admin`) keeps `/offline`: its guard answers on
    // the server, so the parent shell would be a page that cannot say anything
    // true about the request the user made (ADR-0031).
    if (isNeverCache(new URL(request.url))) return serveOffline(door);
    return serveNearestShell(request, door);
  }
  return new Response('Offline', { status: 503 });
}

// ---------------------------------------------------------------------------
// The nearest cached shell (#490)
//
// `/offline` used to answer a navigation this worker had no copy of, which
// replaced the screen the user asked for with a different one. The parent
// segment's document is almost always on the device even when the dynamic child
// is not — `/community` for `/community/<slug>`, `/quran` for `/quran/<surah>`
// — so a miss serves the longest cached ancestor instead: the URL stays the one
// requested, the app's own chrome is what paints, and the client draws an inline
// card that says this link is not available offline.
//
// The swap is invisible in the response, so it is recorded beside the worker's
// cache bookkeeping and read once by the app after hydration
// (`frontend/shared/prefix-serve.ts`). `/offline` keeps answering an empty cache
// and the never-cache surfaces (`/admin`), which never reach this path.
// ---------------------------------------------------------------------------

const PREFIX_MARKER_KEY = '/__sw_prefix_serve__';
const PREFIX_MARKER_VERSION = 1;
// A navigation clears the marker before it is answered, so what the app reads
// after hydration always describes the document in front of it: a later online
// visit to the same URL must not inherit an old prefix serve. The serve path
// awaits this so a clear can never land after the write it belongs to.
let prefixMarkerReset = Promise.resolve();

async function clearPrefixMarker() {
  try {
    const meta = await caches.open(CACHE_META_NAME);
    await meta.delete(PREFIX_MARKER_KEY);
  } catch (error) {
    console.log('[sw] prefix marker clear failed', String(error));
  }
}

async function writePrefixMarker(requested, served) {
  try {
    const meta = await caches.open(CACHE_META_NAME);
    await meta.put(
      PREFIX_MARKER_KEY,
      new Response(JSON.stringify({ version: PREFIX_MARKER_VERSION, requested, served }), {
        headers: { 'content-type': 'application/json' },
      })
    );
  } catch (error) {
    console.log('[sw] prefix marker write failed', String(error));
  }
}

/** The longest ancestor document this device holds, or null. */
async function nearestCachedShell(pathname) {
  const cache = await caches.open(CACHE);
  for (const prefix of shellPrefixCandidates(pathname)) {
    const response = await cache.match(prefix);
    if (response) return { served: prefix, response };
  }
  return null;
}

/**
 * Answers a navigation miss with the nearest cached ancestor and reports it as
 * its own door (ADR-0074): a prefix serve is a graceful fallback the field must
 * be able to tell from a real miss, which stays on `/offline`.
 */
async function serveNearestShell(request, door) {
  const pathname = new URL(request.url).pathname;
  if (pathname === FALLBACK_URL) return serveOffline(door);
  const shell = await nearestCachedShell(pathname);
  if (!shell) return serveOffline(door);
  await prefixMarkerReset;
  await writePrefixMarker(pathname, shell.served);
  void reportOfflineServe('navigation-prefix');
  return shell.response;
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
// A navigation takes the browser's preload when there is one (#492): this is the
// surface that gains most from it, because the request it waits on is the only
// thing between the tap and the guard that decides.
async function networkOnly(request, preload) {
  const navigation = isNavigationRequest(request);
  try {
    if (!navigation) return await fetch(request);
    const deadlineSunder = new Promise((resolve) =>
      setTimeout(() => resolve(undefined), NAVIGATION_TIMEOUT_MS)
    );
    const winner = await Promise.race([preloadedOrFetch(request, preload), deadlineSunder]);
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

  // This navigation's own answer decides the prefix marker: clear the previous
  // serve before anything can answer it (#490). A prefix serve writes the marker
  // back; anything else leaves it cleared.
  if (isNavigationRequest(request)) {
    prefixMarkerReset = clearPrefixMarker();
    event.waitUntil(prefixMarkerReset);
  }

  // Retry what a truly-offline serve could not send (ADR-0074's amendment).
  void flushOfflineReports();

  // The build's route shells refresh in idle windows after activation, never
  // during install (#489). The pass rides this event's lifetime: the page has
  // already been answered, and keeping the worker alive is what lets a window
  // finish instead of being cut between batches.
  const routeRefreshPass = maybeRefreshRouteShells();
  if (routeRefreshPass) event.waitUntil(routeRefreshPass);

  // A navigation starts at preload (#492): the browser asked for the document
  // while this worker was still booting, and `event.preloadResponse` is that
  // answer. Every navigation strategy below takes it instead of issuing a second
  // request; everything else has none to give.
  const preload = isNavigationRequest(request) ? event.preloadResponse || null : null;

  // Online-only surfaces bypass the cache entirely (ADR-0031).
  if (isNeverCache(url)) {
    event.respondWith(networkOnly(request, preload));
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
  // A live RSC payload is stored under one normalised key so the next navigation
  // to the same page answers from Cache Storage (#492); the key is computed only
  // here, after the never-cache list above has had its say.
  if (isNavigationRequest(request) || isRSCPayload(url)) {
    event.respondWith(
      staleWhileRevalidate(request, undefined, event, {
        cacheKey: isRSCPayload(url) ? cacheKeyFor(request) : null,
        preload,
      })
    );
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
