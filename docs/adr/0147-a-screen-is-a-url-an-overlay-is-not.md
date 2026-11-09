# A screen is a URL; an overlay is not

Putting the member's apps on the homepage raised a question the old marketing
page never had: when a member opens a surah, a note, a spendtrack category or a
scan result, what belongs in the address bar?

Two bad answers are easy. Put nothing in the URL and refresh, Back and sharing
all break inside the app. Put everything in the URL and the address bar carries
search text, an open menu, a half-typed form and a video position — state that is
not a destination, cannot be linked to, and in several cases is not serializable.

## The decision

**A screen survives a refresh and can be shared, so it is in the URL. A modal, a
live device result, a draft and playback are not.**

| Surface    | Root (indexed)      | In the URL                                                                       | Deliberately not                                                                                |
| ---------- | ------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Quran      | `/quran`            | `/quran/[surah]`, `#ayah-N`, `?tafsir=N`                                         | search text, page-jump field, playback and reading position                                     |
| Athkar     | `/athkar` (morning) | `/athkar/evening`                                                                | counters, «الفضل» expansions                                                                    |
| Rates      | `/rates`            | `?from=&to=&basis=&market=` once the member changes them                         | amount, grams, open select, country-derived defaults                                            |
| Scan       | `/scan`             | — (a scanned certificate links to `/verify/[CODE]`)                              | camera state, scan result, torch, device usage count                                            |
| Verify     | `/verify`           | `/verify/[CODE]`                                                                 | form text, busy, copied, a rate-limited outcome                                                 |
| News       | `/news`             | `?q=&category=&date=&view=public`                                                | suggestions, auth prompt, a per-story page (none exists; sources link off-site and rows expire) |
| Notes      | `/notes`            | `?note=<id>` (already)                                                           | search, composer, editor draft, delete confirm                                                  |
| Spendtrack | `/spendtrack`       | `/spendtrack/categories`, `?range=&categories=&sort=&search=&from=&to=&create=1` | dialogs and forms                                                                               |
| HabitFlow  | `/habitflow`        | `?date=YYYY-MM-DD`                                                               | edit modal, notes dialog, forms                                                                 |
| LinkSnap   | `/linksnap`         | `/linksnap/unlock/[CODE]`, `?error=&code=`                                       | shortener success and QR panel, form fields                                                     |
| MCP guide  | `/mcp/guide`        | section anchors (`#install`, `#connect`, …)                                      | copy feedback                                                                                   |

Four exceptions are deliberate, and each has a reason the rule cannot overrule:

1. **The scan result is device-only.** It exists because a camera saw a code, the
   card is rendered `ssr: false`, and re-opening it from a URL would bypass the
   device's usage count. A scanned certificate already has a shareable form:
   `/verify/<code>`.
2. **Playback and reading position are continuous, not views.** An audio element
   over an external store has no meaningful URL, and the reader's position is
   device state (IndexedDB) that the server cannot resolve.
3. **A note is resolved by the local store, not the server.** `?note=` is kept in
   its existing query form because the id is client-minted and only meaningful in
   the identity namespace that created it; a path segment would imply a server
   resource that does not exist.
4. **News has no story page to address.** Sources link off-site and the digest
   expires after seven days; inventing a per-story URL would address data that
   is gone tomorrow.

## Consequences

- The eleven roots stay real routes and keep their metadata, sitemap entries and
  offline documents. The homepage strip links to them; it does not replace them.
- A drill-down is a route, so Back, refresh and sharing are the platform's, not
  code the product has to write.
- `?tafsir`, `/athkar/evening`, `?date` and the guide's anchors are the only new
  addressable states in the first release; the rest already existed.
- Modals that become the main view (the note editor, an expense editor) stay
  overlays: their content belongs to a row the list already links to, and a URL
  for a dialog is a URL for the list behind it.

## Related

- [ADR-0146](0146-the-homepage-is-the-app-door.md) — the door these views open
  inside.
