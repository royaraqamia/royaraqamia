# Every app root is a tab

[ADR-0156](0156-an-app-root-is-a-tab.md) moved LinkSnap's root and left eight
roots as pages, each with a reason: News's filters, three push targets, the
sitemap, the offline snapshot keys. The owner's rule is now the whole list — a
member reaches an app from the door and from nowhere else, on the web and in the
app — and those reasons move from "why this root stays" to "what this root
costs".

## The decision

- **Every app root answers a redirect.** `/news`, `/rates`, `/athkar` and `/scan`
  join `/linksnap` as 307s to `/?tab=/<app>`, with the request's query passed
  through. The five local-store roots (habitflow, spendtrack, quran, notes and
  LinkSnap) follow in the change that accepts the offline cost for them; this
  ADR is the rule they are held to, not an exemption.
- **The page files stay.** The routes stop being served; the components, layouts,
  contracts and tests behind them are not deleted. Deletion is a later change
  that takes each route's files, its API surface and its specs together.
- **`perf/surfaces.json` lists both addresses.** The page route stays in `routes`
  beside the tab address because the page still exists and `check:surfaces`
  requires every `app/**/page.tsx` route to belong to a surface. `shell` becomes
  `none` for a root the door now serves: the document is the pinned `/`.
- **`/athkar/evening` stays a page.** It is a mode of the surface, not a second
  door to it, and it keeps its own address until the surface draws the mode from
  the tab.
- **Amended: the local stores move one at a time.** Quran is the first: `/quran`
  redirects and its index is the door's tab, while `/quran/[surah]` and
  `/quran/tafsir` keep their own addresses — a surah is a child of the reader,
  not a second door to it. Its precache row drops to `none` in the same change,
  and `e2e/public-offline.spec.ts` stops expecting a reader shell to answer
  `/quran/<n>` offline: the door does now. Notes follows the same shape: `/notes`
  redirects, its list is the tab, and `/notes/api/**` is untouched. HabitFlow is
  the third: `/habitflow` redirects, and the day it keeps in `?date=` rides the
  tab beside it. SpendTrack is the last: `/spendtrack` redirects, its filters and
  the create dialog ride the tab, and `/spendtrack/categories` stays a page
  because a category manager is a screen of the product, not a second door.
- **The app resolves the tab back to the route.** `Routes.appTabOf` turns
  `/?tab=/<app>` into the app's own path before the shell routes it, so a shared
  link and a redirect land on the native screen instead of the document. Without
  it, retiring a root retires the app's port along with the page.
- **The sitemap carries the digest's tab address.** `/news` was a sitemap entry
  at priority 0.9; it is now `/?tab=/news`, which is the address the digest is
  actually drawn at.

## What it costs

- **Search.** `/news` stops being an indexable document. The digest is drawn
  under the strip after a client-side tab read, so a crawler that follows the
  redirect lands on a door that renders the empty state without an account read.
  If the digest must rank, the door has to render an addressed tab on the server,
  which is a change to the door, not to this rule.
- **Offline.** A surface with `shell: none` has no precached document of its own.
  An offline bookmark lands on the door, and the surface's chunk is the runtime
  cache from the last tab open. That is the cost the local-store products were
  held back for, and it is why they move last.
- **Campaigns and old links.** Anything pointing at a root lands on the door with
  its query intact; the surface reads the same params it read before.

## Why not the alternatives

- **Delete the pages with the routes.** The instruction was to let the routes go
  and keep the files; a deletion sweep is a different change with a different
  risk (it takes the API routes, the stores and the specs).
- **Keep the indexable page and add a tab.** Two renderings of one surface, which
  [ADR-0151](0151-a-tab-is-a-state-not-a-route.md) refused and nothing since has
  needed.
- **A server redirect from the app.** The app is the address; the tab is what it
  is handed, and resolving it is one function.

## Consequences

- One address per app: `/?tab=/<app>`, on both clients.
- `docs/specs/surfaces.md` shows the tab address first and the page route second
  for every root that has moved.
- The precache budget loses the four roots this change retires and keeps `/`
  as the one document that answers for them.
- A root that can never be a tab (a mode, a dynamic child) keeps its page; the
  line between them is "does the strip name it".

## Related

- [ADR-0146](0146-the-homepage-is-the-app-door.md) — the door.
- [ADR-0151](0151-a-tab-is-a-state-not-a-route.md) — a tab is a state.
- [ADR-0156](0156-an-app-root-is-a-tab.md) — the first root, and this rule for
  the rest.
- [ADR-0071](0071-the-precache-list-is-a-measured-budget.md) — the precache this
  narrows.
