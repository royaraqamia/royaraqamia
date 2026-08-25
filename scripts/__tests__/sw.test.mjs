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

function createSandbox({ withPushConfig = true } = {}) {
  const listeners = new Map();
  const cacheStores = new Map();
  const state = { fetchCalls: [], subscribeCalls: [], showNotificationCalls: [] };

  function openStore(name) {
    let store = cacheStores.get(name);
    if (!store) {
      store = new Map();
      cacheStores.set(name, store);
    }
    return {
      put: async (url, response) => void store.set(String(url), response),
      match: async (url) => store.get(String(url)),
      delete: async (url) => store.delete(String(url)),
      addAll: async () => undefined,
    };
  }

  const caches = {
    open: async (name) => openStore(name),
    keys: async () => [...cacheStores.keys()],
    match: async (url) => {
      for (const store of cacheStores.values()) {
        const hit = store.get(String(url));
        if (hit) return hit;
      }
      return undefined;
    },
    delete: async (name) => cacheStores.delete(name),
  };

  const sandbox = {
    console,
    URL,
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
    },
    fetch: vi.fn(async (url, init) => {
      state.fetchCalls.push({ url: String(url), init });
      return { ok: true, status: 200 };
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
      throw new Error(`not found: ${name}`);
    },
  };
  sandbox.self = sandbox;

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

  return { sandbox, state, caches, dispatch, listeners };
}

async function boot(options = {}) {
  const ctx = createSandbox(options);
  vm.runInNewContext(SW_SOURCE, ctx.sandbox, { filename: 'sw.js' });
  await Promise.all(ctx.dispatch('install').waitUntilCalls);
  await Promise.all(ctx.dispatch('activate').waitUntilCalls);
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
