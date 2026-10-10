// Pure request-classification helpers for the service worker.
//
// Loaded by `sw.js` via importScripts and unit-tested directly in
// `scripts/__tests__/sw-routing.test.mjs` (outside the worker realm). Keep this
// file free of worker-only globals so it can be evaluated in a bare sandbox.
(function () {
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
    return (
      url.pathname.startsWith('/fonts/') ||
      url.pathname.endsWith('.woff2') ||
      url.pathname.endsWith('.woff') ||
      url.pathname.endsWith('.ttf')
    );
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

  // A response the server marked non-storable must never be persisted: serving
  // it later would fall back to stale authenticated/private data offline.
  function isCacheable(response) {
    const cacheControl = response.headers.get('cache-control') || '';
    return !/no-store|no-cache|private/i.test(cacheControl);
  }

  // Routes that must never be read from or written to Cache Storage. These are
  // the online-only surfaces (ADR-0031): authentication, admin, per-user reads
  // and the account-tool shells. Caching them risks leaking one session's data
  // to the next on a shared device, so they bypass the cache entirely.
  const NEVER_CACHE_PREFIXES = [
    '/api/auth',
    '/api/admin',
    '/api/push',
    '/api/me',
    '/api/notifications',
    '/api/blogpress',
    '/api/downloader',
    '/auth',
    '/admin',
    '/account',
    '/mcp',
    '/habitflow/app',
    '/spendtrack/app',
    '/linksnap/app',
    '/blogpress/app',
  ];

  function isNeverCache(url) {
    return NEVER_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  }

  self.SWRouting = {
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
    NEVER_CACHE_PREFIXES,
  };
})();
