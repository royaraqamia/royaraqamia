# Two pages leave the app picker

`/verify` and `/mcp/guide` were two of the eleven app pills, and the owner
removed them from the picker and the shell's sheet. Neither is something a
member keeps on the door: one is a certificate check a printed link opens, the
other is setup instructions reached from the account. Both keep their pages and
their screens; only the menu rows are gone.

## The decision

- **The picker lists nine rows.** `SERVICES_LINK.subItems` marks the two as
  `retired`, and `ServicesMenuItems`, the homepage strip and the shell's
  `ServicesEntry.rows` filter the flag out. The home catalog
  (`HOME_SERVICE_ROUTES`) drops them, so a stored `home_services` row with a
  retired key is ignored by the existing sanitizer — no migration, no blank tab.
- **Their pages stay.** `/verify` and `/mcp/guide` keep their metadata, sitemap
  entries, native screens and the app chrome; `route-kind.ts`'s
  `STANDALONE_ROUTES` keeps the top nav and the tab bar on them while leaving
  the Home tab unlit (they are destinations, not app roots).
- **The copy and the glyphs stay shared.** Their strings remain in
  `shared/copy/shell-services.json` and their icons in
  `shared/icons/icons.json`, because the screens that still draw them read the
  same source, and the parity gate is the reason the two clients cannot spell a
  row differently. `retired` is a picker fact, not a copy deletion.
- **The native sheet matches.** `ShellServices.rows` lists the same nine, so the
  shell's sheet and the site's picker cannot disagree about what is on offer.

## Why not delete the routes

A printed certificate's `/verify/<code>` link, the account's link to the MCP
guide and the sitemap still point at both pages. Removing a menu row and removing
a page are different decisions, and only the first was asked for.

## Why not keep them as hidden rows

A row that is in the list but unaddable is a bug the member cannot explain; the
picker's job is to say what can be on the door. If either tool returns as an app,
it returns with a row, not a flag.

## Consequences

- The homepage's surface set is nine lazily loaded apps, so the door ships one
  less chunk per retired app and the picker is one screen shorter.
- A member who had either app on their strip loses that tab on the next read;
  the rest of their order is untouched, and the first remaining app is painted.
- Their routes are still reachable by a direct or shared URL, and the chrome
  around them is unchanged.

## Related

- [ADR-0146](0146-the-homepage-is-the-app-door.md) — the picker this narrows.
- [ADR-0148](0148-hidden-services-is-retired.md) — the earlier removal of the
  four lead forms, with the same "route stays, entry goes" shape.
- [ADR-0151](0151-a-tab-is-a-state-not-a-route.md) — the tab host these rows fed.
