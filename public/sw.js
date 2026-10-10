try { importScripts('/sw-version.js'); } catch { self.CACHE_VERSION = 'royaraqamia-dev'; }
try { importScripts('/sw-push-config.js'); } catch { self.PUSH_CONFIG = null; }
try { importScripts('/sw-routing.js'); } catch { self.SWRouting = self.SWRouting || null; }
const CACHE = self.CACHE_VERSION;
const STATIC_CACHE = 'royaraqamia-static-' + (self.CACHE_VERSION ? self.CACHE_VERSION.split('-').pop() : 'v1');
const FALLBACK_URL = '/offline';

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

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE_URLS);
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
          if (key !== CACHE && key !== STATIC_CACHE && key !== PUSH_PREF_CACHE) {
            return caches.delete(key);
          }
        })
      );
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
  isNeverCache,
} = self.SWRouting;

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(request);
  }
}

async function networkFirst(request, timeoutMs = 3000, options = {}) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), timeoutMs)
  );
  try {
    const response = await Promise.race([fetch(request), timeout]);
    if (response.ok && (!options.respectNoStore || isCacheable(response))) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (isNavigationRequest(request)) {
      return caches.match(FALLBACK_URL);
    }
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok && isCacheable(response)) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(async () => {
      if (cached) return cached;
      if (isNavigationRequest(request)) {
        const fallback = await caches.match(FALLBACK_URL);
        if (fallback) return fallback;
      }
      return new Response('Offline', { status: 503 });
    });
  return cached || fetchPromise;
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
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (isApiCall(url)) {
    event.respondWith(networkFirst(request, 5000, { respectNoStore: true }));
    return;
  }

  // Public navigations and RSC payloads paint from cache instantly, then
  // refresh in the background (stale-while-revalidate). Offline-first reads.
  if (isNavigationRequest(request) || isRSCPayload(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
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
      await cache.addAll(urls);
    }
  })());
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
