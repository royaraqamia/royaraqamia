# The product dashboards are cached data-free shells

The four account tools — HabitFlow, SpendTrack, LinkSnap and BlogPress — keep
their owned data in an identity-scoped Local Store and write only through the
Outbox (ADR-0028, ADR-0029). Their data layer has been offline-first for a long
time; their page shape was not. Each dashboard root was a `force-dynamic` RSC
page reading the session (and, for SpendTrack, the URL's filters) on the server,
so no offline-cacheable document existed for it and the worker's never-cache list
carried the whole product prefix (ADR-0031). A reload or deep link with the radio
off landed on `/offline` — the one visible gap left by #447 and #448.

`/device` had already proved the shape that closes it (ADR-0070): a static,
data-free document with every fact painted from IndexedDB after mount. This ADR
extends that pilot to the product roots, with the same boundary: the cached
document never carries a fragment one account could leave for the next.

## The decision

A product dashboard root is a **static shell painted from the Local Store**.

- **Nothing account-bearing is rendered on the server.** The page is one static
  document — no `cookies()`, `headers()`, session guard, server loader or
  `searchParams` read — which is what makes it safe to cache on a shared device
  and lets the build prerender it, so ADR-0071's precache picks it up without a
  hand-maintained list.
- **A client gate resolves identity.** The session provider answers from the
  cached session, and treats network failure as "never a logout" (ADR-0027), so
  the gate can choose the account store, the guest store or a sign-in prompt with
  the radio off. BlogPress's layout guard (`requireAuth`) moves into its
  dashboard for exactly this reason; its editor page keeps the server guard and
  stays never-cache, because it is a per-post render.
- **The Local Store is the render source.** The dashboard paints what the store
  holds and pulls for freshness on open, focus, reconnect and a Realtime hint —
  the pull functions the background tier already runs (ADR-0060). The RSC
  loaders stop seeding the store: seeding was the second source of truth, and it
  is the one thing the offline path could not have. A first-ever visit gets its
  data from the same pull a returning visit uses to reconcile.
- **The Outbox stays the only writer.** Rendering changed; mutations did not.
  Queued writes appear immediately as pending, and each product's existing pill
  reports the queued/failed state.
- **`searchParams` become client view state.** SpendTrack's range, categories,
  sort, from/to, search and create intent, HabitFlow's create intent, and
  BlogPress's category filter are read with `useSearchParams()` inside a Suspense
  boundary, so the URL still drives the view while the document stays static.
- **The never-cache list narrows to the data-bearing prefixes.** `/habitflow`,
  `/spendtrack`, `/linksnap` and `/blogpress` leave the list; their `/api`
  prefixes stay, and so do the subroutes that still render server-side data:
  `/spendtrack/categories` and `/blogpress/editor`. The document shells join the
  auth and account shells on the SWR cache (ADR-0031's #447 and #448
  amendments).
- **Server-owned values read through their own seams.** SpendTrack's currency is
  a client read of `/spendtrack/api/settings/currency` (never-cache), defaulting
  to the shared `DEFAULT_CURRENCY` until it answers; guests fetch the default
  categories from a new never-cache read instead of the loader's seed. BlogPress's
  post list paints from the store's drafts, and its categories/tags stay a
  server read — offline the filter row and tag chips are absent rather than
  wrong.

## What the first load costs

The server render used to stream account data as the document arrived. Now the
document paints the chrome immediately and the data follows one frame later from
IndexedDB, or from the pull on a first visit. A returning visit is faster than
before — no network wait for the first paint — and a first visit is one snapshot
request instead of a dashboard's fan-out of queries. There is no second render
path to keep in step: online and offline paint the same store.

## Consequences

- `public/sw-routing.js` and `scripts/__tests__/sw-routing.test.mjs` pin the
  narrowed list; `scripts/__tests__/generate-sw-precache.test.mjs` pins the
  route selection.
- The build's precache grows by the four product roots and `/blogpress/calendar`
  — five documents, about 190 KB on the #449 build. The whole list is 26 shells
  and about 1.6 MB, still inside ADR-0071's 6 MB install ceiling and the
  32-route cap that amendment raised it to; the worker measures the same bytes
  into ADR-0069's 150 MB cache budget.
- `e2e/product-offline-render.spec.ts` reloads each root offline and asserts the
  product's own heading and local rows, never `/offline`.
- The per-product pull modules are unchanged, which is the point: this ADR moves
  where the data is _rendered_, not how it is reconciled.

## Limits

- **The first online visit is still required.** A device that has never loaded a
  product root has no document to serve, exactly as for every other route.
- **BlogPress's dashboard filters are online-only.** Categories and tags are not
  in the Local Store, so the category row and tag chips render only when their
  read answers; posts themselves always paint.
- **SpendTrack's currency and guest defaults need one online read.** Both fall
  back to the shared defaults, and the selector writes through its existing API.
- **The dashboard is still one document per session, not per user.** It is
  data-free, so the cached copy is safe; the sign-out purge still clears cached
  API reads, and the Local Store is what survives sign-out by design.
