# A tab is a state, not a route

[ADR-0146](0146-the-homepage-is-the-app-door.md) put the member's apps on the
homepage as a strip, and said the strip is a navigation surface: a pill is a
link, and the app opens at its own route with the door left behind.
[ADR-0149](0149-the-app-roots-wear-the-app-chrome.md) made that door and its
strip one address, `/`, with the app roots around it. The owner's rule for the
door is the opposite: a tap on a tab must not leave the homepage. The content
belongs under the strip, in place, and a member who arrived at `/` stays at `/`.

## The decision

- **The strip is a tablist, not a list of links.** A tab is a `<button>` with
  `aria-selected`; selecting one writes state in `HomePageContent`. There is no
  `router.push`, no `<Link>`, and the address bar stays `/`. The tab that is on
  is violet; the surface under it changes.
- **The selected app renders under the strip.** Each app's content was extracted
  into `frontend/ui/<app>/<app>-surface.tsx`, and both the app's route and the
  homepage render that one component. The route keeps its frame and metadata;
  the surface owns neither a `<main id="main-content">` nor the page's title, so
  the door's single landmark survives (two `main` elements is invalid, and a
  second tab bar would be a second page).
- **The app routes stay.** `/quran` is still an indexed page with its own
  metadata, its offline document and its shareable address; a printed
  certificate link (`/verify/<code>`), an unlock link and a sitemap entry still
  need a page. The tab never visits them — a typed or shared URL does.
- **The choice is a device preference.** `royaraqamia:home-tab:v1` remembers the
  tab across a reload, and a tab removed from the strip falls back to the first
  app left. It is not account data: it changes no permission, and one truth per
  device is enough for a view.
- **A surface reads the same source its route reads.** The route's server loaders
  are not available to a browser, so the two apps that need data gained a public
  read of the same asset: `/api/rates/board` (the board the app already consumes,
  #658) and the static `/api/athkar` (both vendored collections). Quran reads
  `public/quran/meta/index.json`, `pages.json` and the search manifest the build
  ships. Nothing account-bearing is read into `/`, so the door keeps its shared
  cache and its precached document (ADR-0031).
- **The host repeats the route's frame.** The public tools own their `max-w`
  and top padding, the local-first apps sit in the AppShell's band, and Quran and
  Athkar bring their own container. The door supplies that frame per app and a
  bottom pad for the fixed tab bar; a surface that needs `MotionRoot` gets it.
- **Deep views are still addresses.** A surah, a news filter, a spendtrack
  category or a verify result is a screen with its own URL (ADR-0147). The tab
  hosts the root it opened; it does not duplicate every drill-down as a second
  page state. A member who opens one of those leaves the door for that app's
  route, exactly as the app already behaves.

## Why not the alternatives

- **Keep the strip as links and call the soft navigation "inline".** The address
  still changes to `/news` and a refresh lands on the app, not the door — the
  behaviour the owner vetoed. A soft navigation is still a navigation.
- **Intercepting routes / a parallel slot.** They keep the shell, but the URL is
  still the intercepted route, and every drill-down needs a file in the slot.
  The door's address would lie about where the member is.
- **An iframe per app.** It reuses the route untouched, but brings nested
  chrome, a second scroll container, focus traps, camera and player edge cases,
  and two `main` landmarks. The browser's frame is not a component boundary.
- **Render `/` on the server from a cookie naming the selected app.** `/` stops
  being the shared, cacheable, precached document every visitor gets, and the
  page's metadata becomes the selected app's. The door is the one page that must
  stay identical for everyone (ADR-0031).
- **Duplicate each app's page inside the homepage.** Two copies drift: a state
  added to `/news` would be missing from the tab. The surface extraction is the
  thing that makes the second copy impossible.

## Consequences

- `HomePageContent` is the one place the selection lives; `HomeTabStrip` and
  `HomeAppSurface` are its two halves, and the surface is loaded lazily so `/`
  ships the strip and one app, not nine.
- The surfaces are not gated by the visual contracts by themselves: the route's
  contract still measures the route. A tab's frame is the route's frame by
  construction, and `check:layers` keeps the shared stylesheet honest.
- The two public reads are static and keyless; a failed read shows the surface's
  own loading/failure state and never an empty page. Offline, `/` paints the
  strip from the device and a surface it has not fetched says so; the app's own
  route remains the offline deep link.
- Sharing `/` shares the door, not the selected tab. A deep link to an app still
  uses the app's route, which is why the routes stay.
- The bottom bar's Home returns to the door, and the door now remembers the tab
  the member was in. A launch preference that skips the door entirely is still a
  launcher concern, not this one.

## Related

- [ADR-0146](0146-the-homepage-is-the-app-door.md) — the door and its apps; the
  "strip is navigation" clause is superseded here.
- [ADR-0147](0147-a-screen-is-a-url-an-overlay-is-not.md) — which views are URLs.
- [ADR-0149](0149-the-app-roots-wear-the-app-chrome.md) — the chrome around a
  route; unchanged, because the tab hosts the root and a drill-down still leaves
  the door.
- [ADR-0031](0031-server-owned-constraints-stay-online-only.md) — the shared,
  account-free document this decision preserves.
