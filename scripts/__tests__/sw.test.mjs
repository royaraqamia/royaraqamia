/* global Buffer, console, URL, atob, btoa, setTimeout, clearTimeout */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/**
 * Loads public/sw.js inside a minimal ServiceWorkerGlobalScope shim so the
 * endpoint-rotation handler (`pushsubscriptionchange`) can be exercised
 * directly. The service worker is a plain classic script evaluated in the
 * worker realm, so it cannot be imported as a module — hence the vm sandbox.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SW_SOURCE = readFileSync(resolve(ROOT, 'public', 'sw.js'), 'utf8');
const ROUTING_SOURCE = readFileSync(resolve(ROOT, 'public', 'sw-routing.js'), 'utf8');

const TEST_KEY_B64 = Buffer.from(new Uint8Array(65).fill(7)).toString('base64url');
const PUSH_CONFIG_SCRIPT = `self.PUSH_CONFIG = { publicKey: '${TEST_KEY_B64}' };\n`;
// The caches are named by schema, not by build (#488), so these names are the
// worker's own literals rather than a function of the version below.
const DATA_CACHE = 'royaraqamia-data-v1';
const STATIC_CACHE = 'royaraqamia-static-v1';
const BUILD_A = 'royaraqamia-test-build-a';
const BUILD_B = 'royaraqamia-test-build-b';

function versionScript(cacheVersion = BUILD_A) {
  return `self.CACHE_VERSION = '${cacheVersion}';\n`;
}

class FakeEvent {
  constructor(type) {
    this.type = type;
    this.waitUntilCalls = [];
  }
  waitUntil(promise) {
    this.waitUntilCalls.push(Promise.resolve(promise));
  }
}

function makePushSubscription({ endpointBase, keyBuffer }) {
  let counter = 0;
  return {
    endpoint: `${endpointBase}-0`,
    getKey: vi.fn(() => keyBuffer),
    unsubscribe: vi.fn(async () => true),
    toJSON: () => ({
      endpoint: `${endpointBase}-${++counter}`,
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    }),
  };
}

function createSandbox({
  withPushConfig = true,
  fetchImpl,
  budgetBytes,
  routeBudgetBytes,
  navigationTimeoutMs,
  offlineReportRetryMs,
  precacheRoutes = [],
  cacheVersion = BUILD_A,
  routeRefreshIdleMs = 0,
  routeRefreshIntervalMs = 0,
  routeRefreshBatch,
  routeRefreshWindows,
  routeRefreshAssetBatch,
  // A second worker over the same Cache Storage, i.e. what a release does.
  storage,
} = {}) {
  const listeners = new Map();
  const cacheStores = storage ?? new Map();
  const state = { fetchCalls: [], subscribeCalls: [], showNotificationCalls: [] };
  let writeGate = null;

  // Cache Storage resolves relative keys against the worker origin. The fake
  // does the same so a `put(request, ...)` and `match('/path')` share one key.
  function keyOf(url) {
    const raw = typeof url === 'string' ? url : (url && url.url) || String(url);
    return raw.startsWith('/') ? `https://site.example${raw}` : raw;
  }

  // Real Cache Storage stores a copy and hands one out per `match`, so reading
  // an entry never disturbs the next reader. Clone real Responses to match that;
  // fixture objects (no `clone`) are kept by identity as before.
  function copy(value) {
    return value && typeof value.clone === 'function' ? value.clone() : value;
  }

  function openStore(name) {
    let store = cacheStores.get(name);
    if (!store) {
      store = new Map();
      cacheStores.set(name, store);
    }
    return {
      put: async (url, response) => {
        if (writeGate) await writeGate;
        store.set(keyOf(url), copy(response));
      },
      match: async (url) => copy(store.get(keyOf(url))),
      delete: async (url) => store.delete(keyOf(url)),
      keys: async () => [...store.keys()].map((url) => ({ url })),
      matchAll: async () => [...store.values()].map(copy),
      add: async (url) => {
        const response = await sandbox.fetch(url);
        if (!response.ok) throw new Error(`precache failed: ${url}`);
        store.set(keyOf(url), copy(response));
      },
      addAll: async (urls) => {
        await Promise.all(
          urls.map(async (url) => {
            const response = await sandbox.fetch(url);
            if (!response.ok) throw new Error(`precache failed: ${url}`);
            store.set(keyOf(url), copy(response));
          })
        );
      },
    };
  }

  const caches = {
    open: async (name) => openStore(name),
    keys: async () => [...cacheStores.keys()],
    match: async (url) => {
      for (const store of cacheStores.values()) {
        const hit = store.get(keyOf(url));
        if (hit) return copy(hit);
      }
      return undefined;
    },
    delete: async (name) => cacheStores.delete(name),
  };

  const sandbox = {
    console,
    URL,
    Response,
    Promise,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
    Notification: { permission: 'granted' },
    clients: {
      claim: async () => undefined,
      matchAll: async () => [],
      openWindow: async () => undefined,
      get: async (id) => ({ id, url: 'https://site.example/' }),
    },
    fetch: vi.fn(async (url, init) => {
      state.fetchCalls.push({ url: String(url), init });
      if (fetchImpl) return fetchImpl(url, init);
      return new Response('ok', { status: 200 });
    }),
    caches,
    location: { origin: 'https://site.example' },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener() {},
    skipWaiting: async () => undefined,
    importScripts(scriptUrl) {
      const name = String(scriptUrl).replace(/^\/+/, '');
      if (name === 'sw-push-config.js') {
        if (!withPushConfig) throw new Error('not found');
        return Function('self', 'caches', PUSH_CONFIG_SCRIPT)(sandbox, caches);
      }
      if (name === 'sw-version.js') {
        return Function('self', versionScript(cacheVersion))(sandbox);
      }
      if (name === 'sw-routing.js') {
        return Function('self', 'URL', ROUTING_SOURCE)(sandbox, URL);
      }
      if (name === 'sw-precache.js') {
        return Function(
          'self',
          `self.PRECACHE_ROUTES = ${JSON.stringify(precacheRoutes)};`
        )(sandbox);
      }
      throw new Error(`not found: ${name}`);
    },
  };
  sandbox.self = sandbox;
  if (budgetBytes !== undefined) sandbox.CACHE_BUDGET_BYTES = budgetBytes;
  if (routeBudgetBytes !== undefined) sandbox.ROUTE_PRECACHE_BUDGET_BYTES = routeBudgetBytes;
  if (navigationTimeoutMs !== undefined) sandbox.NAVIGATION_TIMEOUT_MS = navigationTimeoutMs;
  if (offlineReportRetryMs !== undefined) sandbox.OFFLINE_REPORT_RETRY_MS = offlineReportRetryMs;
  // The route refresh runs in idle windows, which no test should have to wait
  // for: zero delay unless a test supplies its own `requestIdleCallback`, and no
  // interval between passes so a test drives every window it needs.
  sandbox.ROUTE_REFRESH_IDLE_MS = routeRefreshIdleMs;
  sandbox.ROUTE_REFRESH_INTERVAL_MS = routeRefreshIntervalMs;
  if (routeRefreshBatch !== undefined) sandbox.ROUTE_REFRESH_BATCH = routeRefreshBatch;
  if (routeRefreshWindows !== undefined) sandbox.ROUTE_REFRESH_WINDOWS = routeRefreshWindows;
  if (routeRefreshAssetBatch !== undefined) {
    sandbox.ROUTE_REFRESH_ASSET_BATCH = routeRefreshAssetBatch;
  }
  // Cache maintenance is Cache Storage only. A Local Store or Outbox write from
  // this worker would be a bug the suite must see, so opening IndexedDB throws.
  sandbox.indexedDB = {
    open: vi.fn(() => {
      throw new Error('cache maintenance must not touch IndexedDB');
    }),
    databases: vi.fn(async () => {
      throw new Error('cache maintenance must not touch IndexedDB');
    }),
  };

  sandbox.registration = {
    // Navigation preload (#492). `activate` enables it and the fetch handler
    // collects `event.preloadResponse`; a test can drop the manager to stand in
    // for an engine that has no such thing.
    navigationPreload: { enable: vi.fn(async () => undefined) },
    pushManager: {
      getSubscription: vi.fn(async () => null),
      subscribe: vi.fn(async (options) => {
        state.subscribeCalls.push(options);
        return makePushSubscription({
          endpointBase: 'https://push.example/new',
          keyBuffer: new Uint8Array(options.applicationServerKey).slice().buffer,
        });
      }),
    },
    showNotification: vi.fn(async (title, options) => {
      state.showNotificationCalls.push({ title, options });
    }),
    getNotifications: vi.fn(async () => []),
  };

  function dispatch(type, event = new FakeEvent(type)) {
    for (const handler of listeners.get(type) ?? []) handler(event);
    return event;
  }

  // Suspends every pending `put` until the returned function is called, so a
  // test can prove the write is part of the response's lifetime rather than a
  // detached promise the worker would be free to drop.
  function holdWrites() {
    let release;
    writeGate = new Promise((resolve) => {
      release = resolve;
    });
    return () => {
      writeGate = null;
      release();
    };
  }

  return { sandbox, state, caches, dispatch, listeners, holdWrites };
}

async function boot({ keepFetchCalls = false, ...options } = {}) {
  const ctx = createSandbox(options);
  vm.runInNewContext(SW_SOURCE, ctx.sandbox, { filename: 'sw.js' });
  await Promise.all(ctx.dispatch('install').waitUntilCalls);
  await Promise.all(ctx.dispatch('activate').waitUntilCalls);
  // Activation starts the route refresh as a background pass (#489), so a booted
  // worker is not quiescent yet: let its idle windows play out before anything
  // asserts on what the cache holds.
  await settle(ctx);
  // Install precaches through `fetch`; those calls are not what the tests below
  // are counting unless one is asking about the install itself.
  if (!keepFetchCalls) ctx.state.fetchCalls.length = 0;
  return ctx;
}

/**
 * Waits until the background route pass stops asking for routes. It is started
 * by `activate` without being awaited, so this is the only signal a test has;
 * the sandbox runs every idle window at zero delay.
 */
