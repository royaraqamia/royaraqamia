# The apps sheet is the one apps surface

`تطبيقاتنا` opened a sheet that listed our nine apps and one row to the
marketplace; the marketplace had two tabs of its own, and the inbound list also
had an account row. A member asking "what apps do I have", "what can نور reach"
and "what can reach me" was visiting three doors for one question. The owner's
rule: every app-related thing lives in the sheet, and the account row goes.

## The decision

1. **One surface, three tabs.** «تطبيقاتنا» is the first tab, «تطبيقات خارجيَّة»
   is the marketplace, «الـ MCP الخاص بنا» is the clients connected to our MCP
   server. The tab bar and the search are the same in both hosts.
2. **The sheet is full height at every width** — `100dvh` on a phone, a centred
   90dvh dialog on a desktop — because the surface is now a place, not a menu.
3. **The sheet is the door; `/mcp/apps` stays the address.** The page renders
   the same component, because an OAuth callback, a bookmark, a deep link from
   the app and the back button need a URL a sheet cannot carry. A page that
   opens a modal on load would be the worse answer.
4. **The account row is retired.** `/account/connected-apps` stays a redirect to
   `?tab=inbound` so old links resolve; the row itself is gone from both clients.
5. **Search belongs to the active tab.** The picker and the connected list
   filter locally; the marketplace is a trigram read over a mirrored catalogue
   and searches on the server. One box, three behaviours, no mixed ranking.
6. **A sheet tab is state; a page tab is a URL.** The sheet always opens on the
   picker, and Back closes it instead of walking tabs (ADR-0151).
7. **Opening stays cheap.** The sheet chunk carries the picker and nothing else;
   the two MCP panels are lazy boundaries, warmed after the sheet is on screen.
   Their data is seeded from a session cache and revalidated in the background,
   so a reopen draws rows instead of a skeleton. The content is never
   force-mounted to buy that.

## Considered options

- **A route instead of the sheet.** Rejected: a route pays a round-trip on every
  open and throws away the page the member was reading, while the sheet chunk is
  prefetched on hover.
- **One search across all three tabs.** Rejected: the three lists hold different
  records and share no ranking; a mixed result would need one.
- **Tabs in the sheet's URL.** Rejected: Back would step through tabs before
  closing the sheet.
- **Prefetching data on open.** Rejected: three requests on every open is the
  weight the surface exists to avoid. Chunks are prefetched; data is not.
- **Keeping the account row as a shortcut.** Rejected: it is a second door for
  the same list, which is what this change removes.

## Consequences

- ADR-0155 decisions 1, 2 and 10 are amended: the marketplace is a tab, not a
  row; there are three tabs, not two; and the account row is retired.
- `marketplace-copy.ts` and the new surface copy stay local until the native
  sheet claims them in the follow-up, which moves both to `shared/copy/` and
  lists the pair in `docs/mobile/parity.json`.
- The native picker gets the same three tabs in a second change. Its account row
  is removed in this one so the shared copy source keeps one shape.
- The sheet is now the primary apps surface on every primary route; the tab
  boundaries are what keep that from becoming a bundle regression.
