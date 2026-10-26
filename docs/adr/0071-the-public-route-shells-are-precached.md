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

## Amendment: the cap follows the shells, not the public pages (#449)

The four product dashboard roots and `/blogpress/calendar` are data-free shells
since ADR-0073, and the auth and account shells entered the list in #447 and
#448. On the #449 build the candidate set is 26 routes — the public pages, the
auth shells, the account subtree, `/app-info` and the five product documents —
totalling about 1.6 MB. The 24-route cap no longer fit that set, and because the
selection is sorted, it silently dropped the tail rather than the newest entries:
`/terms` and `/verify` were the ones lost. The cap is raised to 32: still a guard
against a routing mistake multiplying the install, no longer smaller than the
set it is supposed to bound. The 6 MB ceiling and ADR-0069's cache budget are
unchanged, and neither is close.

## Amendment: the measured install budget (#450)

The list is re-measured on the #450 build instead of being carried forward. The build prerendered 29
route documents totalling **1,705,315 bytes (1.63 MB)** of HTML — measured from the files the build
wrote, and the same 29 routes the generated `public/sw-precache.js` lists. Three documents joined the
set (`/downloader`, `/consultation/book`, `/mcp/guide`); the largest entries are still the content
pages (`/quran` 234,859 bytes, `/community` 216,007), not the shells.

Both ceilings hold with room to spare: 29 routes against the 32-route cap, and 1.63 MB against the
6 MB install ceiling — 28% of it. The cap stays at 32 because it is a guard against a routing
mistake multiplying the install, not a target to fill: three more shells would fit, and a build that
crosses it drops the sorted tail, which is why the cap and the list are re-checked together.
ADR-0069's 150 MB cache budget is untouched by the install, and the worker still spends the smaller
of the two.

## Amendment: dynamic detail patterns stay out, and the spec says so (#473)

The precache selects static routes only, so a **never-visited dynamic detail route** — `/u/[username]`,
`/community/[slug]`, `/quran/[surah]`, `/verify/[code]` — has no document to answer a first offline deep
link, the navigation deadline expires and `/offline` answers. The spec said the opposite twice
("precaching every route's shell"; "`/offline` answers exactly two situations"), so this amendment
records the decision the spec now states, and why the alternatives lost.

1. **Accept the limit and correct the spec. Chosen.**
2. **Precache the concretely prerendered documents under a dynamic segment.** The build does render
   some: `/quran/[surah]` is `force-static` with `dynamicParams = false`, so `prerender-manifest.json`
   holds `/quran/1`…`/quran/114`; `/community` and `/verify` prerender the rows the build's database
   held (five posts and two certificates on this checkout). Rejected. It buys the Quran reader and
   nothing that motivated the issue: `/u/[username]` (`revalidate = 300`, no `generateStaticParams`)
   has no prerendered document at all, which is the profile-link-from-a-message case, and the other two
   cover only what existed at build time. It also inflates the install — those 114 Quran documents are
   **17.04 MB** of HTML (2.41 MB gzip, 1.41 MB brotli) against the 1.63 MB the current 29-shell list
   holds, pinned in Cache Storage, and fetched one at a time on install. Neither ceiling would stop it:
   `sizeOf` (`public/sw.js`) accounts `Content-Length`, the compressed wire size, while the current
   1.63 MB figure is raw bytes, so the 6 MB ceiling cannot see the jump in what the device stores; and
   the 32-route cap would have to rise to roughly 146, which defeats the routing-mistake guard it is.
3. **A generic per-segment shell** that paints "this item is not on this device" client-side. Rejected.
   It is a new rendering contract per segment (and a new copy, gate and test surface for each), and what
   it renders is a page about the missing item — the same answer `/offline` gives, with more machinery
   behind it.

The cost of the chosen option is one online visit before a detail deep link works offline, which is the
same cost every data-bearing route already pays (ADR-0031) — paid once per document rather than once
per segment. `e2e/public-offline.spec.ts` pins the boundary in both directions (first offline deep link
lands on `/offline`; the same link renders after one online visit), so a future change to the precache
has to move the spec's limits with it.

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
  e2e asserts the document, which is what the issue promises. _(Since #490 the
  refresh queues the chunks each shell names — see the amendment below — so this
  now closes on the pass that reaches the route rather than on its first visit.)_
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

## Amendment: the shells refresh after activation, not during install (#489)

`install` used to fetch all 29 route documents (1.63 MB) before the worker activated, one at a
time, competing with the page the user was looking at. On a slow connection the install outlasted
the browser's patience with an installing worker, and a terminated install threw the whole list
away. Install now fetches only the irreducible shell — `/`, `/offline`, the manifest and the four
icons — and the build's list is a **background refresh** after activation.

- **Idle windows, bounded concurrency.** Four routes per window, two fetches at a time, eight
  windows per pass, which covers the 32-route cap in one visit. A window is gated by
  `requestIdleCallback` where the realm exposes it; a service worker does not, on today's
  browsers, so the fallback is a 500 ms delay — the same intent (stay out of a document's own
  hydration burst), with a coarser signal. `activate` starts the pass and does not await it: it is
  the one event every install is guaranteed after, and the page that triggered the install was
  uncontrolled while `install` ran, so it may never make a request this worker sees — but a stalled
  route fetch must not hold up the takeover. A request that arrives attaches to the same pass, and
  a later one continues a pass that stopped early.
- **Resumable, with the cache as the record.** A pass re-reads the cache and skips every route
  this build already holds, so a worker the browser terminates mid-list — or a device that goes
  offline — keeps what it has, and the next window continues instead of starting over. A pass
  that stopped early skips the one-minute interval that stops a completed pass from repeating on
  every GET.