async function settle(ctx) {
  for (let quiet = 0; quiet < 6;) {
    const before = ctx.state.fetchCalls.length;
    await new Promise((resolve) => setTimeout(resolve, 5));
    quiet = ctx.state.fetchCalls.length === before ? quiet + 1 : 0;
  }
}

/**
 * Drives one same-origin GET through a booted worker, the way a page would. The
 * route refresh already ran in `activate`; a fetch is how a pass that stopped
 * early is asked to continue.
 */
async function runRouteRefresh(ctx) {
  const event = new FakeEvent('fetch');
  event.request = {
    method: 'GET',
    mode: 'navigate',
    url: 'https://site.example/',
    headers: { get: () => null },
  };
  event.respondWith = (response) => {
    event.response = response;
  };
  ctx.dispatch('fetch', event);
  await event.response;
  await Promise.all(event.waitUntilCalls);
}

/** Boots a worker without dispatching `activate`, so install can be observed alone. */
function installOnly(options) {
  const ctx = createSandbox(options);
  vm.runInNewContext(SW_SOURCE, ctx.sandbox, { filename: 'sw.js' });
  return ctx;
}

describe('service worker pushsubscriptionchange handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-subscribes and posts the fresh subscription when none exists', async () => {
    const { dispatch, state } = await boot();

    const event = dispatch('pushsubscriptionchange');
    await expect(event.waitUntilCalls[0]).resolves.toBeUndefined();

    expect(state.subscribeCalls).toHaveLength(1);
    expect(state.subscribeCalls[0].userVisibleOnly).toBe(true);
    expect(new Uint8Array(state.subscribeCalls[0].applicationServerKey)).toEqual(
      new Uint8Array(65).fill(7)
    );
    expect(state.fetchCalls).toHaveLength(1);
    expect(state.fetchCalls[0]).toMatchObject({
      url: '/api/push/subscribe',
      init: { method: 'POST', credentials: 'include' },
    });
    expect(JSON.parse(state.fetchCalls[0].init.body).keys).toEqual({
      p256dh: 'p256dh-value',
      auth: 'auth-value',
    });
  });

  it('keeps an existing subscription whose application server key still matches', async () => {
    const existing = makePushSubscription({
      endpointBase: 'https://push.example/current',
      keyBuffer: new Uint8Array(65).fill(7).buffer,
    });
    const { sandbox, dispatch, state } = await boot();
    sandbox.registration.pushManager.getSubscription.mockResolvedValue(existing);

    const event = dispatch('pushsubscriptionchange');
    await expect(event.waitUntilCalls[0]).resolves.toBeUndefined();

    expect(existing.unsubscribe).not.toHaveBeenCalled();
    expect(state.subscribeCalls).toHaveLength(0);
    expect(state.fetchCalls).toHaveLength(0);
  });

  it('rotates an existing subscription bound to a different application server key', async () => {
    const stale = makePushSubscription({
      endpointBase: 'https://push.example/stale',
      keyBuffer: new Uint8Array(65).fill(9).buffer,
    });
    const { sandbox, dispatch, state } = await boot();
    sandbox.registration.pushManager.getSubscription.mockResolvedValue(stale);

    const event = dispatch('pushsubscriptionchange');
    await expect(event.waitUntilCalls[0]).resolves.toBeUndefined();

    expect(stale.unsubscribe).toHaveBeenCalledTimes(1);
    expect(state.subscribeCalls).toHaveLength(1);
    expect(state.fetchCalls).toHaveLength(1);
    expect(state.fetchCalls[0].init.method).toBe('POST');
  });

  it('is a no-op when notification permission was never granted', async () => {
    const { sandbox, dispatch, state } = await boot();
    sandbox.Notification.permission = 'default';

    const event = dispatch('pushsubscriptionchange');
    await expect(event.waitUntilCalls[0]).resolves.toBeUndefined();

    expect(state.subscribeCalls).toHaveLength(0);
    expect(state.fetchCalls).toHaveLength(0);
  });

  it('is a no-op when the user opted out via the shared-cache marker', async () => {
    const { caches, dispatch, state } = await boot();
    const prefs = await caches.open('royaraqamia-push-prefs');
    await prefs.put('/__push_disabled__', {});

    const event = dispatch('pushsubscriptionchange');
    await expect(event.waitUntilCalls[0]).resolves.toBeUndefined();

    expect(state.subscribeCalls).toHaveLength(0);
    expect(state.fetchCalls).toHaveLength(0);
  });

  it('is a no-op when the VAPID config script failed to load (raw clone without prebuild)', async () => {
    const { sandbox, dispatch, state } = await boot({ withPushConfig: false });

    expect(sandbox.PUSH_CONFIG).toBeNull();
    const event = dispatch('pushsubscriptionchange');
    await expect(event.waitUntilCalls[0]).resolves.toBeUndefined();

    expect(state.subscribeCalls).toHaveLength(0);
    expect(state.fetchCalls).toHaveLength(0);
  });

  it('never lets a rotation failure crash the service worker', async () => {
    const { sandbox, dispatch } = await boot();
    sandbox.registration.pushManager.getSubscription.mockRejectedValue(new Error('boom'));

    const event = dispatch('pushsubscriptionchange');
    await expect(event.waitUntilCalls[0]).resolves.toBeUndefined();
  });

  it('preserves the push preference cache during activation cleanup', async () => {
    const { caches, dispatch } = await boot();
    await caches.open('royaraqamia-push-prefs');
    await caches.open('royaraqamia-stale-old-cache');

    await Promise.all(dispatch('activate').waitUntilCalls);

    const names = await caches.keys();
    expect(names).toContain('royaraqamia-push-prefs');
    expect(names).not.toContain('royaraqamia-stale-old-cache');
  });

  it('still shows a notification from a raw push payload', async () => {
    const { dispatch, state } = await boot();

    const event = new FakeEvent('push');
    event.data = {
      json: () => ({ title: 'مرحبا', body: 'نص الإشعار', url: '/linksnap', notificationId: 'n-1' }),
    };
    dispatch('push', event);
    await Promise.all(event.waitUntilCalls);

    expect(state.showNotificationCalls).toHaveLength(1);
    expect(state.showNotificationCalls[0].title).toBe('مرحبا');
    expect(state.showNotificationCalls[0].options.data.url).toBe('/linksnap');
    expect(state.showNotificationCalls[0].options.tag).toBe('n-1');
  });
});

describe('service worker Background Sync wiring', () => {
  const OUTBOX_TAG = 'outbox-flush';

  function bridge(tag = OUTBOX_TAG, drain = vi.fn(async () => [])) {
    return { tag, drain };
  }

  function syncEvent(tag) {
    const event = new FakeEvent('sync');
    event.tag = tag;
    return event;
  }

  it('drains the Outbox through the generated bridge', async () => {
    const { sandbox, dispatch } = await boot();
    // A raw clone has no generated `sw-outbox.js`; the bridge is what the build
    // hands the worker, so the test sets the same shape.
    expect(sandbox.SWOutbox).toBeNull();
    const outbox = bridge();
    sandbox.SWOutbox = outbox;

    const event = dispatch('sync', syncEvent(OUTBOX_TAG));
    await Promise.all(event.waitUntilCalls);

    expect(outbox.drain).toHaveBeenCalledTimes(1);
  });

  it('takes the tag from the bridge rather than naming it a second time', async () => {
    const { sandbox, dispatch } = await boot();
    const outbox = bridge('a-tag-the-worker-was-handed');
    sandbox.SWOutbox = outbox;

    const foreign = dispatch('sync', syncEvent(OUTBOX_TAG));
    expect(foreign.waitUntilCalls).toHaveLength(0);
    expect(outbox.drain).not.toHaveBeenCalled();

    const owned = dispatch('sync', syncEvent('a-tag-the-worker-was-handed'));
    await Promise.all(owned.waitUntilCalls);
    expect(outbox.drain).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the drain script never loaded', async () => {
    const { dispatch } = await boot();

    const event = dispatch('sync', syncEvent(OUTBOX_TAG));

    expect(event.waitUntilCalls).toHaveLength(0);
  });

  it('keeps the registration pending when the drain rejects', async () => {
    const { sandbox, dispatch } = await boot();
    sandbox.SWOutbox = bridge(
      OUTBOX_TAG,
      vi.fn(async () => {
        throw new Error('still queued');
      })
    );

    const event = dispatch('sync', syncEvent(OUTBOX_TAG));

    // Rejecting is how the worker asks the browser for another attempt; a
    // resolved event would retire the registration with work still queued.
    await expect(event.waitUntilCalls[0]).rejects.toThrow('still queued');
  });
});

