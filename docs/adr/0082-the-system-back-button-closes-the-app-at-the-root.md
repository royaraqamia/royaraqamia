# The system back button closes the app at the root

Nothing could leave the Android shell with Back. Capacitor's App plugin owns the press (`AppPlugin`,
`EVENT_BACK_BUTTON`): with no `backButton` listener in the page it calls `WebView.canGoBack()` and
`goBack()`, and when the history is exhausted it returns without doing anything. The press is consumed
either way, so the activity is never finished and the last press does nothing at all — the site had a
back control on screen, and the system press had no end.

`MainActivity.installBackExit()` now answers the press itself. The order is the mechanism: the plugin
registers its callback while the bridge is built, inside `super.onCreate`, and
`OnBackPressedDispatcher` offers a press to the most recently added enabled callback first, so a
callback installed after `super.onCreate` receives it. It keeps the navigation the plugin did —
`canGoBack()` then `goBack()` — and replaces only the dead end with `finish()`, which is what Android's
own root back press does: the task leaves the foreground and its only activity is gone.

## Considered options

- **The page registers `App.addListener('backButton')` and calls `App.exitApp()` at the root.** Rejected:
  it is the shape Android documents, but it makes every press depend on the Capacitor bridge being
  injected into a remote document — the channel ADR-0043 measured failing on some launches of a build.
  A press that cannot be delivered would leave Back doing nothing, which is the defect, and no page code
  listens for the event today.
- **Ask the document whether it has same-document history, through `window.navigation.canGoBack`, and
  walk it with `history.back()`.** Built and measured on `Roy_API_35` (System WebView 124.0.6367.219):
  after following a link from `/` to `/news` the document reports `history.length === 2` and
  `canGoBack === true`, the WebView reports `canGoBack() === false`, and
  `Page.getNavigationHistory` holds **one** entry. Pressing back from the second document entry walked
  to the first and then stopped: the entry the browser had pruned cannot be traversed to, so the probe
  answered "moved" while nothing moved. Rejected: it adds a round trip and a stuck state for behaviour
  the WebView either already carries or cannot be made to carry from outside it.
- **Double-press to exit, or `moveTaskToBack`.** Rejected: both are conventions the app does not use
  anywhere else, and finishing the task is what the platform does at the root. `moveTaskToBack` would
  also leave a task in Recents that Back can never remove.
- **Leave `disableBackButtonHandler` on and take the WebView's navigation only.** Rejected: that
  removes the plugin's handler and gets the system's default `finish()` — but it would also take away
  the plugin's `backButton` event for good, and the plugin's callback also exists to route the press to
  a page that has asked for it.

## Consequences

- The press no longer fires Capacitor's `backButton` event. Nothing listens for it: the shell answers
  back in native code, and a page-level answer would be a channel ADR-0043 already gave up on.
- "The end" is the WebView's history, and that is version-dependent. On a System WebView that carries
  the site's client-side navigations — the behaviour reported on the device that raised this, where Back
  walked the site page by page and then stopped on the home page — Back walks them as it always did and
  only the last press closes. On one that drops same-document entries — measured: 124 — the WebView
  cannot walk the document's own history, so Back ends the task from the page it cannot walk; the site's
  back control (`frontend/ui/shared/back-button.tsx`) remains the in-app way up there. Nothing in the
  shell can tell the two apart: the page is the only tier that knows, and it is not a channel this
  decision trusts.
- It is a native change, so it reaches an installed app as an APK (`android/**` moves the shell counter,
  ADR-0043) and not on a web deploy. `docs/mobile/android-shell.md` records the mechanism, the
  measurement and the two-branch check.
- There is no JVM test: the behaviour is the Android dispatcher's and the WebView's, so it was measured
  on the emulator instead — the same treatment the splash and the system-bar band get.
