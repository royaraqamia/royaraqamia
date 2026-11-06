# The update card is the app's alone

[#652](https://github.com/royaraqamia/royaraqamia/issues/652) moves the shell's update prompt into
the app's own Compose frame. The check, the download, the verification and the in-place install
survive as they were ([ADR-0043](0043-the-shell-versions-itself-and-announces-it.md),
[ADR-0044](0044-the-shell-installs-its-own-update.md)); what moved is the
announcement, and moving it raised three questions that a port does not usually raise.

## The decision

- **The card is Compose, and the shell draws it.** `ShellActivity` owns a
  `ShellUpdateController`: the six-hourly check, the download, the install and the one value the
  frame draws. The Java `Dialog` inflated from `res/layout/dialog_shell_update*.xml`, its two
  layouts, its style, its three drawables and its animation are gone.
- **The decision is a pure function.** `ShellUpdateDecision.cardFor(status, floor, debug)` answers
  "which card, if any" from the manifest answer and the floor, and is tested on the JVM beside
  `ShellUpdateTest`'s cases. Everything else in the path is a read or a view.
- **The card says what the release carries.** `latest.json`'s `notes` — the Arabic sentence the
  release train writes for a user ([ADR-0090](0090-the-web-has-no-releases-and-the-shell-ships-weekly.md))
  — is drawn under the version range and the size. Before this the card said only that something
  existed.
- **A build below the floor never reaches the document.** Every owned route answers `426` to such a
  build, so handing a destination over produces a screen that refuses everything. The blocking card
  is the honest screen instead, and `ShellActivity.handOver` refuses while it stands.
- **A `426` from anywhere becomes that card.** The native screens parse the typed body
  (`ShellUpdateRequired`) and publish its floor to `ShellUpdateChannel`; the document's
  `RoyShellUpdate.required()` bridge publishes the same number and brings the shell forward, which
  finishes the document on the way. The manifest is re-read at once, because a floor with no
  manifest behind it is a card with nothing to install.

## What this costs

- **The card has no parity row, and the exemption is the hole.** `check:parity` exists so a ported
  component cannot drift from the one the site draws. This card has no such counterpart by
  construction: the site never offers an APK install - a web deploy alone never prompts
  ([ADR-0042](0042-a-waiting-build-is-announced.md), superseded by
  [ADR-0134](0134-a-waiting-build-is-taken-on-load.md)) - so there is no second client to hold the same
  words. It is listed under `exempt` in `docs/mobile/parity.json`, with that reason, and its copy
  lives in `res/values/strings.xml`: one client, one source. The exemption is honest but it is a
  gap in the net, and it is the only one.
- **While the document is on top, an offer is behind it.** The card belongs to the shell's window,
  so an offer that arrives while a web surface is open is seen when the user comes back to the
  frame. The floor case does not have this hole: it blocks the hand-over, and a floor that arrives
  late either closes the document through the bridge or is waiting when the user returns.
  _Amended by [ADR-0117](0117-the-document-is-the-app-until-a-port-is-the-same-screen.md): the frame
  is brought forward when an offer arrives, so the document no longer hides it._
- **Two activities still race the check.** A cold launch hands a web-backed destination over before
  the manifest has answered, which is the same race `#647` left open for every other launch path.
  The `426` path is what closes it, and it closes with the WebView
  ([#662](https://github.com/royaraqamia/royaraqamia/issues/662)).

## Why not the alternatives

- **Keep the Java dialog for the document's activity.** That is what this replaces: two prompts,
  two layouts, and a card that would be drawn twice from the same answer.
- **Give the card a parity row against `frontend/ui/shared/update-prompt.tsx`.** That component was
  a different prompt about a different thing - a waiting web build and the one reload that applies
  it - so a row would assert that two unrelated sentences are the same sentence, which is worse
  than an exemption that says why. (It has since been removed: the web take is silent and has no
  words at all, ADR-0134.)
- **Block the hand-over on any pending update.** An offer is something a user may decline, and a
  declined offer that still withheld the app would be a block wearing a question's clothes. Only a
  floor is absolute, because the site itself is what refuses a build below it.
- **Let the document draw the card.** The reason the prompt was native in the first place
  ([ADR-0043](0043-the-shell-versions-itself-and-announces-it.md)): with `server.url` set, the
  Capacitor bridge reaches the document through a proxy, and on the WebViews the app still meets one
  failed proxied request takes the injected script with it.