describe('service worker routing wiring', () => {
  it('exposes the extracted routing module to the worker realm', async () => {
    const { sandbox } = await boot();

    expect(typeof sandbox.SWRouting.isNeverCache).toBe('function');
    expect(sandbox.SWRouting.isNeverCache(new URL('https://site.example/admin'))).toBe(true);
    expect(sandbox.SWRouting.isNeverCache(new URL('https://site.example/community/x'))).toBe(false);
    // The App Router's flight request uses `_rsc`, not `__rsc`.
    expect(
      sandbox.SWRouting.isRSCPayload(new URL('https://site.example/community?_rsc=1abc'))
    ).toBe(true);
  });

  it('never reads or writes the admin certificates API through Cache Storage', async () => {
    const { caches, dispatch, state } = await boot();
    const cache = await caches.open(DATA_CACHE);
    const key = '/api/certificates?page=1';
    const stale = { ok: true, status: 200, body: 'stale-admin-list' };
    await cache.put(key, stale);

    const event = new FakeEvent('fetch');
    event.respondWith = (response) => {
      event.response = response;
    };
    event.request = {
      method: 'GET',
      mode: 'cors',
      url: `https://site.example${key}`,
      headers: { get: () => null },
    };
    dispatch('fetch', event);

    // Online: the live response, not the cached admin list the last session left.
    expect(state.fetchCalls).toHaveLength(1);
    expect(await event.response).not.toBe(stale);
    // And nothing was written over it: the stale entry is untouched.
    expect(await caches.match(key)).toBe(stale);
  });
});

describe('service worker image routing', () => {
  function imageRequest(path) {
    return {
      method: 'GET',
      mode: 'cors',
      url: `https://site.example${path}`,
      headers: { get: () => null },
    };
  }

  function fetchEvent(request) {
    const event = new FakeEvent('fetch');
    event.request = request;
    event.respondWith = (response) => {
      event.response = response;
    };
    return event;
  }

  it('answers an image width nobody fetched offline with a placeholder, never a 503', async () => {
    const { dispatch, sandbox } = await boot();
    sandbox.fetch = vi.fn(async () => {
      throw new Error('offline');
    });

    const event = fetchEvent(imageRequest('/_next/image?url=%2F01.webp&w=3840&q=75'));
    dispatch('fetch', event);
    const response = await event.response;

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/svg+xml');
  });

  it('reuses a cached rendering of the same source when a new width is requested offline', async () => {
    const { dispatch, sandbox } = await boot();
    const cachedImage = new Response('cached-image', {
      status: 200,
      headers: { 'cache-control': 'public, max-age=86400', 'content-type': 'image/webp' },
    });
    sandbox.fetch = vi.fn(async () => cachedImage);

    // The online visit fetches one width; it is remembered under the source.
    const online = fetchEvent(imageRequest('/_next/image?url=%2F01.webp&w=828&q=75'));
    dispatch('fetch', online);
    expect((await online.response).status).toBe(200);

    // The offline visit asks for a width that was never fetched.
    sandbox.fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    const offline = fetchEvent(imageRequest('/_next/image?url=%2F01.webp&w=1200&q=75'));
    dispatch('fetch', offline);
    const response = await offline.response;

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('cached-image');
  });
});

describe('service worker cache durability', () => {
  function request(path, mode = 'cors') {
    return {
      method: 'GET',
      mode,
      url: `https://site.example${path}`,
      headers: { get: () => null },
    };
  }

  function fetchEvent(req) {
    const event = new FakeEvent('fetch');
    event.request = req;
    event.respondWith = (response) => {
      event.response = response;
    };
    return event;
  }

  it('writes a first-visit response before handing it back to the page', async () => {
    const ctx = await boot();
    const release = ctx.holdWrites();

    const event = fetchEvent(request('/community', 'navigate'));
    ctx.dispatch('fetch', event);

    let settled = false;
    event.response.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The put is still pending, so the response must not have settled: if it
    // had, the browser could terminate the worker and lose the write.
    expect(settled).toBe(false);

    release();
    const response = await event.response;
    expect(response.status).toBe(200);
    // Survives the hypothetical termination because it was already persisted.
    expect(await ctx.caches.match('https://site.example/community')).toBeTruthy();
  });

  it('installs when one precache URL fails, still caching the rest', async () => {
    const failedUrl = '/icons/notification-icon-192x192.png';
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    // `boot` awaits install; a rejected install would reject here.
    const { caches } = await boot({
      fetchImpl: async (url) =>
        String(url).includes('notification-icon')
          ? { ok: false, status: 404 }
          : { ok: true, status: 200 },
    });

    const cache = await caches.open(DATA_CACHE);
    expect(await cache.match('/')).toBeTruthy();
    expect(await cache.match('/offline')).toBeTruthy();
    expect(await cache.match(failedUrl)).toBeUndefined();
    expect(log.mock.calls.flat().join(' ')).toContain(failedUrl);

    log.mockRestore();
  });

  it('precaches the build route shells and skips one failed URL', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const routes = ['/privacy', '/terms', '/security'];

    const ctx = await boot({
      precacheRoutes: routes,
      fetchImpl: async (url) => {
        if (String(url).includes('/terms')) return new Response('missing', { status: 404 });
        return new Response('shell', {
          status: 200,
          headers: {
            'content-type': 'text/html',
            'content-length': '5',
            'cache-control': 'public, max-age=60',
          },
        });
      },
    });

    const cache = await ctx.caches.open(DATA_CACHE);
    // The failed URL does not reject the pass or block the routes after it.
    expect(await cache.match('/privacy')).toBeTruthy();
    expect(await cache.match('/security')).toBeTruthy();
    expect(await cache.match('/terms')).toBeUndefined();
    expect(log.mock.calls.flat().join(' ')).toContain('/terms');

    log.mockRestore();
  });

  // `precache` is the one place the worker fetches a URL it is handed, so a URL
  // resolving off this origin is refused instead of fetched: the worker stores
  // what it fetches, so an internal address would be served back to whatever
  // asked for it (CodeQL `js/client-side-request-forgery`).
  it('fetches only same-origin URLs, whatever the caller passes in', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const ctx = await boot();
    ctx.state.fetchCalls.length = 0;

    const cache = await ctx.caches.open(DATA_CACHE);
    await ctx.sandbox.precache(cache, [
      '/privacy?from=test',
      'https://internal.example/admin',
      '//evil.example/x',
      'javascript:alert(1)',
    ]);

    // The same-origin path is fetched unchanged; the other three never leave.
    expect(ctx.state.fetchCalls.map((call) => call.url)).toEqual(['/privacy?from=test']);
    expect(await cache.match('/privacy?from=test')).toBeTruthy();
    log.mockRestore();
  });

  it('stops adding route shells at the route budget', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const ctx = await boot({
      precacheRoutes: ['/a', '/b', '/c'],
      routeBudgetBytes: 500,
      // One route per window keeps the spend strictly sequential, so the
      // assertion is about the ceiling and not about two lanes racing for it.
      routeRefreshBatch: 1,
      routeRefreshWindows: 3,
      fetchImpl: async () =>
        new Response('shell', {
          status: 200,
          headers: {
            'content-type': 'text/html',
            'content-length': '300',
            'cache-control': 'public, max-age=60',
          },
        }),
    });

    const cache = await ctx.caches.open(DATA_CACHE);
    // 300 fits; the second would take the list to 600, over the 500 ceiling.
    expect(await cache.match('/a')).toBeTruthy();
    expect(await cache.match('/b')).toBeUndefined();
    expect(await cache.match('/c')).toBeUndefined();
    expect(log.mock.calls.flat().join(' ')).toContain('budget reached');

    log.mockRestore();
  });

  it('does not spend cache budget it does not have on route shells', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const ctx = await boot({
      budgetBytes: 100,
      precacheRoutes: ['/privacy'],
      routeRefreshBatch: 1,
      routeRefreshWindows: 1,
      fetchImpl: async (url) => {
        // The fixed shell is empty, so the route has to fit in what is left.
        if (String(url) === '/privacy') {
          return new Response('shell', {
            status: 200,
            headers: {
              'content-type': 'text/html',
              'content-length': '200',
              'cache-control': 'public, max-age=60',
            },
          });
        }
        return new Response('', {
          status: 200,
          headers: { 'content-length': '0', 'cache-control': 'public, max-age=60' },
        });
      },
    });

    const cache = await ctx.caches.open(DATA_CACHE);
    expect(await cache.match('/privacy')).toBeUndefined();
    expect(log.mock.calls.flat().join(' ')).toContain('budget reached');

    log.mockRestore();
  });

  it('serves the last good cached API read when the network answers 5xx', async () => {
    const { caches, dispatch, sandbox } = await boot();
    const cache = await caches.open(DATA_CACHE);
    const good = new Response('cached-rates', {
      status: 200,
      headers: { 'cache-control': 'public, max-age=60' },
    });
    await cache.put('/api/rates?pair=usd', good);
    sandbox.fetch = vi.fn(async () => new Response('upstream down', { status: 503 }));

    const event = fetchEvent(request('/api/rates?pair=usd'));
    dispatch('fetch', event);
    const response = await event.response;

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('cached-rates');
  });

  it('returns the 5xx when no cached copy exists', async () => {
    const { dispatch, sandbox } = await boot();
    sandbox.fetch = vi.fn(async () => new Response('upstream down', { status: 502 }));

    const event = fetchEvent(request('/api/rates?pair=usd'));
    dispatch('fetch', event);
    const response = await event.response;

    expect(response.status).toBe(502);
    expect(await response.text()).toBe('upstream down');
  });

  it('never writes a range/206 response to Cache Storage', async () => {
    const { caches, dispatch, sandbox } = await boot();
    sandbox.fetch = vi.fn(
      async () =>
        new Response('partial-bytes', {
          status: 206,
          headers: { 'content-range': 'bytes 0-12/1000' },
        })
    );

    const event = fetchEvent(request('/_next/static/chunk.js'));
    dispatch('fetch', event);
    const response = await event.response;

    expect(response.status).toBe(206);
    expect(await caches.match('https://site.example/_next/static/chunk.js')).toBeUndefined();
  });
});

