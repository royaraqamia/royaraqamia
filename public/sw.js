try { importScripts('/sw-version.js'); } catch { self.CACHE_VERSION = 'royaraqamia-dev'; }
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

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE && key !== STATIC_CACHE) {
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

function isApiCall(url) {
  return url.pathname.startsWith('/api/');
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

async function networkFirst(request, timeoutMs = 3000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), timeoutMs)
  );
  try {
    const response = await Promise.race([fetch(request), timeout]);
    if (response.ok) {
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

  if (isApiCall(url)) {
    event.respondWith(networkFirst(request, 5000));
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
