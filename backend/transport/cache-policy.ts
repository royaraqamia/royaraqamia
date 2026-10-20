/**
 * The two cache postures a route response can carry (#392).
 *
 * The service worker only stores an API response that opts in with `public`
 * (`public/sw-routing.js`), and its never-cache list names the online-only
 * paths. An authenticated response is `no-store` by construction at the
 * authenticated seam (`authenticated-handler.ts`), so an account-scoped read
 * cannot be persisted just because its route forgot a header.
 */

/** Account-scoped, private or online-only: never write to Cache Storage. */
export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * A public read that may work offline. The `public` token is the worker's
 * opt-in; `max-age=0` keeps the browser's HTTP cache from answering with an
 * older copy than the worker's network-first read just fetched.
 */
export const PUBLIC_CACHEABLE = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
} as const;
