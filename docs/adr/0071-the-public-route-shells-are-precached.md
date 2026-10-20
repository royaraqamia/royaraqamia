# The build's public route shells are precached at install

A public route was offline only after the device had opened it. The worker
caches a navigation on first use, so a deep link to `/privacy`, `/terms` or the
Quran index bounced to `/offline` on a device that had installed the app but
never visited that page. The spec's public-cache promise is about public
surfaces, not about the user's browsing history (#395).

## What is precached

The install event fetches the HTML document for every **public static route** in
the current build. Nothing else: no RSC navigation payload, no dynamic detail
route, no online-only surface. An RSC payload depends on the navigation state
that produced it, so precaching "the" payload for a route multiplies the cache
with variants that still miss; the document is what a hard navigation and a deep
link ask for.

The list is generated after `next build` by `scripts/generate-sw-precache.mjs`
and written to the git-ignored `public/sw-precache.js`:

- `app-path-routes-manifest.json` supplies the page route patterns, so a
  dynamic detail (`/quran/[surah]`) is excluded as a pattern rather than by
  guessing from a concrete prerendered URL.
- `prerender-manifest.json` supplies what the build actually rendered ahead of
  time. A `force-dynamic` page is absent, which is the build's own statement
  that it has no shell to precache.
- `public/sw-routing.js` supplies the never-cache prefixes (ADR-0031), so the
  generator and the worker cannot disagree about auth, admin, account or the
  account tools.
- `/` and `/offline` stay in the worker's fixed list; internal routes, route
  handlers and metadata files (`/robots.txt`) are not pages.

The result is capped at 24 routes. On the build this landed against it is nine:
`/app-info`, `/community`, `/privacy`, `/quran`, `/rates`, `/scan`, `/security`,
`/terms` and `/verify`, plus the homepage already in the fixed shell. `/device`
is cacheable and data-free but is a device tool warmed from `/account`
(ADR-0070), not public content, so it stays out of the list.

## Budget

Two ceilings bound the install:

- **Install-time ceiling: 6 MB.** On the build this landed against the nine
  shells total about 0.9 MB. The worker fetches sequentially and stops before
  writing an entry that would cross the ceiling, so a future list that grows
  past it loses the tail rather than the budget.
- **The public cache budget wins (ADR-0069: 150 MB).** The route budget is the
  smaller of 6 MB and what remains of the cache budget. A shell is pinned from
  eviction like the fixed shell, so spending bytes the cache does not have would
  push pinned entries over the budget; the worker skips the routes instead.

Every URL is fetched on its own. A 404, a non-cacheable response or a network
error is logged and the loop continues; a rejected install would leave the
previous worker in place and throw away every route it did fetch. The cache
index is written per entry, so `activate` can account for a shell whose
bookkeeping pass was interrupted.

## Sign-out and privacy

The shells are prerendered without a session, exactly like `/device`
(ADR-0070), so sign-out keeps them while it purges account-bearing pages, RSC
payloads and API reads. A signed-out borrowed device still needs a public page
to land on with the radio off.

## Limits

- **The first online install is still required.** A worker installs on the first
  online visit; until then no shell exists, as for any offline capability.
- **Only documents, not their route-specific chunks.** The shared layout chunks
  come from that first visit, and a missing route chunk can cost the client
  hydration on a never-visited page; the server-rendered shell still paints. The
  e2e asserts the document, which is what the issue promises.
- **A stale shell is a shell.** ISR routes (`/rates`, `/community`) are fetched
  at install and refresh on the next online visit through
  stale-while-revalidate, like any other cached navigation.

## Consequences

`scripts/__tests__/generate-sw-precache.test.mjs` pins the derivation rules
against fixtures (dynamic patterns, never-cache prefixes, internal routes, the
cap, deterministic order). `scripts/__tests__/sw.test.mjs` proves install
continues past a failed route, stops at the install ceiling, refuses to spend
cache budget it does not have, and keeps a public shell across sign-out.
`e2e/public-offline.spec.ts` installs the worker on one route, goes offline and
hard-navigates to a route it never visited, asserting that route's own heading
rather than `/offline`.
