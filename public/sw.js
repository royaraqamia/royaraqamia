try { importScripts('/sw-version.js'); } catch { self.CACHE_VERSION = 'royaraqamia-dev'; }
try { importScripts('/sw-push-config.js'); } catch { self.PUSH_CONFIG = null; }
const CACHE = self.CACHE_VERSION;
const STATIC_CACHE = 'royaraqamia-static-' + (self.CACHE_VERSION ? self.CACHE_VERSION.split('-').pop() : 'v1');
const FALLBACK_URL = '/offline';

const PRECACHE_URLS = [
  '/',
  FALLBACK_URL,
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/notification-icon-192x192.png',
  '/icons/badge-icon-96x96.png',
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

function isNavigationRequest(request) {
  return (
    request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))
  );
}

function isNextStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/');
}

function isRSCPayload(url) {
  return url.pathname.startsWith('/_next/data/') || url.searchParams.has('__rsc');
}

function isFont(url) {
  return url.pathname.startsWith('/fonts/') || url.pathname.endsWith('.woff2') || url.pathname.endsWith('.woff') || url.pathname.endsWith('.ttf');
}

function isIcon(url) {
  return url.pathname.startsWith('/icons/');
}

function isImage(url) {
  return /\.(png|webp|jpg|jpeg|gif|svg|ico)$/i.test(url.pathname);
}

function isNextImage(url) {
  return url.pathname.startsWith('/_next/image');
}

function isApiCall(url) {
  return url.pathname.startsWith('/api/');
}

// Server explicitly opted out of storage (e.g. /api/version is no-store).
// Serving such a response from cache after a network timeout would silently
// show stale data, so API responses honoring these directives are never put.
function isCacheable(response) {
  const cacheControl = response.headers.get('cache-control') || '';
  return !/no-store|no-cache|private/i.test(cacheControl);
}

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
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.method !== 'GET') return;

  if (isNextStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isFont(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isIcon(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (isImage(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (isNextImage(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (isApiCall(url)) {
    event.respondWith(networkFirst(request, 5000, { respectNoStore: true }));
    return;
  }

  if (isNavigationRequest(request) || isRSCPayload(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
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

  const title = typeof payload.title === 'string' ? payload.title : 'رؤية رقمية';
  const notificationId = typeof payload.notificationId === 'string' ? payload.notificationId : undefined;

  const options = {
    body: typeof payload.body === 'string' && payload.body.length > 0 ? payload.body : undefined,
    icon: '/icons/notification-icon-192x192.png',
    badge: '/icons/badge-icon-96x96.png',
    data: {
      url: typeof payload.url === 'string' ? payload.url : '/',
      type: typeof payload.type === 'string' ? payload.type : undefined,
      notificationId,
    },
  };
  if (notificationId) options.tag = notificationId;

  event.waitUntil(self.registration.showNotification(title, options));
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