describe('service worker cache budget and eviction', () => {
  const RUNTIME_CACHE = DATA_CACHE;

  function request(path, mode = 'navigate') {
    return {
      method: 'GET',
      mode,
      url: `https://site.example${path}`,
      headers: { get: () => null },
    };
  }

  function fetchEvent(req) {
    const event = new FakeEvent('fetch');
    event.request = req;
    event.respondWith = (response) => {
      event.response = response;
    };
    return event;
  }

  // Install precaches the shell; give those entries no bytes so each test's
  // arithmetic is about the churn it writes, not the fixed shell.
  function emptyResponse() {
    return new Response('', { status: 200, headers: { 'content-length': '0' } });
  }

  function sized(bytes, contentType = 'text/html') {
    return new Response('x'.repeat(16), {
      status: 200,
      headers: {
        'content-type': contentType,
        'content-length': String(bytes),
        'cache-control': 'public, max-age=60',
      },
    });
  }

  async function fetchInto(ctx, req, response) {
    ctx.sandbox.fetch = vi.fn(async () => response);
    const event = fetchEvent(req);
    ctx.dispatch('fetch', event);
    return event.response;
  }

  async function visit(ctx, path, bytes) {
    const response = await fetchInto(ctx, request(path), sized(bytes));
    expect(response.status).toBe(200);
  }

  async function runtimeEntries(ctx, cacheName = RUNTIME_CACHE) {
    const cache = await ctx.caches.open(cacheName);
    const requests = await cache.keys();
    const entries = {};
    for (const { url } of requests) {
      const response = await cache.match(url);
      entries[url.replace('https://site.example', '')] = Number(
        response.headers.get('content-length') || 0
      );
    }
    return entries;
  }

  function totalOf(entries) {
    return Object.values(entries).reduce((sum, size) => sum + size, 0);
  }

  it('keeps accounted bytes at or below the budget under page churn', async () => {
    const ctx = await boot({ budgetBytes: 1000, fetchImpl: async () => emptyResponse() });

    // Pages, RSC variants, responsive image widths and search queries all land
    // in the same cache, and each one is another chance to grow past the budget.
    for (let index = 0; index < 8; index += 1) {
      await visit(ctx, `/community?page=${index}`, 400);
      await visit(ctx, `/community?_rsc=${index}`, 400);
      await visit(ctx, `/_next/image?url=%2F01.webp&w=${640 + index * 120}&q=75`, 400);
      await visit(ctx, `/api/search?q=${index}`, 400);
    }

    const entries = await runtimeEntries(ctx);
    expect(totalOf(entries)).toBeLessThanOrEqual(1000);
    expect(entries).toHaveProperty('/offline');
    expect(ctx.sandbox.indexedDB.open).not.toHaveBeenCalled();
    expect(ctx.sandbox.indexedDB.databases).not.toHaveBeenCalled();
  });

  it('evicts the least-recently-used entry, not the newest', async () => {
    const ctx = await boot({ budgetBytes: 1000, fetchImpl: async () => emptyResponse() });
    await visit(ctx, '/a', 300);
    await visit(ctx, '/b', 300);
    await visit(ctx, '/c', 300);

    // Read A again, offline: that is its most recent use.
    ctx.sandbox.fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    const hit = fetchEvent(request('/a'));
    ctx.dispatch('fetch', hit);
    expect((await hit.response).status).toBe(200);

    // The fourth entry takes the cache over budget; B is the one left unused.
    await visit(ctx, '/d', 300);

    const entries = await runtimeEntries(ctx);
    expect(entries['/a']).toBe(300);
    expect(entries['/b']).toBeUndefined();
    expect(entries['/c']).toBe(300);
    expect(entries['/d']).toBe(300);
    expect(totalOf(entries)).toBeLessThanOrEqual(1000);
  });

  it("never evicts the offline page or the current build's static assets", async () => {
    const ctx = await boot({ budgetBytes: 1000, fetchImpl: async () => emptyResponse() });

    // The build asset goes in first, so it is the oldest entry once pages land.
    await fetchInto(
      ctx,
      request('/_next/static/chunks/app.js', 'cors'),
      sized(300, 'application/javascript')
    );
    await visit(ctx, '/a', 300);
    await visit(ctx, '/b', 300);
    // One more page forces an eviction. It must take the oldest page, not the
    // older static chunk or the offline page.
    await visit(ctx, '/c', 300);

    const entries = await runtimeEntries(ctx);
    const staticEntries = await runtimeEntries(ctx, STATIC_CACHE);
    expect(staticEntries['/_next/static/chunks/app.js']).toBe(300);
    expect(entries).toHaveProperty('/offline');
    expect(entries['/a']).toBeUndefined();
    expect(entries['/b']).toBe(300);
    expect(entries['/c']).toBe(300);
  });

  it('purges account-bearing entries on sign-out and keeps the offline shell', async () => {
    const ctx = await boot({ budgetBytes: 10_000, precacheRoutes: ['/privacy'] });

    await visit(ctx, '/community', 100);
    await fetchInto(
      ctx,
      request('/api/rates?pair=usd', 'cors'),
      new Response('rates', {
        status: 200,
        headers: { 'cache-control': 'public, max-age=60' },
      })
    );
    await fetchInto(
      ctx,
      request('/_next/static/chunks/app.js', 'cors'),
      sized(50, 'application/javascript')
    );
    const prefs = await ctx.caches.open('royaraqamia-push-prefs');
    await prefs.put('/__push_disabled__', {});

    const event = new FakeEvent('message');
    event.data = { type: 'PURGE_ACCOUNT_CACHES' };
    event.source = { id: 'client-1' };
    event.ports = [{ postMessage: vi.fn() }];
    ctx.dispatch('message', event);
    await Promise.all(event.waitUntilCalls);

    // Pages, RSC payloads and public reads may have been rendered for the
    // signed-in caller; none of them survives.
    expect(await ctx.caches.match('/community')).toBeUndefined();
    expect(await ctx.caches.match('/api/rates?pair=usd')).toBeUndefined();
    expect(await ctx.caches.match('/')).toBeUndefined();
    // The offline shell, the build's static assets and the device preference do.
    expect(await ctx.caches.match('/offline')).toBeTruthy();
    // A public route shell was prerendered without a session and survives too
    // (#395): it carries no account data, and a signed-out device still needs
    // it to deep-link offline.
    expect(await ctx.caches.match('/privacy')).toBeTruthy();
    expect(await ctx.caches.match('/_next/static/chunks/app.js')).toBeTruthy();
    expect(await ctx.caches.match('/__push_disabled__')).toBeTruthy();
    expect(event.ports[0].postMessage).toHaveBeenCalledWith({ type: 'ACCOUNT_CACHES_PURGED' });
    // Local Store and Outbox were never opened.
    expect(ctx.sandbox.indexedDB.open).not.toHaveBeenCalled();
    expect(ctx.sandbox.indexedDB.databases).not.toHaveBeenCalled();
  });
});

describe('service worker navigation deadline (#447)', () => {
  function request(path, mode = 'navigate') {
    return {
      method: 'GET',
      mode,
      url: `https://site.example${path}`,
      headers: { get: () => null },
    };
  }

  function fetchEvent(req) {
    const event = new FakeEvent('fetch');
    event.request = req;
    event.respondWith = (response) => {
      event.response = response;
    };
    return event;
  }

  it('gives a cold navigation a three-second deadline by default (#491)', () => {
    // The tests below shrink the deadline through the realm global; this pins
    // the production number so a refactor cannot quietly restore ten seconds.
    expect(SW_SOURCE).toMatch(
      /const NAVIGATION_TIMEOUT_MS = self\.NAVIGATION_TIMEOUT_MS \|\| 3_000;/
    );
  });

  it('answers a cached navigation instantly while the network hangs', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    const cache = await ctx.caches.open(DATA_CACHE);
    await cache.put('https://site.example/rates', new Response('stale-shell'));

    // A request the network never answers: a slow connection, not a dead one.
    ctx.sandbox.fetch = vi.fn(() => new Promise(() => undefined));

    const event = fetchEvent(request('/rates'));
    ctx.dispatch('fetch', event);

    // Stale paint must not depend on the deadline at all: the cached copy has
    // already answered before the 20ms budget could even elapse.
    await expect(event.response).resolves.toBeTruthy();
    const response = await event.response;
    expect(await response.text()).toBe('stale-shell');
  });

  it('gives a cold navigation the offline fallback after the deadline, then keeps a late answer for the next visit', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    // An empty shell, which is the one shape `/offline` still answers (#490): no
    // ancestor document is on the device, so there is nothing to prefix-serve.
    await (await ctx.caches.open(DATA_CACHE)).delete('https://site.example/');
    ctx.sandbox.fetch = vi.fn(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                new Response('late-shell', {
                  status: 200,
                  headers: { 'cache-control': 'public, max-age=60' },
                })
              ),
            60
          )
        )
    );

    const event = fetchEvent(request('/community'));
    ctx.dispatch('fetch', event);

    // The deadline cut the cold load: the page sees the offline fallback, not
    // the browser's own multi-minute hang.
    expect(await event.response.then((r) => r.text())).toBe('ok');

    // The cut fetch keeps running as the lifetime extension and still writes.
    await Promise.all(event.waitUntilCalls);
    expect(await ctx.caches.match('https://site.example/community')).toBeTruthy();

    // The next visit — even with the radio off — gets the real page.
    ctx.sandbox.fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    const second = fetchEvent(request('/community'));
    ctx.dispatch('fetch', second);
    expect(await second.response.then((r) => r.text())).toBe('late-shell');
  });

  it('bounds a never-cache navigation with the same deadline', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    ctx.sandbox.fetch = vi.fn(() => new Promise(() => undefined));

    const event = fetchEvent(request('/admin'));
    ctx.dispatch('fetch', event);

    // `/admin` bypasses the cache entirely (ADR-0031), but a slow network must
    // still not hang the document: /offline arrives at the deadline.
    await expect(event.response.then((r) => r.text())).resolves.toBe('ok');
  });

  it('caches the auth document shell like any other public page (#447)', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    const shell = () =>
      new Response('login-shell', {
        status: 200,
        headers: { 'cache-control': 'public, max-age=60' },
      });
    ctx.sandbox.fetch = vi.fn(async () => shell());

    const online = fetchEvent(request('/auth/login'));
    ctx.dispatch('fetch', online);
    const first = await online.response;
    expect(await first.text()).toBe('login-shell');
    expect(await ctx.caches.match('https://site.example/auth/login')).toBeTruthy();

    // Radio off: the reload paints the cached form instead of the offline page.
    ctx.sandbox.fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    const offline = fetchEvent(request('/auth/login'));
    ctx.dispatch('fetch', offline);
    expect(await offline.response.then((r) => r.text())).toBe('login-shell');
  });
});

