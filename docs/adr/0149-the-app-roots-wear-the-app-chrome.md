# The app roots wear the app chrome

[ADR-0146](0146-the-homepage-is-the-app-door.md) put the member's apps on the
homepage and said a root keeps the top nav and the bottom bar while a drill-down
drops to the floating back control. [ADR-0147](0147-a-screen-is-a-url-an-overlay-is-not.md)
decided which views inside those apps the URL carries. Neither answered the
questions the second phase ran into: what happens when the app opens, where the
strip lives once a member is inside an app, and which entries are not "inside"
the app at all.

## The decision

- **The homepage never redirects.** `/` is the app door, and the Home tab is a
  destination that returns to it — not a hop to the first app. `router.replace`
  would cost the entry behind it (Back would leave the site), make `/`
  unshareable, and remove the only surface that can add the first app. A launch
  preference for "open my first app" is a launcher concern, and a PWA
  `start_url` is static, so it cannot be per member anyway.
- **The strip lives on `/` only.** The app roots wear the top nav and the bottom
  tab bar; they do not stack a second, horizontal app switcher under them. A
  third fixed bar costs a third of a 393 x 852 viewport, and app switching from
  inside an app is Home -> strip or the picker. The Home tab stays lit while the
  member is on any of the roots, because that is the section they came from.
- **The chrome is one shell, mounted once.** The root layout renders the top
  nav, the route-aware back control and the bottom bar; a page does not mount
  its own copy. The eleven roots come from
  `shared/contracts/home-services-catalog.ts`, the same list the strip and the
  picker read, so a tab cannot exist in one place and not the other.
- **Three chromes, by route.** `app` (top nav + bottom bar): `/`, `/community`,
  `/account`, the eleven roots, and a root's own modes (`/athkar/evening`).
  `top` (top nav only): a public entry a stranger can land on — a printed
  certificate, an unlock link — where the member's tab bar and a "back" to a page
  the visitor never saw are both noise. `back`: everything else, a drill-down
  whose screen is behind this one.
- **A filter and a mode are state; a typed value is not.** `?tafsir`, the rates
  pair, basis and market are written into the address bar as the member changes
  them, with `history.replaceState` so Back still leaves the page instead of
  walking through filters. Amounts, grams, search text and drafts stay out.
- **The nav's band is a token, not a spacer's height.** `--roy-navbar-space`
  feeds the nav's flow spacer and `--roy-page-height` (the viewport minus that
  band) feeds every app-chrome shell, so a page that fills the screen no longer
  overflows it by exactly the bar's height.

## Why not the alternatives

- **Redirect `/` to the first app.** It buys one saved tap in the installed app
  and costs the door, Back and every share of the homepage.
- **A `(tabs)` route group for the eleven roots.** The root layout already
  persists across every navigation, so a group adds no shell lifetime; it would
  move fifteen page files, their metadata hosts and their surface rows for a
  subtree nothing needs.
- **The strip on every root.** It is the same app switcher the bottom bar and
  the picker already provide, in the least useful place.
- **A back control on a public entry.** The page behind it is the link the
  visitor followed, not a screen of ours.

## Consequences

- `route-kind.ts` is the one place chrome is decided, and its test derives the
  app roots from the catalog and the layout-only paths from `app/`.
- The homepage's empty state and the strip are still the only add surface, and
  the picker is still the only list.
- `docs/mobile/parity-plan.json` keeps `home` as `todo`: nothing here draws the
  homepage natively, and a port is switched on by the visual gate, not by the
  web phase landing.
- The URL grammar for the apps is unchanged from ADR-0147; this decision only
  fixes where the shell around it comes from and what `/` does.

## Related

- [ADR-0146](0146-the-homepage-is-the-app-door.md) — the door and its tabs.
- [ADR-0147](0147-a-screen-is-a-url-an-overlay-is-not.md) — which views are URLs.
- [ADR-0148](0148-hidden-services-is-retired.md) — the preference this replaces.
