# An app root is a tab, and its address is `?tab=`

[ADR-0151](0151-a-tab-is-a-state-not-a-route.md) made the strip a tablist and
kept every app root as its own page, on the argument that a typed URL, a push
notification, a sitemap entry and a bookmark still need an address. The owner's
next rule goes further: a member who arrives at an app from outside should still
land on the door, and an app should not have a second screen that is a copy of its
tab. LinkSnap is the first root to lose its page.

## The decision

- **The door's address names the tab: `/?tab=/<app>`.** `HomePageContent` reads
  the query and the saved preference, the query winning, and a selection rewrites
  it with `router.replace`, so Back leaves the door instead of walking the tabs
  and a copied link reopens the same tab. The value is the tab's own catalog key,
  so the address, the strip and the store spell the app the same way.
- **An addressed app is drawn even when it is not on the strip.** LinkSnap was
  the public shortener, and a guest's strip starts empty; a link that names an
  app must open the app, not the "add your first app" screen. The surface is
  drawn without a pill, the strip is left as the member had it, and the address
  keeps naming the app.
- **A retired root is a redirect, not a page.** `/linksnap` answers a 307 to
  `/?tab=/linksnap` from `next.config.js`. Next passes the request's query
  through, which is what keeps a blocked, expired or missing short link's
  `?error=` and `?code=` on their way to the banner the LinkSnap surface already
  draws. The failed-redirect target in `backend/controllers/linksnap.ts` is the
  same address.
- **The shortcut form's prefix is the host, not the scheme.** `getBaseHost()`
  drops `https://` from the read-only prefix beside the slug field, so the field
  shows `royaraqamia.com/my-promo`; the full URL is still what copy and share
  hand to the clipboard. Every prefix that points at a slug uses the one helper.
- **The empty list's action fills the form, not a route.** «إنشاء أول رابط» used
  to link to the page that no longer exists. It scrolls the shortener card into
  view and focuses its URL field, which is the only screen that draws it.
- **The offline document follows the tab.** LinkSnap's row in
  `perf/surfaces.json` no longer owns a route and no longer claims a precached
  shell: its document is the door's pinned `/`, its data is the device's Local
  Store, and its lazy chunk is runtime-cached after the first tab open. An offline
  first visit to a LinkSnap bookmark lands on the door.
- **The other eight roots stay for now.** `/news` carries filter state in its
  query, push notifications name `/habitflow` and `/spendtrack`, and the sitemap
  and offline snapshot keys are route-based. Moving them is the same decision
  applied one root at a time, and each needs its own change.

## The rest of the same owner review

- **The floating assistant has no door to the full thread.** The panel is the
  assistant's short conversation; the «فتح المحادثة كاملة» row is gone from the
  web panel and the Android sheet, and its copy key is gone from
  `shared/copy/assistant-panel.json` so neither client can draw it again. A
  proposal the app cannot confirm now names itself from the frame's own label
  rather than pointing at a thread link that no longer exists.
- **The panel and its launcher are IBM Plex Sans Arabic.** The Aref Ruqaa
  heading face leaves the panel's title and guest title; digits still reach Aref
  through `--font-sans`'s digits-first family, so numbers keep the calligraphic
  face while the words are the body face.
- **The Quran search field starts at the right.** An empty field is `dir="rtl"`,
  which is what puts the placeholder on the right; once there is a value, `auto`
  lets a Latin query keep its own direction.
- **The notification centre has no bare address.** The bell still links to
  `/notifications`, because only the client knows what is waiting; once the feed
  settles the view replaces the address with `?tab=alerts` when anything is
  unread and `?tab=chats` otherwise. An unread alert outranks an unread message,
  and an explicit `?tab=` is never overridden.
- **`/mcp/guide` wears the secondary chrome.** It is a reading page reached from
  the account, not an app, so it drops to the floating back control like any
  drill-down. `/verify` keeps the app chrome: a printed certificate's link is a
  destination, not a drill-down.

## Why not the alternatives

- **A page that renders the tab and replaces the URL on the client.** It keeps
  the old document alive next to the door's, which is the second copy ADR-0151
  already rejected for the surfaces, and the address would lie for a frame on
  every visit.
- **A server redirect from `/linksnap` to `/` plus a cookie naming the tab.** The
  door would stop being the identical, cacheable document every visitor gets
  (ADR-0031), and the redirect would need the member's strip to know that the tab
  exists.
- **Deleting the eight remaining roots in the same change.** News's filters,
  three push targets, the sitemap and the offline snapshot keys are each a
  contract that would need rewriting, and none of them is the bug the owner
  reported.

## Consequences

- `/?tab=/linksnap` is the LinkSnap tab's shareable address, and
  `/linksnap?error=blocked&code=x` still explains itself through the redirect.
- A bookmark to `/linksnap` lands on the door and draws the shortener, with or
  without LinkSnap in the member's strip; an address naming a tab this build does
  not have is corrected to the one it draws.
- The LinkSnap parity rows now name `app/page.tsx` as the page that draws the
  surface, and the visual gate keeps measuring the same surface through the
  redirect.
- **Amended.** The app resolves a tab address back to the app's route
  (`Routes.appTabOf`), so `/?tab=/linksnap` — the address `/linksnap` now
  redirects to — draws the native screen instead of the document. Without this,
  the redirect retired the app's own port along with the page.
- The Android shell still opens LinkSnap natively at its own route, and resolves
  the tab address back to it (see the amended consequence above); a web route
  decision does not move a port, but the address the port is reached by is the
  tab's now.

## Related

- [ADR-0151](0151-a-tab-is-a-state-not-a-route.md) — the tab host; its "the app
  routes stay" clause is amended for LinkSnap here.
- [ADR-0146](0146-the-homepage-is-the-app-door.md) — the door itself.
- [ADR-0149](0149-the-app-roots-wear-the-app-chrome.md) — the chrome a route
  wears; unchanged for the roots that remain.
- [ADR-0031](0031-server-owned-constraints-stay-online-only.md) — the identical,
  account-free document this decision keeps.
- [ADR-0071](0071-the-precache-list-is-a-measured-budget.md) — the precache
  budget that LinkSnap no longer spends a slot from.