describe('service worker RSC cache key and navigation preload (#492)', () => {
  /**
   * A request the App Router sends for an RSC payload. `headers` carries the
   * router's own markers: `next-router-prefetch` for a speculative prefetch.
   */
  function request(path, mode = 'cors', headers = {}) {
    return {
      method: 'GET',
      mode,
      url: `https://site.example${path}`,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    };
  }

  function fetchEvent(req, preloadResponse) {
    const event = new FakeEvent('fetch');
    event.request = req;
    // A real FetchEvent always carries the promise; only a test that is about
    // preload sets one.
    if (preloadResponse !== undefined) event.preloadResponse = preloadResponse;
    event.respondWith = (response) => {
      event.response = response;
    };
    return event;
  }

  /** A static route's payload: cacheable, which is what a shared key requires. */
  function cacheable(body) {
    return new Response(body, {
      status: 200,
      headers: { 'cache-control': 's-maxage=31536000' },
    });
  }

  function noNetwork(ctx) {
    ctx.sandbox.fetch = vi.fn(async () => {
      throw new Error('offline');
    });
  }

  /** The cache entries under `pathname`, whatever their query. */
  async function entriesFor(ctx, pathname) {
    const cache = await ctx.caches.open(DATA_CACHE);
    const keys = await cache.keys();
    return keys.map((entry) => new URL(entry.url)).filter((url) => url.pathname === pathname);
  }

  it('answers a repeat navigation from the one key, whatever hash it arrives with', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    ctx.sandbox.fetch = vi.fn(async () => cacheable('flight-payload'));

    // The live payload a navigation fetches: `_rsc` is a hash of the router's
    // own headers, so the next navigation to the same page arrives on a
    // different URL — and, before #492, an empty entry.
    const first = fetchEvent(request('/community?_rsc=first-state'));
    ctx.dispatch('fetch', first);
    expect(await first.response.then((response) => response.text())).toBe('flight-payload');
    await Promise.all(first.waitUntilCalls);

    noNetwork(ctx);
    const second = fetchEvent(request('/community?_rsc=second-state'));
    ctx.dispatch('fetch', second);

    expect(await second.response.then((response) => response.text())).toBe('flight-payload');

    const entries = await entriesFor(ctx, '/community');
    expect(entries).toHaveLength(1);
    expect(entries[0].search).toBe('?_rsc=1');
  });

  it('never serves a prefetched body as the answer to a navigation', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    ctx.sandbox.fetch = vi.fn(async () => cacheable('prefetched-partial'));

    // A `Link` prefetch. Its body is partial by design, and Next refuses it as a
    // navigation answer — handed one, the router abandons the soft navigation for
    // a full document load, which is the round trip this change removes. So a
    // prefetch keeps its own URL and never lands on the navigation's key.
    const prefetch = fetchEvent(
      request('/community?_rsc=prefetch', 'cors', { 'next-router-prefetch': '1' })
    );
    ctx.dispatch('fetch', prefetch);
    expect(await prefetch.response.then((response) => response.text())).toBe('prefetched-partial');
    await Promise.all(prefetch.waitUntilCalls);

    expect(await ctx.caches.match('https://site.example/community?_rsc=1')).toBeFalsy();

    // The navigation is a miss, so with the radio off it is not answered with the
    // prefetched body.
    noNetwork(ctx);
    const navigation = fetchEvent(request('/community?_rsc=live'));
    ctx.dispatch('fetch', navigation);
    expect(await navigation.response.then((response) => response.text())).not.toBe(
      'prefetched-partial'
    );
  });

  it('never lets a flight payload answer the document of the same path', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    ctx.sandbox.fetch = vi.fn(async () => cacheable('flight-payload'));

    const navigation = fetchEvent(request('/community?_rsc=aaa'));
    ctx.dispatch('fetch', navigation);
    await navigation.response.then((response) => response.text());
    await Promise.all(navigation.waitUntilCalls);

    // The document is a different body, so it keeps its own key: a hard
    // navigation cannot be handed a flight payload as HTML.
    expect(await ctx.caches.match('https://site.example/community')).toBeFalsy();

    noNetwork(ctx);
    const document = fetchEvent(request('/community', 'navigate'));
    ctx.dispatch('fetch', document);
    expect(await document.response.then((response) => response.text())).not.toBe('flight-payload');
  });

  it('never keys or stores a payload on a never-cache surface', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    ctx.sandbox.fetch = vi.fn(async () => cacheable('admin-flight'));

    const event = fetchEvent(request('/admin/rates?_rsc=aaa'));
    ctx.dispatch('fetch', event);

    expect(await event.response.then((response) => response.text())).toBe('admin-flight');
    expect(await entriesFor(ctx, '/admin/rates')).toHaveLength(0);
  });

  it('answers a navigation from the browser preload instead of a second request', async () => {
    const ctx = await boot({
      navigationTimeoutMs: 20,
      fetchImpl: async () => {
        throw new Error('the worker must not fetch a preloaded navigation');
      },
    });

    const event = fetchEvent(
      request('/community', 'navigate'),
      Promise.resolve(cacheable('preloaded-shell'))
    );
    ctx.dispatch('fetch', event);

    expect(await event.response.then((response) => response.text())).toBe('preloaded-shell');
    // The win is structural: the document request the browser already started is
    // the one that answered, and no second request was issued.
    expect(ctx.state.fetchCalls).toHaveLength(0);

    // It is still a cache write, so the next visit has a copy.
    await Promise.all(event.waitUntilCalls);
    expect(await ctx.caches.match('https://site.example/community')).toBeTruthy();
  });

  it('falls back to its own request when the browser preloaded nothing', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    ctx.sandbox.fetch = vi.fn(async () => cacheable('fetched-shell'));

    const event = fetchEvent(request('/community', 'navigate'), Promise.resolve(undefined));
    ctx.dispatch('fetch', event);

    expect(await event.response.then((response) => response.text())).toBe('fetched-shell');
  });

  it('takes the preload on a never-cache navigation and stores nothing', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });

    const event = fetchEvent(
      request('/admin/rates', 'navigate'),
      Promise.resolve(cacheable('preloaded-admin'))
    );
    ctx.dispatch('fetch', event);

    expect(await event.response.then((response) => response.text())).toBe('preloaded-admin');
    expect(await entriesFor(ctx, '/admin/rates')).toHaveLength(0);
  });

  it('still cuts a preload that never answers at the navigation deadline', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });

    const event = fetchEvent(request('/community', 'navigate'), new Promise(() => undefined));
    ctx.dispatch('fetch', event);

    // The deadline answers with the nearest cached shell (`/`), and the hanging
    // preload is never awaited into the response. The only request the page
    // causes is the telemetry beacon a prefix serve sends.
    expect(await event.response.then((response) => response.text())).toBe('ok');
    const documentFetches = ctx.state.fetchCalls.filter(
      (call) => !call.url.startsWith('/api/offline-serve')
    );
    expect(documentFetches).toHaveLength(0);
  });

  it('enables navigation preload during activation', async () => {
    const ctx = await boot();
    expect(ctx.sandbox.registration.navigationPreload.enable).toHaveBeenCalledTimes(1);
  });

  it('activates on an engine that has no navigation preload', async () => {
    const ctx = installOnly();
    delete ctx.sandbox.registration.navigationPreload;
    await Promise.all(ctx.dispatch('install').waitUntilCalls);
    // No throw, no rejection: the manager is simply absent.
    await expect(Promise.all(ctx.dispatch('activate').waitUntilCalls)).resolves.toBeTruthy();
  });
});

