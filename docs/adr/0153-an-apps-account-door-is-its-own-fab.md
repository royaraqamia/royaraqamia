# An app's account door is the app's own FAB

`/news` grew a gear that opens the reader's news sources
(`NewsSettingsFab`), while `/account` still listed a «مصادر الأخبار» row for
the same destination. LinkSnap had no such control at all: its owned links were
reachable only through the account page. That left two entry points to one
settings page on one app, and none on another.

## The decision

- **Every personal app opens its account screen from its own page.** LinkSnap
  gains the same FAB `/news` wears — the shared `FabButton`, a `Link2` glyph,
  the label «روابطي» — and it lands on `/account/links`. A guest gets the same
  sign-in prompt the news FAB shows, worded for links, and returns to
  `/account/links` after signing in.
- **The account page stops duplicating those two doors.** «مصادر الأخبار» and
  «الرَّوابط المختصَرة» leave `AccountRows` in both clients; their routes,
  pages and states stay live and are still reachable from the FAB. The rows'
  copy keys leave `shared/copy/account-rows.json` with them, so no string
  survives with nothing to draw it.
- **The app picker has no visible title.** The `تطبيقاتنا` sheet is a picker,
  not a page: its rows name themselves, and the heading «التطبيقات» only
  consumed the first screenful of a bottom sheet. The title stays in the DOM as
  the sheet's accessible name on the site (`sr-only`) and is dropped from the
  app's sheet, so a screen reader still announces what opened.

- **The FAB belongs to the app's surface.** `LinkSnapSurface` is drawn both by
  `app/linksnap/(app)/page.tsx` and by the homepage under its strip
  (ADR-0151), so the surface owns the account door and the route renders it
  wherever it goes — see the amendment below.

## Why not the alternatives

- **Keep the account rows as well.** Two controls for one destination are two
  things to keep in step, and the news pair already drifted: the FAB had the
  sign-in prompt, the row had the account page's own.
- **Drop the account rows without the FAB.** `/account/links` would have no
  entry point from the app that owns it; a member would have to remember the
  URL or reach the page through `/account`'s remaining rows.
- **Keep the picker's heading.** It is a label on a control the trigger already
  names, and a bottom sheet's height is the scarcest space on the phone.

## Consequences

- `shared/copy/account-rows.json` loses `news` and `links`; `check:parity`
  requires the reference component to render every key, so the removal is
  enforced on both clients at once.
- `shared/visual/home.json` loses the `title` box from the picker's contract —
  there is no box left to measure.
- A member who used the account page to reach their links now taps «روابطي» on
  `/linksnap`; the account page is shorter by two rows and unchanged otherwise.
- **The app is one control short until it draws the same FAB.**
  `LinksnapShortenerScreen` has no floating control and `linksnap` is a
  switched-on surface, so the app's shortener and the page are no longer the same
  screen; `shared/visual/linksnap.json` names no box for it either. The port
  (native button, a `parity.json` row, the copy in `shared/copy`, the contract
  box) is [#1208](https://github.com/royaraqamia/royaraqamia/issues/1208).

## Amendment: the FAB follows the app to the homepage tab

Mounted by the route, the door appeared on `/linksnap` and nowhere else: a
reader who chose LinkSnap in the homepage strip could not reach their links
without leaving for `/linksnap` first — the route the tab exists to save them
from. `/news` never had that hole, because its gear lives in `NewsSurface`. The
two apps disagreed about where the control goes even after this ADR made them
agree about the control itself.

The FAB now lives in `LinkSnapSurface`, the way `NewsSettingsFab` lives in
`NewsSurface`. Both the route and the tab render the surface, so the two cannot
drift; the destination (`/account/links`) and the guest's sign-in prompt are
unchanged.

- The "FAB belongs to the route" clause above is superseded by this amendment.
- `shared/visual/home.json` keeps measuring the strip, the picker and the empty
  state; the FAB is one component in two places, and the box
  [#1208](https://github.com/royaraqamia/royaraqamia/issues/1208) adds to
  `shared/visual/linksnap.json` measures it.
- [#1208](https://github.com/royaraqamia/royaraqamia/issues/1208)'s native port
  is unaffected: `LinksnapShortenerScreen` draws the control as part of its
  screen either way.

## Amendment: the legal rows follow the settings rows out

The account page lost the same shape a second time. `الخصوصيَّة`, `الشُّروط` and
`الأمان` were three rows to pages nobody opens from inside the account, and the
`/account` front page now draws the member's own rows, the app doors and the FAQ
and nothing else. The rows leave `AccountRows` on both clients, and the copy
keys leave `shared/copy/account-rows.json` with them.

The pages themselves stay, exactly as ADR-0152 kept `/verify`: they keep their
metadata, their sitemap entries and their chrome, and they answer a direct or
printed URL. What the site no longer does is offer a link to them from anywhere;
a reader arrives by following a policy link in a store listing, a payment
provider's review or a search result.

- The footer is the brand line and the social icons again. Its comment claimed
  the account rows carried the legal pages "again", which this change makes
  false; the comment goes with the claim.
- No replacement door is added. A future change that needs one - a store
  reviewer, a jurisdictional requirement - adds a single legal line to the
  footer rather than three cards to the account page.
- `account-rows` stays one component in `docs/mobile/parity.json`; the Kotlin
  screen draws the same shortened list.

## Related

- [ADR-0146](0146-the-homepage-is-the-app-door.md) — the picker this sheet is.
- [ADR-0151](0151-a-tab-is-a-state-not-a-route.md) — the surface the homepage
  draws, which is why the FAB stays in the route.
- [ADR-0152](0152-two-pages-leave-the-app-picker.md) — the same "route stays,
  entry goes" shape for two picker rows.
- [#1208](https://github.com/royaraqamia/royaraqamia/issues/1208) — the native
  FAB this decision owes the app.
