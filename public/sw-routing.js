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

  // The ancestors a navigation falls back through when nothing exact is cached
  // (#490), longest first: `/community/foo/bar` -> [`/community/foo`,
  // `/community`, `/`]. The requested path is deliberately not a candidate — an
  // exact entry is a cache hit, not a prefix serve — and `/` is last because the
  // homepage is in the fixed shell, so it is the ancestor most likely to be on
  // the device. A dynamic detail route has no shell of its own (ADR-0071), but
  // the document of its parent segment usually does.
  function shellPrefixCandidates(pathname) {
    if (typeof pathname !== 'string' || !pathname.startsWith('/')) return [];
    const segments = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    const candidates = [];
    for (let end = segments.length - 1; end >= 0; end -= 1) {
      candidates.push(`/${segments.slice(0, end).join('/')}`);
    }
    return candidates;
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
  // Document shells that ride the SWR cache instead share one principle: the
  // shell is a static client page with nothing account-bearing rendered into
  // it, and every read under it that *is* account-bearing keeps its own
  // never-cache prefix here.
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
  // - The product dashboard roots since #449 (ADR-0073): their documents are
  //   static shells painted from the Local Store, and every account-bearing
  //   read under them is on an `/api` prefix below. Two subroutes still render
  //   server-side data and keep their own entries: the SpendTrack categories
  //   page and the BlogPress editor.
  // - The `/mcp` root since #450 is an exact entry rather than a prefix: the
  //   protocol endpoint itself must never be read from a cache, while
  //   `/mcp/guide` is static instructions with nothing to lose and now rides the
  //   SWR cache. The consent document and the OAuth handlers keep their own
  //   prefixes.
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
    '/mcp/authorize',
    // The consent document is data-bearing by construction: it renders the
    // client asking for the grant, and the POST that decides is a server action.
    // Its URL carries the OAuth parameters, which a precached bare path cannot
    // answer anyway (#450).
    '/mcp/connect',
    '/mcp/register',
    '/mcp/revoke',
    '/mcp/token',
    '/api/training',
    '/api/project-requests',
    '/api/retainers',
    '/api/consultation',
    '/habitflow/api',
    '/spendtrack/api',
    '/linksnap/api',
    '/spendtrack/categories',
    '/blogpress/editor',
  ];

  // Paths that are exactly a never-cache surface: a prefix would also swallow
  // their neighbours (`/mcp` is the protocol endpoint; `/mcp/guide` is a page).
  const NEVER_CACHE_EXACT = ['/mcp'];

  function isNeverCache(url) {
    if (NEVER_CACHE_EXACT.includes(url.pathname)) return true;
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
    shellPrefixCandidates,
    isCacheable,
    isPubliclyCacheable,
    isNeverCache,
    NEVER_CACHE_PREFIXES,
    NEVER_CACHE_EXACT,
  };
})();
