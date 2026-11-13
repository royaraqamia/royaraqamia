# A content surface ships as the document

Measured on 2026-11-13: `docs/mobile/parity-plan.json` listed 39 surfaces, 19 native, 15 `todo`
and 5 `blocked`. Every one of the remaining routes opened the live site inside the shell, so the
APK matched the web exactly — and still read as an unfinished app, because the list had no way to say
"this one is finished" about a surface that will never be drawn in Kotlin.

The cost side is not a guess either. One port is around a dozen Kotlin files, its state and copy
sources, a visual contract, a JVM visual test and a recorded baseline; `/rates` is thirteen files and
five tests on its own, and the surface is a board and two counters. At that price a `todo` row is a
commitment of two to three days, and a fifteen-row list is a quarter of work that has to be defended
against the site moving underneath it.

## The decision

- **`document` becomes a fourth state, and it means finished.** A row that says `document` carries a
  `why`, and `check:plan` refuses one without it. A port with no reason is indistinguishable from a
  port nobody has got to, which is what made the board read as debt.
- **Four surfaces are `document` by decision**, not by remaining work: `marketing` (`/pricing`,
  `/privacy`, `/security`, `/terms`, `/app-info`), `account-posts`, `mcp-guide` and `mcp-connect`.
  Each says its own reason in the plan; the shape is the same — a server-owned page, or a page whose
  entire value is a snippet or protocol the server currently accepts, with no write, store, camera or
  notification for a native copy to gain.
- **`auth` is not `document`; it is `blocked` on the cutover.** It looks like content and is not: the
  address bar is the only thing a Custom Tab can give back, and after phase 5 there is no in-app
  document to hold the session cookie. So sign-in becomes native as part of the cutover — password and
  OTP on screen, Google through a Custom Tab and the `royar://auth` return with a one-time code, and
  the Keystore session written back into the document cookie while a document is still in front. Built
  earlier, it would mean maintaining two sessions beside each other, which is the drift ADR-0117 ended;
  built later, the cutover has no session at all.
- **`account-posts` is the one `document` row with a trigger.** It is a management surface on a product
  that already has a native composer, so the page is right until posting from the phone becomes a
  first-class flow — a creator surface, draft management, or usage that shows people opening it. The
  row says that, so the next reader does not need this document to know when to revisit.
- **The plan grows a `release` list.** A surface row cannot hold the WebView cutover, a diagnostics
  screen, the FCM matrix or a budget nobody has measured, so "ready" was four numbers in four
  documents. The plan now carries them, each `done` with its evidence or `open` with what closes it,
  and `check:plan` refuses a ticked item with no evidence.

`docs/mobile/screens.json` still answers per surface, and `document` is not an `enabled: false` port:
the row's `native` stays `null`, because there is no screen and no baseline to keep.

## A tab cannot be a document

The homepage is the app door (ADR-0146): the nine apps the sheet offers are drawn as tabs under the
strip, and the selected app renders on the same page. That makes `document` unusable for any of the
nine, because a tab whose app is the page is a tab that leaves the door — it would open a WebView
inside the homepage and lose the strip the member just used.

So the door waits for its apps: `home` is `blocked` in the plan until `athkar` and `notes` are native,
since those are the two of the nine without a screen. The seven already native (`news`, `rates`,
`scan`, `quran`, `linksnap`, `habitflow`, `spendtrack`) are not enough to draw the dock the site
draws. This is the price of the tab model, and it is why the door sits in its own phase at the end of
the list rather than in "the app's core".

**`athkar` was in the `document` set for one draft of this decision and is not now.** It is static
reading, which is the argument for leaving it the page; it is also one of the nine, which is the
argument that wins. A surface that is both content and a door tab is decided by the door.

## What it costs

- **Four rows leave the queue, and the target becomes 30 of 39.** The remaining work is the five ports
  that are drawn but still behind the gate (`chats`, `account`, `account-news`, `account-blocked`,
  `community-post`), four with no screen (`mcp-apps`, `athkar`, `notifications`, `notes`), and the two
  the cutover unblocks — the door and sign-in. That is the same list it was; it is now the whole list,
  instead of the part that survived subtraction.
- **The document is still the page after the cutover, and that is a real constraint.** Phase 5
  promises an APK with no WebView. A `document` surface after that is a Custom Tab — the system
  browser, outside the app process — which keeps the page parity and costs the APK no WebView. That
  is `release.browser-surface`, and the cutover is blocked on it by design rather than by accident.
- **A `document` row is not a place to hide a screen that is merely hard.** The `why` is the review:
  a surface that needs an offline write, a camera or a push wake cannot be `document`, because those
  are the reasons the app exists ([ADR-0089](0089-the-android-app-is-native.md)).
- **The four are still listed, still routed and still checked.** `check:screens` requires a row per
  surface, `check:plan` requires a row per surface, and `docs/mobile/parity-plan.md` renders the
  reason in the line, so a reader sees "finished, here is why" instead of an empty box.

## Why not the alternatives

- **Port them anyway, for the "100%".** The five static pages and the two MCP setup pages would then
  age in the APK between releases: a terms correction, a policy reword or a moved snippet becomes an
  emergency release. That is the cadence problem `native-app.md` phase 4 already names, paid for a
  surface with no interaction to improve.
- **Delete the rows.** `check:screens` and `check:plan` both exist because a surface that is not
  written down becomes a discovery on a device. The row stays; the decision is what becomes explicit.
- **Leave them `todo` and "get to them".** This is what the board did for a month, and it is what
  made fifteen rows look like fifteen unfinished screens when four of them were never going to be
  drawn.
- **Call the whole app done because the document matches the web.** The APK is 100% parity today and
  still not finished: it ships a Capacitor bridge, a WebView and a set of screens it cannot draw
  itself. `release` is where that half now lives, so "matches the web" and "ready to ship" stop being
  the same sentence.
