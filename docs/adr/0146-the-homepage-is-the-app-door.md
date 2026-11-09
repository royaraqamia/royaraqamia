# The homepage is the app door, and its tabs are the member's apps

The homepage was a marketing page: a hero, metric cards, a horizontal row of
services and testimonials, all scrolled past by a member who came back to open
the Quran. The product already has eleven working tools — Quran, Athkar, News,
Verify, Rates, Scan, LinkSnap, HabitFlow, SpendTrack, Notes and the MCP guide —
and none of them lived on the page the Home tab opens.

The product also had a way to _hide_ a tool it did not want to see
([ADR-0112](0112-a-hidden-service-is-an-account-preference.md)). That was the
inverse of what a returning member needs: they do not want fewer rows in a menu,
they want the four tools they use every day on the page they land on.

## The decision

- **The homepage is the app's front door.** The four marketing sections are
  unmounted from `app/page.tsx`; their components stay in the tree for the
  marketing page they may return to. The homepage renders the member's apps as a
  strip, or one empty state when there are none.
- **The member adds apps explicitly.** Nothing appears because a route was
  visited: opening `/athkar` directly renders Athkar and leaves the strip alone.
  The picker is the only way in, and it is the same sheet the navbar's
  `تطبيقاتنا` trigger opens — the navbar and the empty state cannot drift.
- **The sheet is a picker, not a menu.** A row is add or remove, never a link;
  the sheet stays open for the next choice; the four lead forms
  (`/request-project`, `/hire`, `/training/apply`, `/consultation/book`) leave it
  entirely. They are services you buy, not apps you keep. Their routes stay live
  and indexed; only the navigation entry is gone.
- **Order is add order and there is no cap.** The strip is what the member built,
  in the order they built it. A cap would turn the last tap into a refusal, and
  manual reordering adds a gesture for a list that is rarely longer than four.
- **The preference is account data, with a device fallback for a guest.**
  `public.home_services` holds one row per app for a signed-in member; a guest
  keeps the same ordered list in `localStorage`. On sign-in the account's list
  wins its positions and the guest's apps are appended, then the device copy is
  cleared — one truth after the merge, and no second list that disagrees on the
  next visit.
- **An app keeps its own route.** `/quran` is still a real, indexed page with its
  own metadata and offline document; the strip is a navigation surface, not a
  second rendering of the tools. Redirecting the eleven routes into one page was
  rejected: it would break the link printed on physical certificates
  (`/verify/<code>`), the sitemap and every shared link, for no gain.
- **The roots wear the app chrome; a drill-down does not.** `/quran` gets the top
  nav and the bottom bar; `/quran/2` drops to the floating back control, as the
  rest of the app already does for detail screens. A reader with a third bar
  loses a third of a 393 x 852 viewport.
- **The empty state is an activation surface, not a placeholder.** It names the
  choice («ابدأ بتطبيقك الأوَّل»), gives concrete examples, and says the choice is
  reversible («يمكنك تغييرها وقت ما تشاء»).
- **The word is «تطبيقات».** «خدمات» described the four lead forms that left;
  «أدوات» is accurate but cold for the Quran and the Athkar. The sheet is
  «التطبيقات» and the trigger «تطبيقاتنا».

## Why not the alternatives

- **A personalised `/` rendered on the server.** It would paint without a
  skeleton, but it makes the shared homepage an account-bearing document and
  costs the cache every visitor benefits from (ADR-0031). The strip settles in
  the browser instead, and the server document stays identical for everyone.
- **Auto-add on first visit.** It removes a decision the member did not make: a
  link opened once would permanently change their home.
- **An inverted hidden set** (every app is on the homepage unless hidden): it
  cannot express order, and it makes the first visit a page of eleven apps the
  member never chose.
- **One `/?tab=` document with every drill-down in query params.** It keeps one
  route, but makes a twelve-branch query parser, loses per-view caching and
  first paint, and duplicates what the App Router already does with paths.
- **A cap, or drag reorder.** Neither earns the gesture or the refusal; add order
  is the order the member already believes in.

## Consequences

- `home_services` is read and replaced through `GET`/`PUT /api/me/home-services`;
  the replacement is the whole ordered list, so a half-saved strip cannot exist.
- A guest's list is a preference with no account, so it is the one place the
  product deliberately keeps two stores — and the merge is what makes that
  temporary rather than a second truth.
- The four lead forms are no longer discoverable from the menu. They stay live,
  indexed and linked from wherever they already were; a future navigation entry
  is a new decision, not a regression to undo.
- The native sheet owes the same add/remove behaviour and the guest store; until
  it lands, the app's sheet still navigates (the generated row names already
  match, so the two clients cannot disagree about what an app is called).
- Per-view metadata, sitemap entries and the visual gate stay attached to the
  eleven routes, not to the homepage.

## Related

- [ADR-0147](0147-a-screen-is-a-url-an-overlay-is-not.md) — which views inside an
  app the URL carries.
- [ADR-0148](0148-hidden-services-is-retired.md) — the preference this replaces.