describe('service worker offline-serve telemetry (#474)', () => {
  function request(path, mode = 'navigate') {
    return {
      method: 'GET',
      mode,
      url: `https://site.example${path}`,
      headers: { get: () => null },
    };
  }

  function fetchEvent(req) {
    const event = new FakeEvent('fetch');
    event.request = req;
    event.respondWith = (response) => {
      event.response = response;
    };
    return event;
  }

  // Records everything the worker asks for, answers the beacon, and hands every
  // other request to `network`. The beacon is the only thing this suite lets
  // through without a network, which is the point: the count must exist offline.
  function intercept(ctx, network) {
    const calls = [];
    ctx.sandbox.fetch = vi.fn(async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url) === '/api/offline-serve') return new Response('{}', { status: 200 });
      return network(url, init);
    });
    return () => calls.filter((call) => call.url === '/api/offline-serve');
  }

  it('reports a prefix serve as its own door, still with no URL in the payload', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    const cache = await ctx.caches.open(DATA_CACHE);
    await cache.put('https://site.example/community', new Response('community-shell'));
    const beacons = intercept(ctx, () => Promise.reject(new Error('offline')));

    const event = fetchEvent(request('/community/lead'));
    ctx.dispatch('fetch', event);
    expect(await event.response.then((r) => r.text())).toBe('community-shell');

    expect(beacons()).toHaveLength(1);
    expect(beacons()[0].init).toMatchObject({ method: 'POST', credentials: 'omit' });
    expect(JSON.parse(beacons()[0].init.body)).toEqual({
      version: 1,
      door: 'navigation-prefix',
      cache: { hits: 0, misses: 1, failures: 1 },
    });
    // Nothing about the page that missed leaves the device.
    expect(beacons()[0].init.body).not.toContain('/community');
  });

  it('separates the deadline door from the network one', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    // No ancestor shell, so the deadline still reaches `/offline` and its own
    // door rather than a prefix serve (#490).
    await (await ctx.caches.open(DATA_CACHE)).delete('https://site.example/');
    const beacons = intercept(ctx, () => new Promise(() => undefined));

    const event = fetchEvent(request('/rates'));
    ctx.dispatch('fetch', event);
    expect(await event.response.then((r) => r.text())).toBe('ok');

    expect(beacons()).toHaveLength(1);
    expect(JSON.parse(beacons()[0].init.body).door).toBe('navigation-deadline');
  });

  it('labels an online-only route as its own door', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    const beacons = intercept(ctx, () => new Promise(() => undefined));

    const event = fetchEvent(request('/admin'));
    ctx.dispatch('fetch', event);
    expect(await event.response.then((r) => r.text())).toBe('ok');

    expect(beacons()).toHaveLength(1);
    expect(JSON.parse(beacons()[0].init.body).door).toBe('online-only-deadline');
  });

  it('counts nothing when the cached copy answers', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    const cache = await ctx.caches.open(DATA_CACHE);
    await cache.put('https://site.example/rates', new Response('stale-shell'));
    const beacons = intercept(ctx, () => Promise.reject(new Error('offline')));

    const event = fetchEvent(request('/rates'));
    ctx.dispatch('fetch', event);
    expect(await event.response.then((r) => r.text())).toBe('stale-shell');

    expect(beacons()).toHaveLength(0);
  });

  it('answers the offline page without waiting on the beacon', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    let beaconStarted = false;
    ctx.sandbox.fetch = vi.fn(async (url) => {
      if (String(url) === '/api/offline-serve') {
        beaconStarted = true;
        return new Promise(() => undefined);
      }
      throw new Error('offline');
    });

    const event = fetchEvent(request('/community'));
    ctx.dispatch('fetch', event);
    expect(await event.response.then((r) => r.text())).toBe('ok');
    expect(beaconStarted).toBe(true);
  });

  it('reports a deadline-cut navigation once, not again when the cut fetch fails', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    const beacons = intercept(
      ctx,
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('offline')), 60);
        })
    );

    const event = fetchEvent(request('/community/lead'));
    ctx.dispatch('fetch', event);
    expect(await event.response.then((r) => r.text())).toBe('ok');

    // Let the cut revalidation reject and settle its lifetime extension.
    await Promise.all(event.waitUntilCalls);
    await new Promise((resolve) => setTimeout(resolve, 80));

    // The deadline was cut and the homepage shell answered, which is a prefix
    // serve (#490) — but still one report, not one per door.
    expect(beacons()).toHaveLength(1);
    expect(JSON.parse(beacons()[0].init.body).door).toBe('navigation-prefix');
  });

  it('keeps a report the network refused and flushes it on the next request', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20, offlineReportRetryMs: 0 });
    // An empty shell, so this miss keeps its own door rather than a prefix serve
    // (#490); the retry mechanism is what the test is about.
    await (await ctx.caches.open(DATA_CACHE)).delete('https://site.example/');
    ctx.sandbox.fetch = vi.fn(async () => {
      throw new Error('offline');
    });

    const missed = fetchEvent(request('/community/lead'));
    ctx.dispatch('fetch', missed);
    expect(await missed.response.then((r) => r.text())).toBe('ok');
    await new Promise((resolve) => setTimeout(resolve, 20));

    const store = await ctx.caches.open('royaraqamia-offline-report');
    const pending = await (await store.match('/__sw_offline_report__')).json();
    expect(pending).toEqual({
      version: 1,
      doors: { 'navigation-offline': { hits: 0, misses: 1, failures: 1 } },
    });

    // The next request reaches the network: the kept report goes out and the
    // marker is cleared, even though this navigation itself needed no fallback.
    const beacons = [];
    ctx.sandbox.fetch = vi.fn(async (url, init) => {
      if (String(url) === '/api/offline-serve') {
        beacons.push(init);
        return new Response('{}', { status: 200 });
      }
      throw new Error('offline');
    });
    const cache = await ctx.caches.open(DATA_CACHE);
    await cache.put('https://site.example/rates', new Response('stale-shell'));

    const online = fetchEvent(request('/rates'));
    ctx.dispatch('fetch', online);
    expect(await online.response.then((r) => r.text())).toBe('stale-shell');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(beacons).toHaveLength(1);
    expect(JSON.parse(beacons[0].body)).toMatchObject({ door: 'navigation-offline' });
    expect(await store.match('/__sw_offline_report__')).toBeUndefined();
  });

  it('merges reports per door while the radio is off', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20, offlineReportRetryMs: 60_000 });
    ctx.sandbox.fetch = vi.fn(async () => {
      throw new Error('offline');
    });

    for (const path of ['/community/lead', '/admin']) {
      const event = fetchEvent(request(path));
      ctx.dispatch('fetch', event);
      expect(await event.response.then((r) => r.text())).toBe('ok');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));

    const store = await ctx.caches.open('royaraqamia-offline-report');
    const pending = await (await store.match('/__sw_offline_report__')).json();
    // A prefix serve is its own door since #490; `/admin` stays on the
    // online-only one, and both are kept while the radio is off.
    expect(Object.keys(pending.doors).sort()).toEqual(['navigation-prefix', 'online-only-offline']);
  });

  it('keeps the kept report when a new worker activates', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    const store = await ctx.caches.open('royaraqamia-offline-report');
    await store.put(
      '/__sw_offline_report__',
      new Response(
        JSON.stringify({
          version: 1,
          doors: { 'no-fallback': { hits: 0, misses: 0, failures: 1 } },
        })
      )
    );

    await Promise.all(ctx.dispatch('activate').waitUntilCalls);

    expect(await store.match('/__sw_offline_report__')).toBeTruthy();
  });
});

describe('service worker prefix fallback (#490)', () => {
  function request(path, mode = 'navigate') {
    return {
      method: 'GET',
      mode,
      url: `https://site.example${path}`,
      headers: { get: () => null },
    };
  }

  function fetchEvent(req) {
    const event = new FakeEvent('fetch');
    event.request = req;
    event.respondWith = (response) => {
      event.response = response;
    };
    return event;
  }

  /** What the app will read after hydration to draw the offline card. */
  async function markerOf(ctx) {
    const meta = await ctx.caches.open('royaraqamia-cache-meta');
    const entry = await meta.match('/__sw_prefix_serve__');
    return entry ? entry.json() : undefined;
  }

  function noNetwork(ctx) {
    ctx.sandbox.fetch = vi.fn(async () => {
      throw new Error('offline');
    });
  }

  it('answers a never-visited detail route with its parent segment shell', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    const cache = await ctx.caches.open(DATA_CACHE);
    await cache.put('https://site.example/quran', new Response('quran-shell'));
    noNetwork(ctx);

    const event = fetchEvent(request('/quran/7'));
    ctx.dispatch('fetch', event);

    // The URL stays the requested one; the parent's document is what answers.
    expect(await event.response.then((r) => r.text())).toBe('quran-shell');
    expect(await markerOf(ctx)).toEqual({
      version: 1,
      requested: '/quran/7',
      served: '/quran',
    });
  });

  it('walks up to the homepage when the segment has no document of its own', async () => {
    // `/u` is a segment without a page (`app/u/layout.tsx` and a dynamic child),
    // so the homepage — in the fixed shell, and therefore always on a device
    // that installed the worker — is the first ancestor that exists.
    const ctx = await boot({ navigationTimeoutMs: 20 });
    noNetwork(ctx);

    const event = fetchEvent(request('/u/someone'));
    ctx.dispatch('fetch', event);

    expect(await event.response.then((r) => r.text())).toBe('ok');
    expect(await markerOf(ctx)).toEqual({ version: 1, requested: '/u/someone', served: '/' });
  });

  it('keeps /offline for an empty cache and marks nothing', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    const cache = await ctx.caches.open(DATA_CACHE);
    await cache.put('https://site.example/offline', new Response('offline-shell'));
    // The first-install shape: the install precached the shell, but nothing this
    // navigation could borrow — not even the homepage.
    await cache.delete('https://site.example/');
    noNetwork(ctx);

    const event = fetchEvent(request('/community/lead'));
    ctx.dispatch('fetch', event);

    expect(await event.response.then((r) => r.text())).toBe('offline-shell');
    expect(await markerOf(ctx)).toBeUndefined();
  });

  it('keeps /offline for the never-cache admin surface', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    const cache = await ctx.caches.open(DATA_CACHE);
    await cache.put('https://site.example/offline', new Response('offline-shell'));
    // Never-cache paths bypass Cache Storage entirely (ADR-0031); a prefix serve
    // would put a public page where an admin guard is the whole point.
    ctx.sandbox.fetch = vi.fn(() => new Promise(() => undefined));

    const event = fetchEvent(request('/admin/rates'));
    ctx.dispatch('fetch', event);

    expect(await event.response.then((r) => r.text())).toBe('offline-shell');
    expect(await markerOf(ctx)).toBeUndefined();
  });

  it('clears the marker once a later navigation answers its own URL', async () => {
    const ctx = await boot({ navigationTimeoutMs: 20 });
    const cache = await ctx.caches.open(DATA_CACHE);
    await cache.put('https://site.example/quran', new Response('quran-shell'));
    noNetwork(ctx);

    const missed = fetchEvent(request('/quran/7'));
    ctx.dispatch('fetch', missed);
    await missed.response;
    expect(await markerOf(ctx)).toBeTruthy();

    // The same deep link, now cached: the worker answered it itself, so the app
    // must not draw a card for a document that is the real one.
    await cache.put('https://site.example/quran/7', new Response('surah-shell'));
    const exact = fetchEvent(request('/quran/7'));
    ctx.dispatch('fetch', exact);
    expect(await exact.response.then((r) => r.text())).toBe('surah-shell');
    expect(await markerOf(ctx)).toBeUndefined();
  });
});

