# The shell versions itself, and says so natively

ADR-0042 gave the web build a way to announce itself. It did nothing for the other half of the install:
the Android shell is a remote-URL app (ADR-0036), so the page it renders updates the way the site does
while the **installed APK never moves on its own** — not on a deploy, not on a relaunch, and there is no
store to update it from. A user behind on the shell is behind forever until they happen to install a
newer APK, and nothing ever told them one existed.

Two things had to be true before that could change, and one of them was already wrong.

**The shell needed its own version, and it did not have one.** `versionCode` came from
`package.json#version` (a major/minor/patch mapping), so every web release moved it: to any update
check, a deploy looked exactly like a new APK. It is now `android/shell-version.properties`, a counter
that moves only when `android/**`, `capacitor.config.ts`, or a Capacitor plugin dependency changes —
which is what "a new APK exists" means. The first emulator drill then found the second half of the
problem: the device had `1.88.4` installed at `versionCode` 18804, derived from the old scheme, and
Android refuses to install anything below it (`INSTALL_FAILED_VERSION_DOWNGRADE`). So the counter starts
at **20000** — above every code the old scheme could produce for a 1.x release — and the two schemes
never need to agree again.

**The published artifact needed a name to compare against.** `public/android/latest.json` is that name,
beside the site, on the origin the shell already trusts: `versionCode`, `versionName`, `apkUrl`,
`sha256`, `minSupportedVersionCode`, `notes`. A manifest that is missing, half-written, names a lower
code than the installed shell, or names a URL that is not a network download does nothing at all:
silence is the safe failure, never a prompt for an APK nobody published.

**The announcement is native, and that is the decision the drill made.** It was built the other way
first, because the page is the better place for it — same fonts, same RTL layout of the site's own
prompt, one prompt in total — as a local Capacitor plugin registered in `MainActivity`, read through
`window.Capacitor.Plugins.ShellUpdater`. The emulator answered it. With `server.url` set, Capacitor
reaches the document through a proxy, and on the WebView this app still meets on older devices (83 on
the API 30 image) a proxied request that fails takes the injected script with it: the first launch of
that build had no `window.Capacitor` at all, and the next one had it, which is exactly the problem — a
channel that works on some launches and not others, on the devices least likely to have been updated,
is not a channel. So `ShellUpdatePrompt` is an `AlertDialog`: it checks at most every six hours and on a
fresh launch, asks with two buttons, and opens the published APK. Platform UI, on every WebView, with
nothing to be absent.

_Amended by ADR-0054._ The decision above is untouched — the announcement is still native, still asks at
most every six hours and on a fresh launch, and the page still stays quiet while it is pending. What
changed is the _presentation_: it is no longer the platform's `AlertDialog` but a card laid out and
painted from this product's own tokens, and the shell no longer takes its light/dark or its direction
from the phone.

The page's half is only _not to double up_. It can see which shell it is in from its own user agent —
`MainActivity` appends `RoyaraqamiaShell/20000`, a token every document can read — and compares that
with the manifest from its own origin. While the shell's offer is pending, the site's own prompt stays
down (ADR-0042), so the two channels never speak at once. Absent token (a browser, or a shell built
before this) reads as "no shell update", which leaves the web prompt working everywhere else.

A shell the manifest marks `minSupportedVersionCode` above the installed one is the one case with
nothing to decline: the dialog has no «لاحقًا» and does not dismiss. Nothing sets that field yet; it
exists so the failure mode of a breaking change is a blocking prompt instead of a broken screen.

## Considered Options

- **A local Capacitor plugin, so the page renders the prompt (what was built first).** Rejected by the
  device: see above. Worth recording that it failed _silently_ in the most literal sense — the page's
  guard treats a missing bridge as "no shell update pending", so nothing looked wrong from either side
  until the drill read the WebView's own DOM.
