# The document is the app until a port is the same screen

[#647](https://github.com/royaraqamia/royaraqamia/issues/647) made the shell the launcher and drew the
app's own chrome around every destination, handing the site's surfaces to the document only when no
`*Screen.kt` existed. By 1.1.0 that had produced two designs in one app: a bare Material sign-in card
where the site has its glass one, HabitFlow and SpendTrack in the app's layout, a services sheet with
no per-row grips, and a homepage, bell, community tab and profile tab that a signed-out user could not
reach at all. A member holding the APK was looking at a product that was not this one.

## The decision

- **Every destination is the document.** `NativeSurfaces.routes` is empty, so `handOver()` runs for
  every route - signed in or not. The frame is now a launch screen, the update card, and the hand-off;
  it is not a second design.
- **The site signs in, because the site is the app.** The native card (#770) is switched off with the
  rest: a guest sees `/auth/login`, which is the same page a browser shows, with the provider button,
  the reset link, the sign-up link and the card the site actually draws. A native screen's guest
  prompt (`showSignIn`) opens that page rather than a form of its own.
- **A port is listed before it is drawn.** `docs/mobile/screens.json` gained a third state:
  `"enabled": false` beside `native`, with a reason. `docs/mobile/screens.md` renders it as
  `(off)`, so the table cannot claim the app draws a screen it hands over. A route returns to
  `NativeSurfaces` in the same change that flips its row on, which is also the change that has to
  show it is the same screen.
- **The gate is a comparison, not an opinion.** A port is switched on when its composed screen and the
  page's own rendering of the same route, at the same phone viewport, differ by nothing a user could
  see. Until that check exists and passes, the answer is the document - the honest state is also the
  safe one.
- **The update card survives the hand-over.** An offer that arrives while the document is open brings
  the frame forward (`startActivity` with `CLEAR_TOP|SINGLE_TOP`, the same move `MainActivity` uses for
  a `426`), and answering it hands the destination back. This closes the cost
  [ADR-0114](0114-the-update-card-is-the-apps-alone.md) recorded as "while the document is on top, an
  offer is behind it": an app that cannot announce an APK is an app that never leaves 1.1.x.
- **Back out of the document leaves the app.** The document is launched for result, so the press that
  finishes it at the site's root finishes the launcher too (ADR-0082) instead of revealing a frame
  with nothing in it.

## What this costs

- **The WebView stays, for now.** [#662](https://github.com/royaraqamia/royaraqamia/issues/662) said
  the APK contains no WebView; it cannot, while the app is the site. This is a deliberate reversal of
  the direction, not an oversight, and it is the owner's call recorded here.
- **The native session and its background work go quiet.** The Kotlin session is only minted by the
  native sign-in card, so a signed-out-or-web-signed-in install has no native identity: the shell's
  bell count, hidden-services read and Outbox drain have nothing to work on. Nothing native writes
  today, so nothing is stranded; a port that needs the session has to bring its sign-in path back with
  it, through the same site.
- **Two activities still race the launch.** A cold launch draws the frame, hands over, and brings the
  frame forward again if a card was already waiting. It is one extra window transition, and it
  disappears when the card can be drawn in the document.
- **`docs/mobile/screens.md` is mostly `_web only_` again, and that is the truth.** The ports are
  still in the tree, still unit-tested, and still the subjects of their parity rows - switched off is
  not deleted.

## Why not the alternatives

- **Keep the ports enabled and fix them one at a time.** That is what 1.1.0 did, and it shipped the
  mismatch the user reported. A screen that is roughly right is a screen a user reads as broken; the
  document is exactly right.
- **Delete the ports.** They are the work that makes the app native, with tests and generated copy;
  discarding them would make the next attempt start from zero. A flag says "not yet", which is the
  fact.
- **Make `MainActivity` the launcher again.** The launcher owns the splash and the update card. Moving
  the launcher back would take both with it, and the card is what keeps installed builds moving.
- **Port the site's chrome into the frame and keep native screens.** Right direction for a later
  change - the frame's bar and tabs are the site's `TopNav`/`BottomTabBar` only by name - but it does
  not fix the surfaces themselves, and it is a second large change to review.
