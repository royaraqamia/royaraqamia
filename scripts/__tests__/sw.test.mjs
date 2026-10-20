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
const VERSION_SCRIPT = `self.CACHE_VERSION = 'royaraqamia-test-v1';\n`;

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

function createSandbox({ withPushConfig = true, fetchImpl, budgetBytes } = {}) {
  const listeners = new Map();
  const cacheStores = new Map();
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
        return Function('self', VERSION_SCRIPT)(sandbox);
      }
      if (name === 'sw-routing.js') {
        return Function('self', 'URL', ROUTING_SOURCE)(sandbox, URL);
      }
      throw new Error(`not found: ${name}`);
    },
  };
  sandbox.self = sandbox;
  if (budgetBytes !== undefined) sandbox.CACHE_BUDGET_BYTES = budgetBytes;
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

async function boot(options = {}) {
  const ctx = createSandbox(options);
  vm.runInNewContext(SW_SOURCE, ctx.sandbox, { filename: 'sw.js' });
  await Promise.all(ctx.dispatch('install').waitUntilCalls);
  await Promise.all(ctx.dispatch('activate').waitUntilCalls);
  // Install precaches through `fetch`; those calls are not what the tests below
  // are counting.
  ctx.state.fetchCalls.length = 0;
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
    const cache = await caches.open('royaraqamia-test-v1');
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

    const cache = await caches.open('royaraqamia-test-v1');
    expect(await cache.match('/')).toBeTruthy();
    expect(await cache.match('/offline')).toBeTruthy();
    expect(await cache.match(failedUrl)).toBeUndefined();
    expect(log.mock.calls.flat().join(' ')).toContain(failedUrl);

    log.mockRestore();
  });

  it('serves the last good cached API read when the network answers 5xx', async () => {
    const { caches, dispatch, sandbox } = await boot();
    const cache = await caches.open('royaraqamia-test-v1');
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
  const RUNTIME_CACHE = 'royaraqamia-test-v1';

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
    const staticEntries = await runtimeEntries(ctx, 'royaraqamia-static-v1');
    expect(staticEntries['/_next/static/chunks/app.js']).toBe(300);
    expect(entries).toHaveProperty('/offline');
    expect(entries['/a']).toBeUndefined();
    expect(entries['/b']).toBe(300);
    expect(entries['/c']).toBe(300);
  });

  it('purges account-bearing entries on sign-out and keeps the offline shell', async () => {
    const ctx = await boot({ budgetBytes: 10_000 });

    await visit(ctx, '/community', 100);
    // The device's data-free shell must survive sign-out: removing the copy that
    // sign-out deliberately keeps is exactly what it is for (ADR-0070).
    await visit(ctx, '/device', 100);
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
    // The offline shell, the device shell, the build's static assets and the
    // device preference do.
    expect(await ctx.caches.match('/offline')).toBeTruthy();
    expect(await ctx.caches.match('/device')).toBeTruthy();
    expect(await ctx.caches.match('/_next/static/chunks/app.js')).toBeTruthy();
    expect(await ctx.caches.match('/__push_disabled__')).toBeTruthy();
    expect(event.ports[0].postMessage).toHaveBeenCalledWith({ type: 'ACCOUNT_CACHES_PURGED' });
    // Local Store and Outbox were never opened.
    expect(ctx.sandbox.indexedDB.open).not.toHaveBeenCalled();
    expect(ctx.sandbox.indexedDB.databases).not.toHaveBeenCalled();
  });
});