describe('service worker cache identity (#488)', () => {
  function request(path, mode = 'navigate') {
    return {
      method: 'GET',
      mode,
      url: `https://site.example${path}`,
      headers: { get: () => null },
    };
  }

  function fetchEvent(req) {
    const event = new FakeEvent('fetch');
    event.request = req;
    event.respondWith = (response) => {
      event.response = response;
    };
    return event;
  }

  async function visit(ctx, path) {
    const event = fetchEvent(request(path));
    ctx.dispatch('fetch', event);
    const response = await event.response;
    await Promise.all(event.waitUntilCalls);
    return response;
  }

  it('keeps the offline library across a release', async () => {
    const storage = new Map();
    const first = await boot({ storage, cacheVersion: BUILD_A });
    await visit(first, '/community/lead-1');

    const written = await (
      await first.caches.open(DATA_CACHE)
    ).match('https://site.example/community/lead-1');
    expect(written.headers.get('x-sw-build')).toBe(BUILD_A);

    // The release: a new worker build, same Cache Storage.
    const next = await boot({ storage, cacheVersion: BUILD_B });
    expect(await next.caches.keys()).toContain(DATA_CACHE);

    const kept = await (
      await next.caches.open(DATA_CACHE)
    ).match('https://site.example/community/lead-1');
    expect(kept).toBeTruthy();
    expect(await kept.text()).toBe('ok');
  });

  it('discards it only on a schema bump', async () => {
    const storage = new Map();
    // What a device holds today: build-named caches from the previous scheme,
    // and a previous schema of the content-named ones.
    const superseded = [
      'royaraqamia-v1.131.2-3118eaef',
      'royaraqamia-static-3118eaef',
      'royaraqamia-data-v0',
      'royaraqamia-static-v0',
    ];
    for (const name of superseded) storage.set(name, new Map());

    const ctx = await boot({ storage });
    const keys = await ctx.caches.keys();

    expect(keys).toContain(DATA_CACHE);
    expect(keys).toContain(STATIC_CACHE);
    for (const name of superseded) expect(keys).not.toContain(name);
  });

  it("still finds the previous build's chunk after the next build activates", async () => {
    const storage = new Map();
    const chunk = '/_next/static/chunks/community-abc123.js';
    const first = await boot({
      storage,
      cacheVersion: BUILD_A,
      fetchImpl: async () => new Response('chunk-a', { status: 200 }),
    });
    expect(await (await visit(first, chunk)).text()).toBe('chunk-a');

    const next = await boot({ storage, cacheVersion: BUILD_B });
    next.sandbox.fetch = vi.fn(async () => {
      throw new Error('offline');
    });

    // The document cached at build A is served with its chunk still in place.
    expect(await (await visit(next, chunk)).text()).toBe('chunk-a');
    expect(next.sandbox.fetch).not.toHaveBeenCalled();
  });

  it("serves the previous build's document and refreshes it past the HTTP cache", async () => {
    const storage = new Map();
    const first = await boot({ storage, cacheVersion: BUILD_A });
    await visit(first, '/community/lead-2');

    const next = await boot({ storage, cacheVersion: BUILD_B });
    next.state.fetchCalls.length = 0;

    const event = fetchEvent(request('/community/lead-2'));
    next.dispatch('fetch', event);
    // Stale paint: the previous build's document answers straight away.
    expect(await (await event.response).text()).toBe('ok');

    await Promise.all(event.waitUntilCalls);
    expect(next.state.fetchCalls).toHaveLength(1);
    expect(next.state.fetchCalls[0].init).toMatchObject({ cache: 'no-cache' });

    const refreshed = await (
      await next.caches.open(DATA_CACHE)
    ).match('https://site.example/community/lead-2');
    expect(refreshed.headers.get('x-sw-build')).toBe(BUILD_B);
  });

  it('does not refetch a route shell the same build already holds', async () => {
    const storage = new Map();
    const routes = ['/privacy'];

    const first = await boot({
      storage,
      cacheVersion: BUILD_A,
      precacheRoutes: routes,
      keepFetchCalls: true,
    });
    expect(first.state.fetchCalls.map((call) => call.url)).toContain('/privacy');

    const again = await boot({
      storage,
      cacheVersion: BUILD_A,
      precacheRoutes: routes,
      keepFetchCalls: true,
    });
    expect(again.state.fetchCalls.map((call) => call.url)).not.toContain('/privacy');

    // A new build refreshes the shell once; the entry it replaces is the
    // previous build's, so the check is the stamp and not the route list.
    const release = await boot({
      storage,
      cacheVersion: BUILD_B,
      precacheRoutes: routes,
      keepFetchCalls: true,
    });
    expect(release.state.fetchCalls.map((call) => call.url)).toContain('/privacy');
  });
});