- **The same two ceilings, measured against what the device holds.** The list's 6 MB and what is
  left of ADR-0069's cache budget. A route that does not fit stops the pass rather than crossing
  either ceiling; the routes already cached stay pinned like the fixed shell, and a refresh that
  replaces a previous build's copy only spends the growth in bytes.
- **Coverage arrives in the visit, not in the install.** The promise is unchanged — a public
  static route answers offline without being visited — but its window now closes when the refresh
  reaches the route rather than when the worker installs. A first offline hit on a route the pass
  has not reached yet still lands on `/offline` (the spec's first door), which is the same shape
  as "the install has not finished" and just as short on a normal connection.

`e2e/public-offline.spec.ts` no longer assumes install fetched the list: it polls the worker's
cache for the shells it is about to request offline, which is also the assertion the offline pass
needs. `scripts/__tests__/sw.test.mjs` proves the install fetches the fixed shell only, that a
window waits for the idle signal, that routes are fetched two at a time, that a stopped pass
resumes from what the device holds (on the next request, and across a worker), and that going
offline mid-list loses nothing already cached.

## Amendment: the #473 fallback is superseded — a miss serves the nearest shell (#490)

The #473 amendment above accepted that a never-visited dynamic detail route lands on `/offline`, and
recorded a generic per-segment "this item is not on this device" shell as the rejected alternative. The
precache decision it protects is unchanged and still correct: a dynamic pattern is not a document, and
the 114 prerendered Quran documents stay out. What was wrong is what answers the miss.

`/offline` is a different screen replacing the one the user asked for, and the app already holds
something better than nothing: the ancestor segment's document. So a navigation with no copy of its
own is now answered with the **longest cached path prefix** — `/community` for
`/community/<slug>`, `/quran` for `/quran/<surah>`, `/verify` for `/verify/<code>`, and `/` for
`/u/<username>`, whose `/u` segment has no page of its own — served at the URL the user asked for.
`/offline` keeps the two doors that are left: an empty cache (a new install's first hit with no
network) and the never-cache surfaces, `/admin` among them.

The rejected alternative in #473 called for a per-segment rendering contract. This is not that: the
response is an existing document, and the only new rendering is one app-wide card that says the link
is not available offline. The card is the shared needs-connection state (ADR-0031), so no surface
gains a new gate, and it needs no per-segment copy.

- **The swap is invisible, so the worker says it out loud.** The client cannot tell an ancestor
  document from the one it asked for — the URL and the hydrated tree are the parent's either way. The
  worker records `{ requested, served }` in the cache it already keeps for its own bookkeeping
  (`royaraqamia-cache-meta`), clearing it at the start of every navigation it answers and writing it
  only on a prefix serve. `frontend/shared/prefix-serve.ts` reads it once after hydration, and
  `frontend/ui/shared/offline-route-card.tsx` draws the card when `requested` is the current pathname.
  A later online visit to the same URL therefore never inherits a card.
- **A shell is a document _and_ the chunks it names.** A precached document paints, but hydration
  needs the `/_next/static` files it references, and a route the device never visited has none — so
  the prefix-served parent would stay inert and the card (client-rendered) would never mount. That is
  the `Only documents, not their route-specific chunks` limit below, and #490 turns it into a
  user-visible one. The background refresh now queues the asset references of every document it
  fetches, plus the fixed shell's own (fetched by `install`, not by the list), in
  `royaraqamia-cache-meta`'s asset queue and drains a bounded handful per idle window —
  `ROUTE_REFRESH_ASSET_BATCH`, twelve — so the files trickle in over a few passes instead of bursting
  beside the page the user is on. The queue is build-stamped and is the record, like the cached
  documents are for the route list: a worker the browser stops resumes from it. Assets are
  content-addressed, so one file serves every document that names it, and they are charged to
  ADR-0069's cache budget rather than the route-shell ceiling, which still bounds documents alone.
- **A prefix serve is its own telemetry door** (`navigation-prefix`, ADR-0074's 2026-10-22
  amendment), so the field can tell a graceful fallback from the miss that still reaches `/offline`.
- **A client-side navigation needs no extra rule.** An RSC fetch that cannot be answered offline is
  already answered by the App Router with a browser navigation, which arrives at the document above
  and therefore at the nearest shell; the failed payload never becomes the route's error boundary.

The cost is the one the #473 amendment already priced — `what renders is the ancestor, not the item,
until that item has been opened online once` — paid without a wrong screen at the end of it.
`e2e/public-offline.spec.ts` pins it for the three public shapes and `product-offline-render.spec.ts`
for a product subroute; `scripts/__tests__/sw.test.mjs` proves the prefix order, the homepage walk,
the marker's lifetime, that the chunks arrive with the document and resume from the queue, and that
`/offline` still answers an empty cache and `/admin`.

## Amendment (2026-10-26, #555): `/news` becomes a shell, and the cap moves to 33

[#555](https://github.com/royaraqamia/royaraqamia/issues/555) closed the case this ADR's #557 rule was
written for: `/news` reads its own `searchParams` on the server, so the build never prerendered it
and it was the one public page outside the list, answered offline by the ancestor fallback. The
filters and the digest moved to the client (a data-free shell, the ADR-0073 shape the product roots
took), so the build prerenders it and the generated list includes it.

That made the list 33 shells with `/news` in and `/verify` out — the cap had to drop public content
from the tail, which is the exact failure #449 raised it for. The cap therefore moves from 32 to 33,
measured rather than estimated: the #555 build's own HTML for those 33 documents is **1,931,124 bytes
(1.84 MB)**, against the unchanged 6 MB install ceiling — 31% of it — and the refresh still covers the
list in eight idle windows of four routes. Raising it further is a routing-mistake question, not a
byte one: the 146-route measurement in the amendment above is why the cap tracks what a _visit_ is
worth fetching, not what would fit.
