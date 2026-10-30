# The shell launches, and the document is a destination behind it

[#647](https://github.com/royaraqamia/royaraqamia/issues/647) makes the app's own Compose shell the
launcher, but not one of the three primary destinations is native yet: home and community are
[#658](../mobile/screens.md), the account pages are [#657](https://github.com/royaraqamia/royaraqamia/issues/657),
and the tab bar's three routes are web surfaces until those land. ADR-0089 requires a single activity
and rejects "native chrome only, WebView per screen" as the end state, so the slice cannot simply
draw chrome around the document.

Something has to be true of the first frame in the meantime. This records what it is.

## The decision

- **The native shell is the launcher.** The splash theme hands over to a Compose frame that is the
  app's own: the token theme, RTL at the root, the top bar, the three destinations and the services
  menu. No WebView is constructed to draw it. The 400 ms budget is measured to _that_ frame.
- **A destination whose surface is still the document hands over.** Tapping a tab, a services entry
  or arriving on a deep link whose route has no native screen starts the existing Capacitor activity
  at that exact route, on our own origin. The handoff is a normal activity transition in the shell's
  own task; back from it returns to the shell. The route model in `shell/` (the site's own
  `route-kind.ts` grammar, its deep-link rewrites and the back rule) is what decides both.
- **The handoff is one line per destination, and it is deleted by the surface port.** It is keyed by
  the inventory that already exists: when a surface becomes a `*Screen.kt`, its row in
  `docs/mobile/screens.json` changes and its delegation is removed in the same pull request.
- **The last WebView leaves with [#662](https://github.com/royaraqamia/royaraqamia/issues/662).** The
  Capacitor activity, the handoff calls and the remaining plugin wiring are that ticket's retirement
  list, not a second decision.

## What this costs, stated rather than hidden

- **Two activities in one task, for a while.** A web-backed destination is a visible activity
  transition after the frame instead of a screen. That is a downgrade in motion, not in content: the
  documented budget is the app's own frame, and the document's load is exactly what the shell costs
  today.
- **#647's last criterion stays open on purpose.** "No WebView is instantiated at launch" is asserted
  of the launcher (`ShellActivity`'s tree contains none) and only becomes true of the process when the
  handoff is gone — which is #662's first criterion. Ticking it here would be a claim about a tree
  that no longer exists by the time the home tab is drawn.
- **Two navigation implementations until the cutover.** The web surface keeps its own history and its
  own back control inside the document; the shell owns the back gesture between destinations. That is
  the same seam as the two clients themselves, and it closes with the WebView.

## Why not the alternatives

- **A placeholder body per tab.** "No skeleton, no fallback page" is the slice's own wording, and a
  tab whose body says "coming soon" is a fallback page with a hole in it. The handoff shows the
  surface the user asked for.
- **Ship the shell behind a debug build until #662.** It proves nothing about the shipping launch —
  the number being defended is a cold start a user experiences, in an APK they installed through the
  update channel.
- **`android:process=":web"` to keep the launch process free of the engine.** It would make the
  criterion literally true, and it would also move the bridge, the plugins and every callback across a
  process boundary in a cutover that is already scheduled. Not worth a seam that is deleted within
  the same phase.
- **Wait for #657/#658 before the launcher moves.** The shell is what those ports land in; porting a
  screen into an app that has no navigation is the wrong order.