- **A synchronous flag injected by the shell (`window.__royaraqamiaShell`, ADR-0042's draft).** Rejected
  for the same reason plus one more: injection reaches the document by the same proxy path that failed,
  and a flag can only carry the answer the shell had at injection time, while the answer arrives over
  the network.
- **The page opening the APK through a custom scheme (`royar://update/install`).** Rejected: a custom
  scheme navigation from inside the WebView lands as an intent the WebView cannot consume, so the page
  would either be replaced by an error page or need `shouldOverrideUrlLoading` wrapped around
  Capacitor's own client. A native dialog needs neither, and the install is the part the platform owns
  anyway.
- **Deriving `versionCode` from the site version and comparing that.** Rejected: it is what the field
  did before this decision, and it makes every deploy look like a new APK.
- **Handing the APK to the system installer in this change.** Deliberately not yet: it needs
  `REQUEST_INSTALL_PACKAGES`, the "install unknown apps" flow, a download verified against `sha256`, and
  a device to prove the result on. The dialog opens the published APK instead, and the manifest already
  carries the fields the install would need.
- **Publishing the APK from CI.** Not yet: the upload keystore is the one credential that must never be
  lost (docs/mobile/android-shell.md), and putting it in a second place is a decision about where the
  backup lives. Until then, publishing is `npm run android:release` plus attaching the file to the
  release named by `apkUrl`, and the manifest's own test refuses a manifest that names an APK newer than
  the counter in the tree.

## Consequences

`npm run android:test` runs the shell's update decision on the JVM — the manifest URL, a newer code, the
installed code, a withdrawn release, a bare manifest, an unsupported shell, and which URLs may be opened
— so the arithmetic that decides what a user is told is not something to discover on a device. The page's
half is covered by its own unit tests (the user-agent token, the comparison, a missing or unreadable
manifest) and by an e2e case that stands a shell up as a user agent and a routed manifest and checks the
page keeps its offer to itself.

`npm run android:shell-version -- --check <ref>` fails a pull request that changed the shell without
bumping the counter, and `.github/workflows/shell-version.yml` runs it on every pull request. The
detector has the same shape as the migration gate (ADR-0040): it cannot see everything — a dependency
whose native side changes without a version bump in `package.json` is invisible — but the case it can see
is the one that decays silently.

The user-agent token is a contract between the native shell and the site, and it is one-sided: a shell
that does not send it is simply not recognised, which is why an old shell keeps the web prompt and stays
quiet about APKs. That is inherent — the thing that announces updates has to arrive in an update.

## Amendment (2026-10-28): `versionCode` carries the UI

The counter used to carry the shell's own code, because the UI arrived over the network on every
launch. With [ADR-0088](0088-the-app-bundles-the-surfaces-whose-rows-are-local.md) the owned surfaces
ship inside the APK, so a `versionCode` now carries their UI too: a bundled route changes only when a
new build is installed (ADR-0044's in-place path, #503's channel), while a web deploy still reaches
the remote surfaces as before. The user-agent token and the "an old shell keeps the web prompt"
property are unchanged — that is still how the site knows which build it is talking to.

## Amendment (2026-10-30): every screen, a floor and a staged rollout (#503)

The 2026-10-28 amendment made the counter carry the bundled surfaces. With
[ADR-0089](0089-the-android-app-is-native.md) that is now the whole app: a copy fix, a list fix and a
rate table all reach a device only through an APK. The counter's trigger is therefore not "the shell
changed" but "the app changed" — every Kotlin/Compose source, the generated theme and the generated
contract types included — and a pull request that changes one of them is a release without a bump
(the weekly train writes the bump; the pull request carries the Arabic note).

Three things make that safe to operate:

- **A supported floor enforced by the server.** `public/android/latest.json`'s
  `minSupportedVersionCode` is read by the running server, and an owned `/api/*` request from a shell
  below it is answered `426` with a typed body (`code: "app_update_required"`,
  `minimumVersionCode`). `/api/version` and `/api/app-perf` stay open so a build that is failing can
  say so. The page hands the floor to the native card through `RoyShellUpdate.required()`; the card
  is the same blocking one a manifest floor already produces, not a crash or a blank screen. A browser
  never sends a counter, so the web is never refused.
- **A staged rollout.** The manifest may carry `rollout`, an integer percentage from 0 to 100,
  defaulting to 100. The app buckets a device by `Android ID + versionCode` with plain FNV-1a
  arithmetic, so the same device gets the same answer for a release and a later release is a fresh
  cohort. The page cannot know the device's bucket, so it does not claim a partial release at all
  (the native prompt is the only channel that does). A floor is absolute and ignores the percentage:
  below it, the update is not optional.
- **The trade in the copy.** The dialog now says that an app update carries interface fixes and that
  a web deploy no longer reaches the app, so a user is told why the update is not just a browser
  refresh.

The frozen old shell keeps working until the floor moves past it; raising the floor is a deliberate
publish, and that is what retires it. The web and the app still share one contract and one token file,
and neither is a release of the other.
