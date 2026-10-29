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

  // The App Router varies an RSC request's URL by `_rsc`, a hash of the request's
  // own headers (Next's CDN guide). Two navigations to the same route from
  // different router states are therefore different URLs for one page, so a worker
  // keyed by the full URL writes both entries and misses on each (#492). The hash
  // is a variant marker, not part of what the caller asked for: the path and the
  // caller's own query are.
  //
  // The normalised key keeps a constant `_rsc` marker instead of dropping the
  // parameter. A flight payload and the document of the same path are different
  // bodies, and a navigation handed a flight payload as HTML paints nothing.
  //
  // A *prefetch* is deliberately not normalised. Its body is a different thing —
  // partial by design, built from the prefetching router's state tree — and Next
  // refuses it as the answer to a navigation: handed a prefetched body, the
  // router falls back to a full document load, which is exactly the round trip
  // this change exists to remove. Only a *live* payload (the answer a navigation
  // asks for) is shared, and only ever with another live one.
  const RSC_KEY_PARAM = '_rsc';
  const RSC_KEY_TOKEN = '1';
  // Both mark a speculative request: `next-router-prefetch` a whole-route
  // prefetch, `next-router-segment-prefetch` one segment of it.
  const RSC_PREFETCH_HEADERS = ['next-router-prefetch', 'next-router-segment-prefetch'];

  function headerOf(request, name) {
    const headers = request && request.headers;
    return headers && typeof headers.get === 'function' ? headers.get(name) : null;
  }

  /**
   * The Cache Storage key a request is stored and served under (#492).
   *
   * A document, and every non-RSC GET, keeps its URL untouched. A live RSC payload
   * is keyed by its path plus the query the caller meant, with `_rsc` folded to
   * one constant, so a navigation from one router state answers the next one.
   *
   * `next-url` is folded away with the hash: it names the page the navigation came
   * from, and the router sends it on every navigation, so keeping it would make
   * every referrer a separate entry. It only changes the payload for an
   * *interception* route (`app/(.)`, `app/(..)`), where the tree rendered depends
   * on where the user came from. This app has none; an app that adds one must stop
   * normalising here, or a modal interception could be answered with the plain
   * page.
   *
   * This never rewrites the *request*: the worker still fetches the URL the
   * browser asked for, with Next's own hash, because the server answers a missing
   * or stale `_rsc` with a redirect to the correct one.
   */
  function cacheKeyFor(request) {
    const url = new URL(request.url);
    if (!isRSCPayload(url)) return url.href;
    if (RSC_PREFETCH_HEADERS.some((name) => headerOf(request, name))) return url.href;
    const key = new URL(url.href);
    key.searchParams.delete(RSC_KEY_PARAM);
    key.searchParams.set(RSC_KEY_PARAM, RSC_KEY_TOKEN);
    return key.href;
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
    '/notes/api',
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
    NEVER_CACHE_PREFIXES,
    NEVER_CACHE_EXACT,
  };
})();