describe('service worker route-shell refresh (#489)', () => {
  function shell() {
    return new Response('shell', {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'content-length': '5',
        'cache-control': 'public, max-age=60',
      },
    });
  }

  it('installs with the fixed shell and no route document', async () => {
    const ctx = installOnly({ precacheRoutes: ['/privacy', '/terms'] });
    await Promise.all(ctx.dispatch('install').waitUntilCalls);

    // The install is bounded by what it must have to boot: the two documents,
    // the manifest and the four icons. Not the build's list, which arrives from
    // `activate`.
    expect(ctx.state.fetchCalls.map((call) => call.url).sort()).toEqual(
      [
        '/',
        '/offline',
        '/manifest.json',
        '/icons/icon-192x192.png',
        '/icons/icon-512x512.png',
        '/icons/notification-icon-192x192.png',
        '/icons/badge-icon-96x96.png',
      ].sort()
    );

    const cache = await ctx.caches.open(DATA_CACHE);
    expect(await cache.match('/privacy')).toBeUndefined();
    expect(await cache.match('/terms')).toBeUndefined();
  });

  it('fetches the list at activation, two routes at a time', async () => {
    const routes = ['/a', '/b', '/c', '/d'];
    let inFlight = 0;
    let peak = 0;

    const ctx = await boot({
      precacheRoutes: routes,
      routeRefreshBatch: 4,
      routeRefreshWindows: 1,
      fetchImpl: async (url) => {
        if (!routes.includes(String(url))) return new Response('ok', { status: 200 });
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return shell();
      },
    });

    expect(peak).toBe(2);
    const cache = await ctx.caches.open(DATA_CACHE);
    for (const route of routes) expect(await cache.match(route)).toBeTruthy();
  });

  it('does not fetch a route until the page is idle', async () => {
    const ctx = installOnly({ precacheRoutes: ['/privacy'] });
    const idle = [];
    ctx.sandbox.requestIdleCallback = (callback) => {
      idle.push(callback);
      return idle.length;
    };

    await Promise.all(ctx.dispatch('install').waitUntilCalls);
    ctx.state.fetchCalls.length = 0;

    const activating = ctx.dispatch('activate');
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Activation is parked on the browser's idle signal, so no route is fetched
    // beside the document that is still hydrating.
    expect(ctx.state.fetchCalls.map((call) => call.url)).not.toContain('/privacy');
    // The fixed shell's chunks are collected first (#490); this fixture's `/`
    // body has no asset references, so the pass moves straight to the routes.
    expect(idle.length).toBeGreaterThanOrEqual(1);

    // Release idle windows until the route is fetched: one for the fixed shell,
    // one for the list.
    while (!ctx.state.fetchCalls.some((call) => call.url === '/privacy') && idle.length > 0) {
      idle.shift()();
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    await Promise.all(activating.waitUntilCalls);
    await settle(ctx);
    expect(ctx.state.fetchCalls.map((call) => call.url)).toContain('/privacy');
  });

  it('resumes a stopped pass instead of starting over', async () => {
    const storage = new Map();
    const routes = ['/a', '/b', '/c', '/d'];
    const options = {
      storage,
      precacheRoutes: routes,
      routeRefreshBatch: 2,
      routeRefreshWindows: 1,
      fetchImpl: async () => shell(),
    };

    const first = await boot(options);
    const firstCache = await first.caches.open(DATA_CACHE);
    expect(await firstCache.match('/a')).toBeTruthy();
    expect(await firstCache.match('/b')).toBeTruthy();
    expect(await firstCache.match('/c')).toBeUndefined();

    // The browser terminated that worker mid-list. The next one re-reads what
    // the device holds, so its first window is the rest of the list.
    const next = await boot(options);

    const fetched = next.state.fetchCalls.map((call) => call.url);
    expect(fetched).not.toContain('/a');
    expect(fetched).not.toContain('/b');
    const cache = await next.caches.open(DATA_CACHE);
    expect(await cache.match('/c')).toBeTruthy();
    expect(await cache.match('/d')).toBeTruthy();
  });

  it('continues a stopped pass on the next request, without waiting for the interval', async () => {
    const storage = new Map();
    const routes = ['/a', '/b'];
    const options = {
      storage,
      precacheRoutes: routes,
      routeRefreshBatch: 1,
      routeRefreshWindows: 1,
      routeRefreshIntervalMs: 60_000,
      fetchImpl: async () => shell(),
    };

    const first = await boot(options);
    const cache = await first.caches.open(DATA_CACHE);
    expect(await cache.match('/a')).toBeTruthy();
    expect(await cache.match('/b')).toBeUndefined();

    // The pass stopped with `b` still pending, so the next request continues
    // even though a completed pass would be held off for a minute.
    await runRouteRefresh(first);
    expect(await cache.match('/b')).toBeTruthy();
  });

  it('does not walk the list again on every request once a pass completes', async () => {
    const ctx = await boot({
      precacheRoutes: ['/a'],
      routeRefreshIntervalMs: 60_000,
      fetchImpl: async () => shell(),
    });
    ctx.state.fetchCalls.length = 0;

    await runRouteRefresh(ctx);

    expect(ctx.state.fetchCalls.map((call) => call.url)).not.toContain('/a');
  });

  it('keeps what it fetched when the radio goes off mid-list', async () => {
    const storage = new Map();
    const routes = ['/a', '/b', '/c'];

    const first = await boot({
      storage,
      precacheRoutes: routes,
      routeRefreshBatch: 1,
      routeRefreshWindows: 1,
      fetchImpl: async () => shell(),
    });
    const firstCache = await first.caches.open(DATA_CACHE);
    expect(await firstCache.match('/a')).toBeTruthy();

    // Offline for the next pass: nothing new lands, and nothing it already has
    // is lost.
    const offline = await boot({
      storage,
      precacheRoutes: routes,
      routeRefreshBatch: 1,
      routeRefreshWindows: 2,
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    const keptCache = await offline.caches.open(DATA_CACHE);
    expect(await keptCache.match('/a')).toBeTruthy();
    expect(await keptCache.match('/b')).toBeUndefined();

    // Back online: the next window continues from where the device stopped.
    const online = await boot({
      storage,
      precacheRoutes: routes,
      routeRefreshBatch: 1,
      routeRefreshWindows: 2,
      fetchImpl: async () => shell(),
    });
    const cache = await online.caches.open(DATA_CACHE);
    expect(await cache.match('/a')).toBeTruthy();
    expect(await cache.match('/b')).toBeTruthy();
    expect(await cache.match('/c')).toBeTruthy();
  });
});

describe('service worker route assets (#490)', () => {
  /** A shell document that names the chunks it needs to hydrate. */
  function document(assets) {
    return new Response(
      `<html><head><link rel="stylesheet" href="/_next/static/chunks/app.css"></head><body>${assets
        .map((asset) => `<script src="${asset}"></script>`)
        .join('')}</body></html>`,
      { status: 200, headers: { 'content-type': 'text/html' } }
    );
  }

  function chunk() {
    return new Response('chunk', {
      status: 200,
      headers: { 'content-length': '5', 'cache-control': 'public, max-age=31536000' },
    });
  }

  function assetFetches(ctx) {
    return ctx.state.fetchCalls
      .map((call) => call.url)
      .filter((url) => url.startsWith('/_next/static/'));
  }

  it('caches the chunks a route document names, once across the whole list', async () => {
    const routes = ['/a', '/b'];
    const ctx = await boot({
      precacheRoutes: routes,
      routeRefreshBatch: 2,
      routeRefreshWindows: 1,
      keepFetchCalls: true,
      fetchImpl: async (url) => {
        const path = String(url);
        if (path === '/a') {
          return document(['/_next/static/chunks/shared.js', '/_next/static/chunks/a.js']);
        }
        if (path === '/b') {
          return document(['/_next/static/chunks/shared.js', '/_next/static/chunks/b.js']);
        }
        if (path.startsWith('/_next/static/')) return chunk();
        return new Response('ok', { status: 200 });
      },
    });

    const staticCache = await ctx.caches.open(STATIC_CACHE);
    for (const asset of ['app.css', 'shared.js', 'a.js', 'b.js']) {
      expect(
        await staticCache.match(`https://site.example/_next/static/chunks/${asset}`)
      ).toBeTruthy();
    }
    // Two documents name the shared chunk; the pass fetches it once.
    expect(assetFetches(ctx).filter((url) => url.endsWith('shared.js'))).toHaveLength(1);
  });

  it('does not refetch a chunk the device already holds', async () => {
    const storage = new Map();
    const options = {
      storage,
      precacheRoutes: ['/a'],
      routeRefreshWindows: 1,
      fetchImpl: async (url) => {
        const path = String(url);
        if (path === '/a') return document(['/_next/static/chunks/a.js']);
        if (path.startsWith('/_next/static/')) return chunk();
        return new Response('ok', { status: 200 });
      },
    };
    await boot(options);

    // A second worker over the same Cache Storage: the shell needs a refresh
    // (a new build), the chunks it names do not.
    const next = await boot({ ...options, cacheVersion: BUILD_B });
    expect(assetFetches(next)).toHaveLength(0);
    const staticCache = await next.caches.open(STATIC_CACHE);
    expect(await staticCache.match('https://site.example/_next/static/chunks/a.js')).toBeTruthy();
  });

  it('keeps the document when a chunk cannot be fetched', async () => {
    const ctx = await boot({
      precacheRoutes: ['/a'],
      routeRefreshWindows: 1,
      fetchImpl: async (url) => {
        const path = String(url);
        if (path === '/a') return document(['/_next/static/chunks/a.js']);
        if (path.startsWith('/_next/static/')) throw new Error('offline');
        return new Response('ok', { status: 200 });
      },
    });

    const cache = await ctx.caches.open(DATA_CACHE);
    expect(await cache.match('/a')).toBeTruthy();
    const staticCache = await ctx.caches.open(STATIC_CACHE);
    expect(
      await staticCache.match('https://site.example/_next/static/chunks/a.js')
    ).toBeUndefined();
  });

  it("collects the fixed shell's chunks, since install fetches that document alone", async () => {
    // `/` is the last prefix a deep link falls back to (#490), and it is fetched
    // by `install` rather than by the generated route list.
    const ctx = await boot({
      fetchImpl: async (url) => {
        if (String(url) === '/') return document(['/_next/static/chunks/home.js']);
        if (String(url).startsWith('/_next/static/')) return chunk();
        return new Response('ok', { status: 200 });
      },
    });

    const staticCache = await ctx.caches.open(STATIC_CACHE);
    expect(
      await staticCache.match('https://site.example/_next/static/chunks/home.js')
    ).toBeTruthy();
  });

  it('takes a bounded handful per window and resumes from the queue', async () => {
    const storage = new Map();
    const chunks = Array.from({ length: 10 }, (_, index) => `/_next/static/chunks/a${index}.js`);
    const options = {
      storage,
      precacheRoutes: ['/a'],
      routeRefreshWindows: 1,
      routeRefreshAssetBatch: 4,
      keepFetchCalls: true,
      fetchImpl: async (url) => {
        const path = String(url);
        if (path === '/a') return document(chunks);
        if (path.startsWith('/_next/static/')) return chunk();
        return new Response('ok', { status: 200 });
      },
    };

    const first = await boot(options);
    // The document names 11 files (ten chunks plus the stylesheet); one window
    // takes four of them and leaves the rest alone.
    expect(assetFetches(first)).toHaveLength(4);

    // The queue is the record, so a worker the browser stops loses nothing: the
    // next pass continues from the files this one did not reach.
    const meta = await first.caches.open('royaraqamia-cache-meta');
    expect((await (await meta.match('/__sw_asset_queue__')).json()).urls).toHaveLength(7);

    const second = await boot(options);
    expect(assetFetches(second)).toHaveLength(4);

    const third = await boot(options);
    expect(assetFetches(third)).toHaveLength(3);

    const staticCache = await third.caches.open(STATIC_CACHE);
    for (const chunkUrl of [...chunks, '/_next/static/chunks/app.css']) {
      expect(await staticCache.match(`https://site.example${chunkUrl}`)).toBeTruthy();
    }
    // Coverage complete: the queue entry is gone rather than a page-long list
    // re-read on every pass.
    expect(await meta.match('/__sw_asset_queue__')).toBeUndefined();
  });
});
