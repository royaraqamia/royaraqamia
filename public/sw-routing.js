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
    // The App Router marks its flight requests with `_rsc` (one underscore).
    return url.pathname.startsWith('/_next/data/') || url.searchParams.has('_rsc');
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
    // A 206 carries only the requested slice of the body. Storing it under the
    // whole-resource key would serve a truncated payload to every later read.
    if (response.status === 206) return false;
    if (response.headers.get('content-range')) return false;
    const cacheControl = response.headers.get('cache-control') || '';
    return !/no-store|no-cache|private/i.test(cacheControl);
  }

  // API reads are cached only when the server says `public` explicitly. An
  // absent header is not permission: that assumption is what let account-scoped
  // reads (the Quran sync snapshot) land in Cache Storage (#392).
  function isPubliclyCacheable(response) {
    const cacheControl = response.headers.get('cache-control') || '';
    return /\bpublic\b/i.test(cacheControl) && isCacheable(response);
  }

  // Routes that must never be read from or written to Cache Storage. These are
  // the online-only surfaces (ADR-0031): authentication *APIs*, admin, per-user
  // reads and the account-tool shells. Caching them risks leaking one session's
  // data to the next on a shared device, so they bypass the cache entirely.
  //
  // Two document-shell exceptions ride the SWR cache instead, on the same
  // principle in both: the shell is a static client page with nothing
  // account-bearing rendered into it, and every read under it that *is*
  // account-bearing keeps its own never-cache prefix here.
  //
  // - The auth document shells since #447: submitting still needs the server —
  //   Turnstile and Supabase cannot run offline — and every auth form answers
  //   that with its own inline needs-connection state (ADR-0031). The auth
  //   route handlers keep `/auth/api` and `/auth/callback`.
  // - The `/account` shells since #448: the subtree's guard moved client-side
  //   (the session provider treats network failure as "never a logout"), pages
  //   that show server-owned data fetch it through this list's `/api` prefixes
  //   and degrade to inline needs-connection banners, so a cached account
  //   document or RSC payload carries no fragment one user could leave for the
  //   next on the same browser.
  const NEVER_CACHE_PREFIXES = [
    '/api/auth',
    '/api/admin',
    '/api/certificates',
    '/api/push',
    '/api/me',
    '/api/notifications',
    '/quran/api',
    '/api/blogpress',
    '/api/downloader',
    '/auth/api',
    // The OAuth callback is the code exchange itself — a one-time redirect
    // that must never be replayed from a cache, not a shell.
    '/auth/callback',
    '/admin',
    '/mcp',
    '/api/training',
    '/api/project-requests',
    '/api/retainers',
    '/api/consultation',
    '/habitflow/api',
    '/spendtrack/api',
    '/linksnap/api',
    '/habitflow',
    '/spendtrack',
    '/linksnap',
    '/blogpress',
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
    isPubliclyCacheable,
    isNeverCache,
    NEVER_CACHE_PREFIXES,
  };
})();
