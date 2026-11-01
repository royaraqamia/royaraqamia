# Android shell (APK / AAB)

The site ships as an Android app through Capacitor, in one of two shapes. The shape that ships
today is a **remote-URL shell**: the WebView loads `https://royaraqamia.com` instead of bundling a
static export of it. The second shape, decided and proven by the #500 spike, is a **bundled**
document on `https://localhost/` for the surfaces whose rows live in the Local Store, with the live
site kept as the remote surface ([ADR-0088](../adr/0088-the-app-bundles-the-surfaces-whose-rows-are-local.md),
[two-origin-spike.md](two-origin-spike.md)); it lands as #502/#503.

A static export of the _whole_ site is still impossible, which is why the split is by data owner
rather than everything-or-nothing. Every remote surface is server-rendered, uses Server Actions, and
authenticates with Supabase cookies (`controller → service → repository`); `next export` produces
nothing that runs. Bundling them would also move pages onto a `https://localhost` origin, where our
own CSP (`default-src 'self'`), Supabase cookie auth and the offline-first service worker
(ADR-0027…0030) all stop matching. The reasoning, and what it costs, is ADR-0036, amended by
ADR-0088.

> **Direction (ADR-0089).** The app is becoming a native Jetpack Compose application, and the
> WebView shell described on this page is what ships until the update floor moves past it. The
> decision and what it costs are [ADR-0089](../adr/0089-the-android-app-is-native.md); the order of
> work is [native-app.md](native-app.md). This page stays the runbook for the shell while it exists,
> and its measurements are the baseline the native app has to beat.
>
> **Since #647 the launcher is the app's own.** `com.royaraqamia.app.shell.ShellActivity` draws the
> first Compose frame — the token theme, RTL, the tab bar — and then hands the route to
> `MainActivity`, which is now the document as a destination rather than the app. The splash is
> installed by the shell, the deep-link filters are declared on it, and `MainActivity` keeps no
> splash of its own ([ADR-0105](../adr/0105-the-shell-launches-and-the-document-is-a-destination.md)).
> A manual launch for a runbook step therefore starts `.shell.ShellActivity`; starting
> `.MainActivity` directly still opens the document, which is what the shell drills used to drive
> (`npm run android:drill` is retired with the WebView drain, [#651](https://github.com/royaraqamia/royaraqamia/issues/651)).

## Prerequisites

| Thing           | Where                                                          | Notes                                                                                                                                                |
| --------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android SDK     | `ANDROID_HOME`                                                 | Needs `platforms;android-36` and `build-tools;36.x` — both installed.                                                                                |
| JDK 21          | any JDK 21 on the machine                                      | AGP 8.13 does **not** run on JDK 25, which is this machine's `JAVA_HOME`. `scripts/android.mjs` finds a 21 itself; override with `ANDROID_JDK_HOME`. |
| Upload keystore | `D:\Projects\royaraqamia-android-keys\royaraqamia-release.jks` | Outside the repo. Referenced by the git-ignored `keystore.properties`.                                                                               |

Nothing is installed by the build: no Android Studio, no extra SDK packages.

> **Back up the keystore and its password.** `D:\Projects\royaraqamia-android-keys` and the
> password in `keystore.properties` are the only copy. Lose them and no future release can
> update the installed app — Android requires the same signing key forever. Move both into a
> password manager.

## Commands

```powershell
npm run android:sync      # cap sync android — copies config + native plugin list
npm run android:assets    # regenerate the launcher icon from public/icons (after `npm run icons`)
npm run android:apk       # debug APK   → android/app/build/outputs/apk/debug/app-debug.apk
npm run android:release   # signed APK  → android/app/build/outputs/apk/release/app-release.apk
npm run android:aab       # signed AAB  → android/app/build/outputs/bundle/release/app-release.aab
npm run android:publish   # the release APK + public/android/latest.json, stamped from the file (ADR-0044)
npm run android:test      # the shell's JVM tests: the update decision and the download (ADR-0043, ADR-0044)
npm run android:verify-bridge   # on a connected device: is the native bridge live?
```

**A release build cannot be inspected.** `capacitor.config.ts` opens the WebView to `chrome://inspect`
whenever `NODE_ENV` is not `production`, which is what a developer wants from `android:apk`.
`android:release`, `android:aab` and `android:publish` force `NODE_ENV=production` for `cap sync` and
then read the generated `android/app/src/main/assets/capacitor.config.json` back
(`scripts/android-config-guard.mjs`): a config that still enables `webContentsDebuggingEnabled` stops
the build before Gradle signs anything (issue #398). The generated file is what the APK bundles, so a
`cap sync` run by hand cannot leak inspection into a release, and the debug build keeps it.

**A release build is minified** ([ADR-0094](../adr/0094-the-release-build-is-minified.md)): R8 renames
what the app reaches from code and keeps what Capacitor's plugin list and the merged manifest name, so
the APK is 11.4 MiB rather than 21.7 MiB with Compose. A stack trace from a released shell is only
readable beside `android/app/build/outputs/mapping/release/mapping.txt` from the same build; the file
is not committed, and nothing uploads it yet.

The launcher icon is generated from `public/icons/icon-maskable-1024x1024.png`, the
same artwork the PWA ships, so the two installs look like one product: one purple, one logo.
That is the PWA's _full-bleed_ tile — the layer an adaptive icon is cut from — rather than its
`any` icon, which is circle-cropped for the desktop install UI (below).
How large the logo _reads_ is a chosen number, `TARGET_DISC_RATIO` (0.64) — the middle the owner
picked after being shown the two extremes on the emulator: 76% with the artwork drawn across the
adaptive canvas, 52% inset to the 72dp safe zone. The extremes exist because the launcher draws
the adaptive canvas's visible centre magnified, measured at **1.47x** on the API 30 Pixel
Launcher, so that one surface divides the magnification out (`ADAPTIVE_ARTWORK_SCALE`) while the
notification icon and the legacy and round launcher icons scale the artwork
instead, cropping purple — the launch theme's icon divides the splash mask out the same way
(`SPLASH_ARTWORK_SCALE`). The PWA's own icon set keeps the artwork's 51.7%, since that is what
the installed PWA's icon is drawn from.

**Shape follows the same question: who draws the file.** A surface that draws it as it is gets the
logo's own shape — the `any` icon set and the favicons are discs with transparent corners, which is
what a desktop install UI and a browser tab render. Nothing on Windows or macOS crops a PWA icon, so
a full-bleed square there reads as a purple sticker beside icons that are not square (Telegram's disc
and Proton VPN's triangle are their files' own shapes; nothing on the desktop shaped them). A surface
that crops it gets a full-bleed square and is shaped by that crop: the maskable set (a launcher's
mask) and `apple-touch-icon` (iOS's squircle). The notification icon and the round launcher icon are
circle-cropped the same way, and the badge is the mark alone.

The one asset that does not follow the master's proportion is the **16px favicon**: at 60% its disc is
9.6px and the mark inside it lands under a pixel of stroke, so the tab reads as a smudge in a white
circle. It carries the artwork 1.3x larger — a 78% disc — and it is the only entry that does: 32, 48
and the standalone favicon PNGs stay on the master.
`scripts/generate-android-assets.mjs` does this by hand rather than through
`@capacitor/assets`, whose transitive `tar` carries a critical advisory that would fail
`security-scan.yml`'s `npm audit --audit-level=high`. It measures every asset it writes
against its surface's target and exits non-zero on a miss, and
`scripts/__tests__/icon-shape.test.mjs` holds the committed files to the same proportions in
`npm test` (`scripts/logo-shape.mjs` is the measurement both use).

The splash is the launch theme — one `AppTheme.NoActionBarLaunch` in
`android/app/src/main/res/values/styles.xml` declaring three items: `windowSplashScreenBackground`
(`@color/roy_background`, the generated token the app's own first Compose frame paints, so the
splash lifts onto that frame with no colour change), `windowSplashScreenAnimatedIcon`
(`@drawable/splash_icon`) and `postSplashScreenTheme`. Android 12+
draws that natively; `androidx.core:core-splashscreen` draws the same theme below it, which is why
the launcher, `ShellActivity`, calls `installSplashScreen()` before `super.onCreate`. Neither family
leaves a duration of ours to keep in step with a page — a fixed duration had no relationship to when
the app's own frame was ready. What the dismissal reveals is that frame. The document a destination
is handed over to keeps its own skeleton (below), and that is a later, separate transition
([ADR-0105](../adr/0105-the-shell-launches-and-the-document-is-a-destination.md)).

`@drawable/splash_icon` is **generated from the launcher artwork** at `SPLASH_ICON_DP` (288dp)
rather than being the launcher icon itself, and that difference is the one number worth knowing.
Both implementations draw the icon across an area and mask it down to a circle **two thirds** of
that area — `core-splashscreen`'s layer-list draws it at 288dp and strokes the mask in to 192dp,
and Android 12+ pairs the documented 240dp area with a 160dp visible circle — while an adaptive
drawable magnifies its canvas inside its bounds as well. Point the theme at the launcher icon and
those two magnifications multiply: measured on the API 30 emulator, its disc filled **186px of the
192px** circle (97%), the artwork full-bleed with only a thin purple rim of the tile left. The
generated icon is authored against the mask instead — the artwork at `SPLASH_ARTWORK_SCALE`
(`TARGET_DISC_RATIO / (ARTWORK_RATIO * 1.5)`, i.e. the same construction as the adaptive foreground,
one mask ratio apart) — so the disc lands on the launcher icon's own `TARGET_DISC_RATIO`. Measured
the same way it fills **122px of the 192px** circle, **63.5%**, against the launcher icon's 64.0% on
the same emulator. It is 288dp rather than 240dp so that whichever area the platform picks, the
icon is scaled down rather than up.

Before [#212](https://github.com/royaraqamia/royaraqamia/issues/212) there were two splash
implementations by OS version: the plugin's dialog on API ≤ 30, drawing `drawable/splash.xml` (a
layer-list over a 96dp `splash_logo.png`) for `launchShowDuration: 1200`, and the platform splash
on 31+, which ignores all of it. The plugin's drawable was handed to `setBackground`
(`SplashScreen.java`), so a bitmap was stretched to fill and `androidScaleType` never applied — our
1:2 frames came out 190x180px on the API 30 emulator — and the two families showed different
sizes, 96dp against 160dp. The plugin, its config, its layer-list and its colour file are gone;
`scripts/__tests__/icon-shape.test.mjs` fails if any of them returns.

### The launch skeleton

Between the splash and the document sits `res/layout/shell_skeleton.xml` (#498, ADR-0061): the site's
own chrome — the top bar with the wordmark, three card placeholders and the bottom tab bar — drawn in
the window's `#0f172a` and two slate steps, so a cold start reads as content arriving rather than as a
splash followed by an empty surface. It is a view of `MainActivity`, not part of the launch theme, and
that is the one structural thing about it worth knowing: the theme cannot hold it.
`windowSplashScreenBackground` is a colour attribute, and the one drawable the splash accepts,
`windowSplashScreenAnimatedIcon`, is masked to a circle two thirds of the area it is drawn in and sized
by the platform (288dp on `core-splashscreen`, 240dp on Android 12+). So the surfaces are _sequenced_
instead: the theme's wordmark for the first frame, the skeleton for as long as the WebView takes, then
the document.

`MainActivity` does **not** hold the splash on a condition, and that is the one thing in this section
that was measured rather than designed. #498 asked for `setKeepOnScreenCondition { !pageCommitted }`;
on the API 35 emulator the condition is read once and never again, so a cold launch showed **7.5
seconds of splash** before the page committed — and with the radio off it would never lift at all.
`SplashScreen` polls the condition from a pre-draw listener on the activity's decor view, and the
platform neither traverses nor draws a window sitting behind its starting surface, so a condition that
is true in the first frame is never asked again. The platform's own dismissal is already the right
edge — it is the first frame the app draws, and the skeleton is in it — so the view is added in
`onCreate` and the splash lifts into it.

The skeleton is then released by the WebView's `onPageCommitVisible` — Capacitor's
`BridgeWebViewClient` forwards it to the `WebViewListener` registered in `onCreate`, with `about:`
documents ignored because they commit before the site's own frame — and by a **2.5 s ceiling**, so a
launch with the radio off lands on the WebView's own surface (the site's cached shell, or
`unavailable.html`) rather than on a forever skeleton. Both paths run through one method, so they
cannot both act. The listener removes itself through `view.post`, not inline: the callback runs inside
the bridge's own iteration over its listener list, and removing it there throws
`ConcurrentModificationException` — the first commit crashed the app on the emulator with exactly that
stack, which is why the removal is deferred.

Two things it deliberately does not do. It is stateless: no request, no storage, no bridge call, so
there is nothing to keep in sync with a deploy and nothing to ship out of band (ADR-0061). And it is
out of the accessibility tree (`IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS`): the shapes say
nothing, and a screen reader that read them would read placeholders as the app.

Its proportions are the site's, from `frontend/ui/Navbar.tsx` and
`frontend/ui/navbar/BottomTabBar.tsx`, and they are restated here so a chrome change has one place to
be compared against:

| Part            | On the site                           | Skeleton             |
| --------------- | ------------------------------------- | -------------------- |
| Top bar         | `h-16` (64dp), `lg:h-20` on `lg`      | 64dp                 |
| Wordmark        | `TopNav.tsx`, `h-8 w-8`               | 32dp disc            |
| خدماتنا pill    | `NavDropdown` link, centred           | 88 x 32dp pill       |
| Notice bell     | `TopNav.tsx`, inline-end              | 24dp disc            |
| Bottom tab bar  | `BottomTabBar.tsx`, `min-h-14` (56dp) | 56dp, hairline above |
| Tab slots       | `TABS` — home, community, account     | 3, equal             |
| Tab icon, label | `h-5 w-5`, then an 11px label         | 20dp disc, 36 x 8dp  |
| Card            | `rounded-xl` card, `px-4` gutter      | 12dp radius, 16dp    |

The tab bar has **three** slots, not the five #498's body guessed: `BottomTabBar` renders the three
primary routes, and the secondary entries moved into the top bar's `خدماتنا` menu (#277).

Measured on the API 35 emulator, one cold launch per width, `wm density 160` (so 1dp is 1px) and the
skeleton read out of `adb shell screencap`:

| Width | Card row              | Card (gutter each side) | Top bar band | Tab bar         |
| ----- | --------------------- | ----------------------- | ------------ | --------------- |
| 320px | 80dp tall, 12dp apart | 288px (16px)            | 32dp         | 56dp + 1dp line |
| 375px | 80dp tall, 12dp apart | 343px (16px)            | 32dp         | 56dp + 1dp line |
| 428px | 80dp tall, 12dp apart | 396px (16px)            | 32dp         | 56dp + 1dp line |

The same three frames put the 32dp wordmark at the **right** (inline-start in the RTL the root forces),
the 88dp `خدماتنا` pill at 116–203px on the 320px frame — centred to the half pixel — and the 24dp
bell at the left, at every width. The AVD's 33px display cutout sits above the bar, so the first card's
top edge lands at 113px rather than 104px on the narrowest frame; nothing in the layout depends on it.

What the four launches showed (taken with the document as the launcher, before #647):

| Launch                                                     | Screen                                                                                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold, site reachable                                       | launch-theme icon, then the skeleton, then the document — no frame between two of them that is not `#0f172a`                                   |
| Cold, server that accepts the connection and never answers | launch-theme icon, then the skeleton, then the shell's own `#0f172a` at 2.5 s after `onCreate` — the ceiling — with no splash or skeleton left |

Two defects came out of these runs and are fixed in `MainActivity`: the keep-on-screen condition that
never lifted (above), and a `ConcurrentModificationException` on the first commit, from removing the
`WebViewListener` inside the bridge's own iteration over its listener list.

`scripts/__tests__/launch-skeleton.test.mjs` holds the load-bearing pieces: the colour equality with
the document's own window, the proportions above, the absence of a keep-on-screen condition, the
commit release with its `about:` guard and deferred listener removal, and the ceiling.

### What the document costs, under the skeleton

`MainActivity.installWebViewSettings` sets one thing on the WebView (#499):
`setOffscreenPreRaster(true)`. The skeleton is a view **over** the WebView, so every frame the document
produces until the handover is produced offscreen, and without the flag the renderer waits for attach
before it rasterizes — the first frame after the skeleton would be an unpainted one. It changes no
commit time (the document is the wait, not the paint), which is why the numbers below are about the
document rather than about painting.

`cacheMode` is deliberately **not** set; it stays at the platform's `LOAD_DEFAULT`. The issue's premise
was that the WebView's own HTTP cache could become a second, unsupervised document cache, and on this
site it cannot: a document response carries

```
Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
```

with no `ETag` and no `Last-Modified`. `s-maxage` is a **shared** cache's directive, so a private cache
has no freshness lifetime for the document and has to revalidate; there is nothing it can serve the
document from without a round trip. The authenticated APIs are `no-store` at the transport
(`backend/transport/cache-policy.ts`), which `scripts/__tests__/api-cache-contract.test.ts` already
holds. `scripts/__tests__/webview-settings.test.mjs` fails if any shell source sets a cache mode.

**A launch is the network's, not a cache's.** Measured on the API 35 emulator (WebView 124.0.6367.219,
`-memory 2048`, the production origin, the `RoyLaunch` logcat lines `MainActivity` writes — timed from
`Process.getStartUptimeMillis()`, so the fork is included):

| Launch                                   | What it costs                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Cold (process dead)                      | commit 3.6–8.1 s after the fork, median ~4.5 s over 12 launches; the document itself was 28 KB over 2.8–8.9 s of network |
| Warm (process alive, activity recreated) | commit 1.0–3.0 s after `onCreate`, same document, same network                                                           |
| In-page navigation in the same WebView   | **740 ms**, 300 B transfer, answered by the worker                                                                       |

The last row is the one to keep: the worker answers an in-page navigation in three quarters of a second
with a 300-byte transfer, and it answers a launch not at all. On every launch measured — cold and warm,
twelve of them — the document reported `navigator.serviceWorker.controller === null`, a navigation entry
with `workerStart === 0`, and a 28 KB transfer. The registration is not missing: it is `activated`, and
the Cache Storage keys and the registration both survive `am force-stop`, while a
`location.assign('/quran')` in the same WebView is controlled immediately afterwards. So the WebView's
first navigation after the app starts is not worker-controlled, and **a launch is always that first
navigation**: warm as well as cold, because Capacitor destroys the WebView when the activity detaches
(`Bridge.onDetachedFromWindow`) and the next activity starts with a new one.

That is what #499's **< 300 ms warm start** needs and cannot get from this shell: a document the shell
holds locally. The WebView's own HTTP cache is not it — that is the cache the issue exists to keep out
of the document's path — and a worker cannot answer a navigation that Chrome does not route to it. The
bundled surfaces (#500, #502–#504) are that document; until they exist, the launch is a network round
trip and the skeleton is what covers it (ADR-0061). What #500 has built so far — the bundled
HabitFlow entry, the `next/*` stubs, the two crossing mechanisms, and the findings that block
promoting it — is [two-origin-spike.md](two-origin-spike.md).

**The pre-warm was built, measured and dropped.** #499 proposed holding one `WebView` in a
`MutableContextWrapper` from `Application.onCreate` and handing it to the bridge, and it was implemented
two ways here: adopted after the layout inflated (Capacitor's placeholder destroyed, its id and layout
params carried over), and with `setContentView` answering `capacitor_bridge_layout_main` itself so the
process builds one WebView rather than two. Both measured inside the noise on the emulator — seven
interleaved cold rounds each, baseline against warm: process → commit **5.10 s vs 5.02 s** median,
`onCreate` → commit **3.95 s vs 3.54 s**, individual launches scattering 3.6–11.5 s because the document
is the wait. What it does change is where the WebView's construction lands: in front of the activity's
inflation, which delays the skeleton `#498` had just added. It is not in this shell; a machine with a
cold Chromium start worth moving, or a bundled launch document, would have to show it winning first.

Two things stay from that experiment, because the measurements above are read through them: the
`RoyLaunch` lines (`onCreate`, the bridge's first commit, the skeleton's release), and
`scripts/__tests__/webview-settings.test.mjs`, which holds the rasterization flag, the absence of a cache
mode, and the fact that the commit line is logged inside the listener that releases the skeleton, after
the `about:` guard.

Install on a device or emulator:

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

Point the shell at a local dev server (an emulator reaches the host on `10.0.2.2`):

```powershell
$env:CAPACITOR_SERVER_URL = 'http://10.0.2.2:3000'; npm run android:apk
```

`versionName`/`versionCode`: both come from `android/shell-version.properties`.
`shellVersionName` is the semantic name a user reads (`1.1.0`), graded from the release batch;
`versionCode` is derived from it (`20000 + (major-1)*10000 + minor*100 + patch`) and is what the
update check compares against `public/android/latest.json`. It moves at the weekly release, not in a
pull request (ADR-0090): `node scripts/android-shell-version.mjs` reads it, `-- --bump` writes one by
hand, and `.github/workflows/shell-version.yml` fails a pull request that edits it.

`npm run android:test` runs the shell's JVM tests — the update decision and the download that verifies
what may be installed. `.github/workflows/shell-tests.yml` runs them on any pull request that touches
`android/**`, `capacitor.config.ts`, or the scripts that feed them, so they are checked where the shell
changes rather than only on the machine that wrote them.

## What the shell wires up

| Capability                                                       | Where                                                                                                              | State                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| capability                                                       | where                                                                                                              | state                                                                                                                                                                                              |
| ------------------------------------                             | -----------------------------------------------------                                                              | --------------------------------------------------------------------------------------                                                                                                             |
| Load the live site (the shipped shape)                           | `capacitor.config.ts` `server.url`                                                                                 | Working — this is still the shell that ships; the bundled shape is [ADR-0088](../adr/0088-the-app-bundles-the-surfaces-whose-rows-are-local.md) and lands as #502/#503                             |
| Load a bundled document (the bundled target)                     | `server.url` unset, Vite build in `webDir`, `MainActivity.bundledRootFor`                                          | Spike-proven (#500, [two-origin-spike.md](two-origin-spike.md)): `https://localhost/`, Back returns to it, remote surfaces reached by Custom Tab; release APK 15.4 MiB against the shell's 16.1    |
| Offline / unsupported fallback                                   | `capacitor.config.ts` `server.errorPath`, `android.minWebViewVersion`                                              | Working — a bundled page with retry or update copy (ADR-0067)                                                                                                                                      |
| Announcing web updates                                           | `frontend/ui/shared/update-prompt.tsx`                                                                             | Working — in-page, so it shows in the shell too                                                                                                                                                    |
| Announcing a new APK                                             | `ShellUpdatePrompt`, `public/android/latest.json`                                                                  | Working — a native dialog, and it installs in place (ADR-0044); `/account` re-checks on demand                                                                                                     |
| Deep links (App Links + `royar://`)                              | manifest intent filters, `MainActivity.webUrlFor`                                                                  | Working                                                                                                                                                                                            |
| Custom-scheme OAuth return                                       | manifest + `MainActivity`                                                                                          | Working — needs two Supabase allowlist entries (below)                                                                                                                                             |
| Splash (platform), launch skeleton, status bar, RTL, back button | launch theme, `res/layout/shell_skeleton.xml`, `capacitor.config.ts` plugins, `MainActivity`                       | Working — the splash lifts into the skeleton (ADR-0061, #498); Back walks the WebView's history and closes the app at the root (ADR-0082, below)                                                   |
| WebView settings                                                 | `MainActivity.installWebViewSettings`                                                                              | offscreen pre-raster on, so the skeleton lifts onto a painted document; `cacheMode` left at `LOAD_DEFAULT` (#499, "What the document costs", above)                                                |
| Native file save / share                                         | `@capacitor/filesystem`, `@capacitor/share` installed                                                              | Installed, unused by app code yet                                                                                                                                                                  |
| Biometric lock                                                   | `@capgo/capacitor-native-biometric` installed                                                                      | Installed, unused by app code yet                                                                                                                                                                  |
| Bluetooth LE + Contacts                                          | plugins installed, **no manifest permissions**                                                                     | Scaffolding only, by decision                                                                                                                                                                      |
| Push (FCM)                                                       | `@capacitor/push-notifications` + manifest + `google-services.json`                                                | Working — the client config is committed (ADR-0050); the server side needs three Vercel variables, see "Push notifications" below                                                                  |
| Camera (the Scanner)                                             | manifest `CAMERA` + `frontend/ui/scan/scan-page.tsx`                                                               | Working — declared from `1.0.6` (`20006`); an older shell is told to update (ADR-0053)                                                                                                             |
| Background drain                                                 | `OutboxDrainWorker`, `SyncScheduler` (native, #651); `SyncFlushWorker` + `public/sync-flush.html` were the shell's | Working — the app replays its own Outbox with the app closed; the drain page remains for shells installed before #651                                                                              |
| Background wake (FCM)                                            | `SyncMessagingService`, `ShellSyncWake`, `POST /api/push/wake`                                                     | Working — a delivered write wakes the account's other devices with a silent data message; a force-stopped app waits for the floor                                                                  |
| Battery-exemption prompt                                         | `ShellBatteryPrompt`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`                                                       | Working — a drain that ends with work still owed, or a wake received in the background, asks once with the reason stated; the tap opens the platform's one-tap dialog (ADR-0059's amendment, #381) |

### Text input stays on the WebView's own IME connection

`capacitor.config.ts` leaves Capacitor's `android.captureInput` at its default, `false`, and has to
keep doing so. Turning it on replaces the WebView's own `InputConnection` with a plain
`BaseInputConnection` (`CapacitorWebView.onCreateInputConnection` in `@capacitor/android`), a
connection with no composing or bidi model. The symptom was Arabic-only: an edit made in the middle
of a textarea was committed at the **end** of the field, so the caret jumped to the last letter on
every keystroke, in every text field of the site, and only in the shell — a browser never takes that
path, which is why `npm run dev` and the same page in Chrome or Edge behaved correctly. Latin input
survived it, because a plain commit needs no bidi model.

The same class also answers `ACTION_MULTIPLE` key events by writing
`document.activeElement.value = document.activeElement.value + characters` — an append to the end of
the field by construction, and an unescaped string built into `evaluateJavascript`. Nothing in the app
needs captured input, so the option is gone rather than set to `false`: a default that is off cannot
be turned back on by accident. A shell built before the change keeps the bug until it is updated.

### The local fallback, and the WebView floor

Two values in `capacitor.config.ts` decide what a launch shows when the site cannot be the answer:
`server.errorPath` names a page bundled in `capacitor-web/`, and `android.minWebViewVersion` is the
oldest System WebView the shell will hand the site to. Capacitor loads that page on a main-frame
navigation error (`BridgeWebViewClient.onReceivedError`) and, before the site is requested at all, when
the installed WebView is below the floor (`Bridge.create` → `isMinimumWebViewInstalled` → `getErrorUrl`).
Both paths resolve to `https://localhost/unavailable.html`, served from the assets `cap sync` copies
into the APK. The page needs no network and, on Android, gets no Capacitor bridge — it does not need one.

The floor is **111**, the site's own baseline rather than a shell-specific guess. Next.js 16 supports
Chrome 111+ (`node_modules/next/dist/docs/03-architecture/supported-browsers.md`) and Tailwind CSS 4
targets the same baseline. The shipped client chunks already require ES2022: parsing
`.next/static/chunks/*.js` with acorn fails 29 files at ES2021 and passes at ES2022, on class fields and
static blocks such as `class e extends Map{static{a(this,"OrderedDict")}#e;…}`. ES2022 syntax alone
would name 94, but syntax is only the first failure; 111 is the documented runtime and CSS floor, and
Chrome 111 implements the ES2022 syntax the bundles use. ADR-0067 records the decision and the options
that were rejected.

The page reads `Chrome/<major>` from its own user agent. Both branches paint the same thing — the app's
dark background, full height, inside the safe area — and differ only in whether recovery is armed:

- **below 111** — nothing, and no automatic action: the site cannot run until the WebView is updated,
  and reconnecting does not change that.
- **otherwise** — nothing, and one automatic attempt. If the site is unreachable the user sees an empty
  screen; there is no copy and no tap target. When the radio comes back the page spends exactly one
  attempt on its own (`location.assign` to the canonical origin) — the recovery ADR-0067's amendment
  bounds to once per session with a `sessionStorage` flag, so a still-down site produces one page load
  per failure, never a reload loop (#447). There is no timer and no `navigator.onLine` probe.

The inline script is **ES5** on purpose: the page is shown precisely on WebViews that cannot parse the
site. It bundles no font, because there is no text to set, and the palette is the app's own
`#121216`. `scripts/__tests__/shell-fallback.test.mjs` pins the config to the page, parses the script
as ES5, holds the recovery's one-listener/one-flag guard, and refuses any copy or font in the file.

The API 30 image's WebView is 83.0.4103.106, which is below the floor — the same image that used to
render the site without hydrating. A launch there now shows the blank page instead of that broken one.
Measured with the debug APK at counter `20011`:

| Step                                   | What the device showed                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Cold launch                            | WebView target `https://localhost/unavailable.html`; an empty dark screen; no heading, copy, version line or action |
| Offline attempt (UA overridden to 120) | `location.href` is `https://localhost/unavailable.html`; the same empty dark screen; no retry link                  |
| Four seconds later                     | URL still `https://localhost/unavailable.html` — one main-frame error produced one page load, not a reload loop     |
| Retry after reconnecting               | no tap exists; the page navigated to `https://royaraqamia.com/` on its own, once, and the site's text was present   |

The recovery branch was exercised by overriding the running WebView's user agent to `Chrome/120` in
DevTools, because the only installed image is 83 and would otherwise be stopped by the floor before a
navigation was attempted; the engine stayed 83, which is enough to prove the page's branch and the
absence of a loop, not to claim the site hydrates on 83.

### The native bridge on a remote origin

`window.Capacitor` reaches the page down one of two paths, both scoped to the configured
app URL:

- **WebView 86+**: `Bridge.java` registers the injected script with
  `WebViewCompat.addDocumentStartJavaScript` for that one origin, path, query and fragment
  stripped (`Bridge.java:267-269` in `@capacitor/android` 8.5.3).
- **Older WebViews**: every HTML `GET` Capacitor proxies is rewritten as it streams
  (`WebViewLocalServer.handleProxyRequest` → `jsInjector.getInjectedStream`,
  `WebViewLocalServer.java:515-563`). This is the path an older WebView takes, because
  `DOCUMENT_START_SCRIPT` is unavailable there.

Measured on the API 30 emulator, whose WebView is 83.0.4103.106 — i.e. the older path. That image is
below the floor now (ADR-0067), so these rows record how the bridge behaves on the older path rather
than a launch the shell still allows:

| Page                                                  | Bridge                        |
| ----------------------------------------------------- | ----------------------------- |
| `/` (cold start)                                      | injected, `Platform: android` |
| `/scan` (reached by an App Link deep link)            | injected                      |
| `/auth/callback` (404 — the route does not exist yet) | **MISSING**                   |

The last row is the sharp edge of the proxy path: it reads the response body with
`HttpURLConnection.getInputStream()`, which throws on a non-2xx status, so the script never
reaches the document and the page keeps web behaviour. On WebView 86+ the same 404 keeps
its bridge, because that path matches on origin alone.

Two consequences worth carrying:

- Keep the canonical origin exactly as `server.url` names it. Another origin is proxied
  without injection and never sees the bridge
  ([ionic-team/capacitor#7454](https://github.com/ionic-team/capacitor/issues/7454)); a
  deep link should therefore always stay on `royaraqamia.com`.
- On the proxy path Capacitor, not the WebView, makes the request for HTML documents, and
  forwards cookies both ways explicitly (`CookieManager.getCookie`, then `Set-Cookie` back
  into the cookie jar). Supabase cookie auth survives it — but if a session ever works in
  a browser and not in the app on an old device, this is the machinery to suspect.

`npm run android:verify-bridge` re-checks all of the above on whatever device is
connected, so none of it is carried forward on trust.

### The background drain

> **Retired in the app by [#651](https://github.com/royaraqamia/royaraqamia/issues/651).** The app no
> longer loads `/sync-flush.html` in a headless WebView: `OutboxDrainWorker` replays the Local Store's
> own Outbox, so delivery is native on both sides of the queue
> ([native-app.md](native-app.md#phase-2--the-shell) records it as wired). Two things survive from the
> section below, which is kept as the shell's record: the two schedules
> (`royaraqamia-drain-periodic` / `royaraqamia-drain-now`), their `CONNECTED` constraint and the
> five-attempt budget, and the battery prompt the drain's report still triggers. The page itself, and
> `scripts/build-sync-flush.mjs` with it, stays served for shells installed before the update — a
> released shell still loads it, and `public/` is the only place it can come from.

The shell is a remote-URL WebView with no native background components, so a write queued while the app
is not in front used to wait for the next open. `SyncFlushWorker` is what comes back for it (ADR-0059):

- **When.** Two schedules, and only two. The page asks when it knows: `flushOutbox`'s pending count is the
  same condition that registers a Background Sync tag on the web, and in the shell it also runs
  `RoyShellSync.schedule()` through the bridge `MainActivity` installs. A 15-minute periodic job is the
  floor — for the cases the signal cannot cover (a shell built before the signal, a process killed before
  it could ask, a drain that gave up).
- **What.** The worker loads `/sync-flush.html` — the shell's own page, served by the site and built by
  `scripts/build-sync-flush.mjs` — in a second, headless WebView. That WebView is the same profile as the
  app's, so the session cookie and the Outbox are simply there, and the page replays the queue through
  `frontend/api/sync-flush-entry.ts`: the same `DRAINABLE_PRODUCTS` registry and the same `drainOutboxes`
  the service worker runs. The Outbox keeps one implementation; the shell never becomes a second writer.
- **How it reports.** The worker injects `RoyShellSync.report(json)` before the page loads, waits for it
  (60s), and treats anything other than a clean report as "come back": pending intents, a session lookup
  that failed, a page that never answered. After five attempts it gives up — the queue is durable and
  still flushes on open, so that is the end of a schedule, not a lost write.

Both schedules are constrained to `NETWORK_CONNECTED`: a drain that wakes with no network would burn an
attempt, and WorkManager's answer — wait for connectivity — is exactly when the queue should move.

```powershell
adb logcat -s RoySyncFlush:*            # one line per attempt: what the page said, or why it said nothing
adb shell dumpsys jobscheduler | Select-String 'com.royaraqamia.app'   # both requests, and their constraints
```

Measured on the API 30 emulator (`Pixel_API_30`), with the site served locally and the shell pointed at
`http://localhost:3000` through `adb reverse` (see the two limits below for why not `10.0.2.2`):

| What the device showed              | Evidence                                                                                                                                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Both schedules registered           | `dumpsys jobscheduler`: two jobs on `androidx.work…SystemJobService`, `initial backoff +30s`                                                                                                                                                  |
| The bridge is live in the page      | from the page itself: `typeof window.RoyShellSync.schedule === 'function'`                                                                                                                                                                    |
| An attempt loads the drain page     | the worker's WebView appears as a `sync-flush.html` target in `adb forward …/json`, and `logcat` carries its `page: …` console line                                                                                                           |
| A page that says nothing comes back | `RoySyncFlush: queued another attempt: the page reported nothing (the drain page did not report within 60000ms)`                                                                                                                              |
| A clean report ends the attempt     | `e2e/sync-flush.spec.ts` loads the same page against a production build and gets `pending: 0`, one replayed intent, and the row on the server; on hardware the worker's own line is `RoySyncFlush: drained (failed=0)`, one attempt, no retry |

**Two limits of this drill, and both are environmental.** The image's WebView is 83.0.4103.106, below the
shell's floor of 111 (ADR-0067): the site's bundles use syntax it cannot parse (`SyntaxError: Unexpected
token '='`), so that image used to _render_ the page without hydrating it, and now a launch there shows
the local fallback instead. The drain page itself is ES2020 and still parses, which is why the worker half
can be exercised on that image, but the page-driven `schedule()` signal cannot — so the drain was verified
against a production build in Chromium, and the wake belongs on real hardware. And the site's CSP sends
`upgrade-insecure-requests`, which upgrades every subresource of a cleartext document to https: pointing
the shell at `http://10.0.2.2:3000` therefore fails to load the app's own scripts, while `localhost`
(reached with `adb reverse tcp:3000 tcp:3000`) is a trustworthy origin and is exempt. The emulator's
connectivity also never reaches `VALIDATED` on a network as flaky as this one, which WorkManager's
`CONNECTED` request includes — the jobs sit at `Unsatisfied constraints: CONNECTIVITY`. On a real device
with working DNS neither applies.

Both limits belong to that image. An API 35 image ships WebView 124 and reaches `VALIDATED`, so the
page half runs there (`--avd Roy_API_35`, or any AVD with a current System WebView): what it measured, and
the defect it found, are in "The real-device matrix" below.

### The drain drill

> **Retired by [#651](https://github.com/royaraqamia/royaraqamia/issues/651).** `scripts/shell-drill.mjs`
> and `npm run android:drill` went with the WebView drain they wait on: the drill's whole assertion was
> the worker's `RoySyncFlush: drained (failed=0)` line, and that worker no longer exists. The app's own
> proof is `npm run android:outbox-drill` (#650) — sign in, cut the radio, queue a write, force-stop,
> restore the radio, open the app, and read the row back from the server inside the five-second budget
> — plus `adb logcat -s RoyOutboxDrain:*` for the background half.

The arrangement it drove is kept below, because the steps are still what a hand-run looks like and the
two WebView limits it records are properties of the image, not of the app:

1. Boots `Pixel_API_30` headless, or uses hardware with `--device <serial>`.
2. Serves the site locally and builds the **debug** APK against `http://localhost:<port>`, then runs
   `adb reverse tcp:<port> tcp:<port>`. `localhost` and not `10.0.2.2`, for the CSP reason above.
3. Installs it, launches it, forwards the WebView DevTools socket and drives the page over raw CDP —
   `Runtime.enable` **before** the first `Runtime.evaluate`, or the evaluation lands in the initial
   empty context and returns `undefined` for an expression that is true in the page.
4. Signs in, opens HabitFlow and its add-habit dialog while the network still works (the dialog's
   chunk and handlers have to arrive online), turns the radio off, saves a habit, backgrounds the
   app, `am kill`s it, restores the radio, and waits for `RoySyncFlush: drained (failed=0)`. It then
   reads the habit back from the server through a second session on the host — which is also where
   the cleanup `DELETE` happens, so a drill leaves nothing on the shared test account.
5. Tears the emulator and the dev server down in a `finally`, even when a step failed. `--keep` leaves
   both up to inspect.

Three things it does, rather than leaving them to be rediscovered:

- **Turnstile is unconfigured for the login.** A dev server the drill starts gets `TURNSTILE_SECRET_KEY`
  empty in its own process, the state `.github/workflows/e2e-offline.yml` runs in, which is what makes
  `backend/config/turnstile.ts` skip verification for the dummy token. A deployment is never touched,
  and a server the drill did not start is only reported on: if that one has Turnstile configured the
  login answers 4xx and the drill says so instead of implying the queue is broken. On Windows, setting
  `$env:TURNSTILE_SECRET_KEY = ''` in PowerShell does **not** do this: PowerShell removes the variable
  and `.env` restores the secret. The empty value has to be in the child's environment, which is what
  the drill does and what `cross-env` does in the recipe below.
- **`am kill`, never `am force-stop`.** Force-stop cancels scheduled work, which would destroy the very
  job the drill exists to exercise.
- **`am kill` needs a background app.** It kills only what Android considers killable, and a foreground
  activity is not, so the drill sends `KEYCODE_HOME` first and then confirms `pidof` is empty before
  restoring the radio — otherwise the page's own `online` listener could deliver the write while the
  process is still alive, and the drill would prove nothing.

Credentials are `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` in `.env` (the offline suite's account); the npm
script loads it with `--env-file-if-exists`. It needs a server, an emulator and that account, so it is
not a CI job.

**It stops at the WebView floor, by design.** On `Pixel_API_30` the WebView is 83.0.4103.106, below the
shell's floor of 111, so Capacitor loads `unavailable.html` and the site never hydrates — there is
nothing to sign in with and nothing to queue. The drill measures the WebView before attempting the page
half and exits `2` with that explanation, instead of replaying the dead end. Measured on 2026-10-20:
`attached to https://localhost/unavailable.html`, `WebView 83 (… Chrome/83.0.4103.106 …, RoyaraqamiaShell/1.0.12+20012)`,
exit `2`, emulator killed. The two paths that run the whole drill are **a real device** (`--device
<serial>`, where the page-driven `schedule()` signal also works) and **the Chromium stand-in**
(`SYNC_FLUSH_E2E=1 npx playwright test e2e/sync-flush.spec.ts`), which covers the page half but not the
worker. No script can make the API 30 image do more than the worker half in the table above — a newer
image can, and did: see "The real-device matrix".

**If the worker never runs**, the drill's timeout prints `dumpsys jobscheduler` for the package.
`Unsatisfied constraints: CONNECTIVITY` is the environmental limit above, not a shell defect: the
emulator's connectivity never reaches `VALIDATED`, which is part of what WorkManager's `CONNECTED`
request means. On hardware with working DNS it does not apply.

The numbered recipe is the fallback, for when the script itself is the broken thing — a device it
cannot manage, or an account behind a server you did not start:

```powershell
npx cross-env TURNSTILE_SECRET_KEY= npm run dev   # unconfigured for this process only
$env:CAPACITOR_SERVER_URL = 'http://localhost:3000'
npm run android:apk
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb reverse tcp:3000 tcp:3000
adb shell am start -n com.royaraqamia.app/.MainActivity
# sign in, open /habitflow and its add dialog, turn the radio off, save a habit:
adb shell svc wifi disable; adb shell svc data disable
adb shell input keyevent KEYCODE_HOME
adb shell am kill com.royaraqamia.app
adb logcat -c
adb shell svc wifi enable; adb shell svc data enable
adb logcat -s RoySyncFlush:*
```

### The real-device matrix

The drill above proves one case: a write queued with the radio off survives the process and the
worker delivers it. The table below is the rest of phase 7's matrix — the part that needs a phone,
for the two environmental reasons above. `--matrix` filled the three rows that do not need a person
pressing buttons until the drill was retired with the WebView drain (#651); the force-stop row is now
`npm run android:outbox-drill`'s own case, and the doze and mid-flush rows are run by hand against
`OutboxDrainWorker`.

| Case                    | What it does                                                                                                     | What it proves                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Force-stop              | queues offline, `am force-stop`, restores the radio, waits a minute, launches                                    | nothing arrives before the launch, and the launch then delivers exactly one habit                                                          |
| Doze                    | queues offline, `am kill`s, forces `mState=IDLE`, restores the radio, waits a minute, releases                   | the `CONNECTED` job is deferred while idle and is still queued after release; the write lands at the next launch or period, not on release |
| Process death mid-flush | queues offline, `am kill`s, restores the radio, `SIGKILL`s the process the moment the worker starts it, launches | the queue survives an interrupted drain, and the retry leaves exactly one habit — not two                                                  |

Three constraints, all of them things a short run would otherwise measure dishonestly:

- **Doze is a deferral test, not a 15-minute clock.** The floor is `PERIOD_MINUTES = 15` in
  `SyncScheduler.kt`, which WorkManager enforces; what the case watches is that the forced-idle
  device runs no worker at all, and that the job is still there after release. It does not drain on
  release: measured on Android 15 (#485), leaving idle reschedules the deferred job to the next
  period and the queued write arrived at the next launch. A late write is the platform's behaviour
  here, not a lost one, and the row above states it that way.
- **A case the device refuses is recorded as `skipped`, never as a pass.** An OEM that ignores
  `force-idle`, a build where `run-as` cannot signal the app, a drain that starts and finishes
  before the kill lands — each prints the device's own words in the table.
- **The radio and doze are restored in a `finally`,** so a failed case leaves the phone usable and
  the next case still starts from a network.

The cases that stay manual, and why:

- **The FCM wake** needs a Firebase-enabled build _and_ the server-side service account: with FCM
  unconfigured (which `.env` leaves it) `POST /api/push/wake` answers `202` and sends nothing, so a
  scripted wake would "pass" by never happening. Watch it land with `adb logcat -s RoyOutboxDrain:*`
  after a write from a second device.
- **Low storage / a full quota, a worker swap mid-queue and several tabs** are browser behaviours
  first (`docs/specs/offline-first.md`, Verification) whose device form needs a person to fill the
  disk, update the shell mid-queue, or open a second tab — nothing here can judge what the phone
  did.

The run prints its three rows as a markdown table; paste them over the three scripted rows below.
A row that says `_(manual)_` has not been measured by anything, and should not read as if it had.

Measured on `Roy_API_35` (Android 15, System WebView 124.0.6367.219, connectivity `VALIDATED`),
2026-10-21, against a production build served locally — the first run that reached the page half at
all (the two limits above are properties of the API 30 image, not of the shell: an API 35 image has
WebView 124 and reaches `VALIDATED` here, so `--avd <that AVD>` runs the whole drill). It found
[#484](https://github.com/royaraqamia/royaraqamia/issues/484): the worker read the drain page's
`"error": null` through Android's `optString`, which stringifies a JSON null to `"null"`, so a clean
drain logged `the drain failed: null`, retried five times, then gave up — `drained (failed=0)` only
appears once that fix is in the build.

| Case                     | Expected                                                                 | Observed                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Force-stop               | nothing until launch                                                     | pass — nothing for 60s; the launch delivered exactly one                                                                                                                                                                         |
| Doze                     | deferred while idle, the write lands at the next launch or period        | fail against the old expectation — nothing drained inside the release window; the habit was on the server after the next launch, so the queue was late, not lost ([#485](https://github.com/royaraqamia/royaraqamia/issues/485)) |
| Process death mid-flush  | one habit, no duplicate                                                  | pass — `SIGKILL` landed mid-flush; the retry delivered exactly one                                                                                                                                                               |
| FCM wake, backgrounded   | the drain runs without the app being opened                              | _(manual)_                                                                                                                                                                                                                       |
| FCM wake, killed         | the drain runs from a closed process                                     | _(manual)_                                                                                                                                                                                                                       |
| 15-minute floor          | a queued write drains within one period, with no signal                  | _(manual, 15+ min)_                                                                                                                                                                                                              |
| No network at launch     | the shell opens, the queue waits, and it drains when the network returns | _(manual)_                                                                                                                                                                                                                       |
| Low storage / full quota | the failure is visible and the write is not silently lost                | _(manual)_                                                                                                                                                                                                                       |
| Worker swap mid-queue    | the queue survives the swap and each intent is delivered once            | _(manual)_                                                                                                                                                                                                                       |
| Several tabs             | one intent per write, not one per tab                                    | _(manual)_                                                                                                                                                                                                                       |

### The wake

The drain answers "what this device still owes". The wake answers the other half of ADR-0060: "this
account moved somewhere else", for the app that would hear that over Realtime if it were open.

- **Who asks.** The device that just _delivered_ a write — the one moment a device knows the account
  moved. `requestDeviceWake()` runs from the page's flush driver, the service worker's drain and the
  drain page, so a laptop commit reaches a phone and a phone commit reaches a laptop. A _pull_ never
  asks: two devices that pulled would wake each other forever.
- **What travels.** A data-only, high-priority FCM message with one field, `{ type: "sync" }`. No
  `notification` block, so it draws nothing; no payload, so a receiver cannot mistake a hint for state.
  `POST /api/push/wake` reaches the caller's own account and nobody else's — session, same origin, a
  per-user limit — and it takes the caller's FCM token so the writer is not woken by its own commit.
- **What receives it.** `SyncMessagingService` replaces `@capacitor/push-notifications`'
  `MessagingService` in the manifest (`tools:node="remove"`). Firebase delivers `MESSAGING_EVENT` to
  exactly one service, and leaving both declared would be a coin toss — including for the visible
  notifications the bell depends on. The plugin's two jobs (a message's data for the page, a rotated
  token) are delegated back to its static entry points; ours is to call `SyncScheduler.flushSoon()`.
  Checking the _merged_ manifest is the proof that exactly one receiver listens.
- **What it may not do.** Make the app do work it cannot do. FCM does not deliver to an app the user
  _force-stopped_ (Android blocks it until the next launch), so the 15-minute floor is not redundant — it
  is what covers that case. A wake is an accelerator, never the guarantee.

To watch one land, and to check the receiver wiring after any plugin bump:

```powershell
adb logcat -s RoyOutboxDrain:*   # what the worker did with the wake, or with its floor
# Exactly one MESSAGING_EVENT service, and it is com.royaraqamia.app.SyncMessagingService:
Select-String -Path android/app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml -Pattern 'MESSAGING_EVENT'
```

### The system back button

The system press is the navigation control Android owns, and in a one-activity shell it has to be able
to end the task. It could not: Capacitor's App plugin answers the press (`AppPlugin`, `EVENT_BACK_BUTTON`)
by calling `WebView.canGoBack()`/`goBack()` and, when the history is exhausted, returning without doing
anything — the press is consumed and the activity never finishes, so the last press did nothing at all.
`MainActivity.installBackExit()` (ADR-0082) installs its own `OnBackPressedCallback` after the plugin's,
which is what puts it first: the plugin registers while the bridge is built, inside `super.onCreate`, and
`OnBackPressedDispatcher` offers a press to the most recently added enabled callback. It keeps the
navigation and replaces the dead end with `finish()`.

What counts as the dead end is the WebView's own history, and that is version-dependent. Measured on
`Roy_API_35` (System WebView 124.0.6367.219) after following a link from `/` to `/news`, a same-document
navigation:

| Probe                         | Value                |
| ----------------------------- | -------------------- |
| `history.length`              | `2`                  |
| `window.navigation.canGoBack` | `true`               |
| `Page.getNavigationHistory`   | one entry, index `0` |
| `WebView.canGoBack()`         | `false`              |

So on that engine Back ends the task from a page the WebView cannot walk, and the site's own back
control (`frontend/ui/shared/back-button.tsx`) is the in-app way up. On a WebView that carries the site's
client-side navigations — the behaviour reported on the device that raised this, where Back walked the
site page by page and then stopped on the home page — Back walks them as it always did and only the last
press closes. That report is also why this is native code and not a page listener: a press answered
through the Capacitor bridge would do nothing whenever the bridge failed to inject (ADR-0043).

An open dialogue was not in that history at all: the overlay is component state, so the press walked
past it and left the page the dialogue was opened on. The page now puts an entry there for it
(`frontend/ui/primitives/overlay-back.ts`, ADR-0095): opening an overlay pushes a same-URL entry tagged
with a depth marker, and the press pops it and closes the overlay opened last, at any nesting depth.
Nothing navigates — the URL never changes — and closing the overlay any other way takes the entry back
off the history, so the press that follows still walks the page as it always did. Chrome's back gesture
and the in-app back control reach the same entry, so all three agree.

Check both branches with a debug build:

```powershell
adb shell input keyevent 4   # at the root: the app leaves the foreground; `topResumedActivity` moves on
adb shell dumpsys activity activities | Select-String 'topResumedActivity'
adb shell input keyevent 4   # on a page reached by an App Link: back should walk, not exit
adb shell input keyevent 4   # with a dialogue open: it closes, the page and its URL stay
```

The shell's counter moves for this (ADR-0043): a shell installed before it keeps the old behaviour until
it takes the update prompt.

### The system bar band

The site's fixed chrome — the top bar, the back control, the bottom tab bar, the corner
buttons — reserves the strip the system bars draw over. Nothing native guarantees that on
every device, and `capacitor.config.ts`'s `StatusBar.overlaysWebView: false` cannot either:
it works through the deprecated `SYSTEM_UI_FLAG_LAYOUT_*` set (`StatusBar.java:102`), which
Android 15+ ignores for an app targeting SDK 36 — the shell targets 36
(`android/variables.gradle:4`), so the platform draws the window edge-to-edge and the page
is what has to make room.

Capacitor 8 hands the inset to the page down one of two paths (`SystemBars.java:194`):

- **WebView 140+ with `viewport-fit=cover`**: insets are forwarded to the WebView, the
  DecorView is not padded, and `env(safe-area-inset-*)` is the real band — the page's own
  chrome has to reserve it. The gate is Capacitor's (`WEBVIEW_VERSION_WITH_SAFE_AREA_FIX =
140`), because Chromium did not map a WebView's insets into `env()` before it.
- **Anything else**: the plugin pads the DecorView itself (`SystemBars.java:222`) and
  consumes the insets, so the WebView starts below the bars and `env()` reads `0`. Reserving
  the band on top of that padding would reserve it twice.

So the page reads `env()` and nothing else. It is funnelled through the `--roy-safe-*` tokens
in `app/global.css` — `--roy-safe-*-raw` holds `env()`, the token re-derives from it with a
`0px` fallback — and the `.safe-area-inset-*` helpers, and those are the only source the
fixed surfaces use. **Never** the shell's own injected `--safe-area-inset-*` custom
properties: they carry the same numbers the DecorView padding has already spent.

Measured on the API 30 emulator (WebView 83.0.4103.106, i.e. the second path — below the floor since
ADR-0067, so this is a historical probe of that path), app pointed at
a local dev server:

| Probe                                       | Value                               |
| ------------------------------------------- | ----------------------------------- |
| `meta[name=viewport]`                       | `…, viewport-fit=cover`             |
| `env(safe-area-inset-top, 99px)` inline     | `0px`                               |
| `--roy-safe-top` (declared in `global.css`) | `"0px"` — valid, not empty          |
| `padding-top: var(--roy-safe-top)`          | `0px`                               |
| `height: calc(2rem + var(--roy-safe-top))`  | `32px` — the `calc()` survives      |
| `window.innerHeight` / `screen.height`      | `751` / `851` CSS px (shell insets) |

The last row is the point of the arrangement: on this device the WebView already sits inside
the bars, so every band the page reserves stays `0` — the chrome renders exactly as it did
before the band existed. The `calc()` row is why the token must not resolve _invalid_
instead of `0`: an invalid token would not merely fail to grow a band, it would collapse the
spacer that keeps a page's first row out from under the bar
(`e2e/app-chrome.spec.ts`, "the system-bar band").

### Deep links

Two filters are registered on `MainActivity`:

- `https://royaraqamia.com/**`, `autoVerify="true"` — verified against
  `public/.well-known/assetlinks.json`, which lists the release **and** debug
  certificate fingerprints so links resolve on a debug build too. Adding a keystore means
  adding its SHA-256 there.
- `royar://auth/*` — the return trip for a flow that had to leave the WebView.

Capacitor loads `server.url` and ignores the launch URL, so `MainActivity` turns an
incoming intent back into a WebView navigation; `royar://auth/callback?code=…` is
rewritten to `https://royaraqamia.com/auth/callback?code=…` so the code is exchanged in
the WebView's cookie jar, where the PKCE verifier lives.

Verify App Links after installing:

```powershell
adb shell pm get-app-links com.royaraqamia.app
adb shell am start -a android.intent.action.VIEW -d "https://royaraqamia.com/scan"
```

Measured on the API 30 emulator with the debug APK installed — the handler rewrites the
intent into a WebView navigation:

| Intent                                            | WebView ends on                                      |
| ------------------------------------------------- | ---------------------------------------------------- |
| `-a VIEW -d "royar://auth/callback?code=TEST123"` | `https://royaraqamia.com/auth/callback?code=TEST123` |
| `-a VIEW -d "https://royaraqamia.com/scan"`       | `https://royaraqamia.com/scan`                       |

The first row is why the on-device check exists: the first implementation read the path with
`Uri.getPath()` and produced `/callback`, dropping the `auth` authority. It looked
plausible and was wrong; nothing but an installed build would have said so.

App Links _verification_ (`autoVerify`) cannot be confirmed until
`public/.well-known/assetlinks.json` is deployed to production — the mechanism above was
exercised by targeting the activity explicitly, which bypasses that check.

### The camera is a web API behind a manifest permission

The Scanner (ADR-0035) calls `getUserMedia` in the WebView, which never goes through a
Capacitor plugin: the WebView raises `VIDEO_CAPTURE`, `BridgeWebChromeClient.onPermissionRequest`
turns that into `android.permission.CAMERA`, and Android's own dialog does the asking. The
manifest declares the permission from counter `20006`. A shell built before it cannot ask at
all — the platform refuses the request without drawing a dialog, `getUserMedia` rejects with
`NotAllowedError`, and no device setting can undo that, because the permission was never in
the installed package (`adb shell dumpsys package com.royaraqamia.app` lists what it has).
`scan-page.tsx` compares the shell's own counter (ADR-0046) against `20006` and points an
older shell at the update it already offers, rather than at a settings screen that cannot
help it (ADR-0053).

`android.hardware.camera` is declared `required="false"`: the camera is a Scanner feature,
not a requirement, so a device without one still installs the APK and still gets uploads —
the page already answers `NotFoundError` with that.

## Open items

### 1. Google sign-in: one manual step left

The flow is implemented (ADR-0037): `app/auth/callback/route.ts` exchanges the code for a
session, `/auth/api/google` sends the shell's callback to `royar://auth/callback` instead
of a path on the site, and `MainActivity` maps that back onto the https URL inside the
WebView so the exchange happens on the cookie jar that started it.

What no code in this repository can do: **add the redirect URLs to Supabase's allowlist**
(Authentication → URL Configuration):

- `https://royaraqamia.com/auth/callback` — the web flow
- `royar://auth/callback` — the shell

Until both are listed, Supabase refuses the redirect and the visitor lands on
`/auth/login?error=oauth_failed`. Verified on the emulator: `Browser.open` resolves and
Chrome opens a Custom Tab, so the app side of the handoff is real; the Supabase side
cannot be verified from here.

### 2. Push notifications (FCM) — implemented; the sending side is environment state

Web Push (VAPID) does not exist in an Android WebView, so OS-level push uses FCM instead
(ADR-0038). The whole path is in place: `device_push_tokens` (migration
`20261013120000`, RLS own-rows), `POST`/`DELETE /api/push/devices`, the FCM HTTP v1 sender
with the service-account assertion, `PushFanout` delivering to Web Push and FCM together,
and the client half in `frontend/api/push-native.ts` — driven by the same toggle, reached
through the bridge rather than an npm import.

1. **`google-services.json`** in `android/app/` — **committed** (ADR-0050). It carries the
   project id and the Android API key, both of which every APK already ships, and its
   absence is what once shipped a shell whose push plugin killed the app on the
   notification bell: the plugin's `register()` throws where Capacitor rethrows on its own
   plugin thread, which is a fatal crash rather than a rejected promise. A build without it
   now withholds the plugin entirely — the page reports notifications as unsupported — and
   `assembleRelease`/`bundleRelease` refuse to run.

   Restricting that key is the one console step, and it is easy to do in the wrong project:
   the app's Firebase project is **`roya-raqamia`** — APIs & Services → Credentials with
   `?project=roya-raqamia` — and it is _not_ `royaraqamia`, the project that holds the Google
   sign-in OAuth clients. On `Android key (auto created by Firebase)` set Application
   restrictions → Android apps, with one entry per signing certificate the shell is built
   with: the release one (the certificate `public/.well-known/assetlinks.json` lists) and the
   debug one from `~/.android/debug.keystore`, or a local debug build cannot register for
   push. `apksigner verify --print-certs app-release.apk` prints both digests; `Save` and
   allow a few minutes. Rotating the keystore, or adding Play App Signing later, means adding
   that certificate here too — the restriction fails silently, as a device that never
   registers.

   That key is also what trips GitHub's secret-scanning alert on this file, and push
   protection is on for the repository, so a later edit to it — rotating the key regenerates
   the file — would be refused until someone bypasses the block. `.github/secret_scanning.yml`
   excludes this one path instead: the alert closes as "ignored by configuration" and a
   rotation pushes cleanly. `.gitleaks.toml` carries the same allowlist for CI. Keep both
   lists to that single path, so a real secret anywhere else still alerts and still blocks.

2. **Three environment variables** in Vercel (Production, Preview, Development), from the
   service-account JSON generated under Project settings → Service accounts:
   `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`. The private key is the PEM with
   its newlines escaped as `\n` — that is how the downloaded JSON already carries it, and
   `backend/config/env.ts` normalises it back. With any of the three missing the channel is
   a no-op rather than an error. The same service account sends the shell's silent high-priority
   _data_ wake (see "The wake"); the drain itself does not need it.
3. **A rebuild** of the APK/AAB so the shell picks up the messaging SDK.

The service-account JSON itself must never be committed or dropped next to the keystore
backup: it can send to every device in the project. It is not the file in `android/app/`.

### 3. Publishing to Google Play

Nothing about Play is set up: no account, no Play App Signing. The build is otherwise
ready — `targetSdkVersion 36` (required for new apps since 2026-08-31), a signed AAB, a
release keystore, and a version scheme. Still required: the $25 developer account, a
privacy policy URL, the Data safety form, a content rating, and store listing assets. Note
that a shell which loads all of its content remotely is a gray area reviewers can question
(App Store compliance is discussed in ADR-0036) — an APK distributed directly avoids that
question entirely, which is where this project is pointed.

### 4. Announcing and installing a shell update

Both halves work: the shell announces its own APK (ADR-0043) and installs it (ADR-0044), and the page
holds its own offer back while that is pending.

**What is in place.** `ShellUpdate` reads `/android/latest.json` (published from
`public/android/latest.json`) and compares its `versionCode` with `BuildConfig.VERSION_CODE`, which comes
from `android/shell-version.properties` rather than from `package.json`; the manifest's optional
`rollout` stages that comparison, and `minSupportedVersionCode` is the floor. `ShellUpdatePrompt` asks the
user natively when a newer APK exists — an `AlertDialog`, at most every six hours and on a fresh launch —
and the site stays quiet meanwhile, because `MainActivity` appends `RoyaraqamiaShell/<code>` to the
WebView's user agent and the page compares that with the same manifest.

`/account` carries the same check on demand, for a user who does not want to wait for the next launch:
`InstallSection` recognises the shell from that user agent token (the bridge is not always injected), reads
the manifest itself and reports whether a newer APK is published. It installs nothing — the page cannot
reach `ShellInstaller` — so the message points at the native prompt on the next launch. In a browser the
same row is where the two installs live: the PWA through the browser's prompt, and the APK through the
manifest's `apkUrl`.

It is native for a reason worth remembering: the page cannot reach the shell reliably. With
`server.url` set, Capacitor injects its bridge through a proxy, and on the WebView the app still meets on
older devices a failed proxied request leaves the document without `window.Capacitor` at all — measured
on the API 30 emulator (WebView 83), where a page-driven version of this existed, registered itself, and
was invisible to the page.

One build stays outside all of that, and no fix can reach it: a shell made before the user agent carried the
token, on a WebView where the bridge was not injected either, reads to the page as an ordinary browser. It is
therefore offered the web row, and its APK link — followed _inside_ the WebView — renders the archive's bytes
as text instead of downloading it, which is what the emulator's `1.93.0+shell.20001` build did. Such a build
is not stranded: the native prompt does not depend on the page seeing it, and that is how it reaches a build
that announces itself.

**A floor, and a staged rollout (#503).** The manifest's `minSupportedVersionCode` is also enforced by
the running server: an owned `/api/*` request from a shell below it is answered `426` with
`{ "code": "app_update_required", "minimumVersionCode": … }`, and the page hands that number to the
native card through the `RoyShellUpdate` WebView interface. `/api/version` and `/api/app-perf` stay
open, and a browser sends no counter, so the web is never gated. Raising the floor is what retires an
old shell; until then it keeps working.

`public/android/latest.json` may also carry `rollout`, a percentage from 0 to 100 (default 100). The
app buckets a device deterministically by `Android ID + versionCode`, so a staged release reaches the
same cohort on every check and a later release is a fresh cohort. The page does not claim a partial
release, because it cannot know the device's bucket; the native prompt does. A device below the floor
ignores the percentage — its update is not optional. `npm run android:publish -- --rollout 10` stages
one; the weekly train publishes at 100.

**Installing it.** «تنزيل وتثبيت» runs `ShellDownload`, which streams the published APK into `updates/`
under the app's own internal files directory, hashing as it writes, and renames it into place only when
the byte count and the `sha256` match what the manifest published. `ShellInstaller` then opens the system
installer on that file through the existing `FileProvider`. A manifest that does not describe the file —
no usable hash, or no size — installs nothing at all, a body longer than the manifest described is
refused at the byte it exceeds it, and a failed verification leaves nothing behind. Internal storage
rather than the external files directory, which on API 24–29 another app can write to: that would leave a
window between verifying the file and installing it.

The hash is a check on the download, not a trust boundary: the manifest and the APK come from the same
place, so anything that can rewrite one can rewrite the other. What makes a rewritten manifest useless is
Android refusing an update whose signature differs from the installed app's — which is why
`android:publish` refuses a keystore `public/.well-known/assetlinks.json` does not list.

The permission to hand an APK to the installer is per app from Android 8, and it is asked for at the
moment it is needed: the shell opens the "install unknown apps" screen for this package and the prompt
returns. Measured: **granting it restarts the app** — same process id while the user was in Settings,
gone the moment the toggle moved — so the parked install does not survive the trip and the second tap is
the one that installs. It costs no second download, because the verified file is still there.

Measured on the API 30 emulator (`Pixel_5`, 1080x2340), shell at `20002`, manifest at `20003`:

| Step                         | What the device showed                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The check                    | `ShellUpdater: checked …/android/latest.json: installed=20002 latest=20003 pending=true`                                                               |
| The prompt                   | `alertTitle` = «تحديث التطبيق»; `button1` = «تنزيل وتثبيت», `button2` = «لاحقًا»                                                                       |
| Permission missing           | `Settings$ManageAppExternalSourcesActivity` came to the front, the app still alive (`pid 6668`)                                                        |
| Granting it                  | `REQUEST_INSTALL_PACKAGES: allow`, and the app's process was gone — the prompt returns afterwards                                                      |
| The download                 | `ShellUpdater: verified royaraqamia-shell-20003.apk (9167448 bytes) against the manifest`                                                              |
| The install                  | the package installer opened on the downloaded file; the tap produced `PACKAGE_REPLACED` and `versionCode=20003`                                       |
| The verified file            | `files/updates/royaraqamia-shell-20003.apk`, `-rw-------`, 9167448 bytes — internal storage, readable by nothing else                                  |
| The state after it           | `installed=20003 latest=20003 pending=false`, and no prompt                                                                                            |
| A manifest with a wrong hash | `the update did not verify: the download hashes to 8a23f313…, the manifest says abab…`; nothing installed, `updates/` left empty, the prompt came back |

**Measured again against our own origin.** The rows above were taken while the APK still came from a GitHub
release asset, and that host is not reachable everywhere this app has users. After ADR-0047 moved the
download to `royaraqamia.com/android/`, the same drill was run end to end: an API 30 emulator carrying a
build signed by the repository's keystore with a counter of 20002, updating itself to the published 1.0.3.

| Step                      | What the device showed                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| The check                 | `ShellUpdater: checked https://royaraqamia.com/android/latest.json: installed=20002 latest=20003 pending=true`                       |
| The prompt                | «تحديث التطبيق», «يتوفّر إصدار جديد من التطبيق. تنزيله الآن؟», «تنزيل التحديث» / «لاحقًا»                                            |
| The download              | `files/updates/royaraqamia-shell-20003.apk`, `-rw-------`, 7447105 bytes — internal storage, renamed into place only once it matched |
| The install               | the platform installer opened on the FileProvider URI; the tap produced `PACKAGE_REPLACED` and `versionCode=20003`                   |
| Where the bytes came from | `https://royaraqamia.com/android/royaraqamia-1.0.3.apk` — the site's own path rewritten to the bucket; no GitHub host was involved   |

The drill above runs on a machine whose network is not Syria's, so it proves the app's own path, not that
country's reachability. That half is measured separately and only there: the same URL, fetched from Syria
without a VPN, returned all 7,447,105 bytes with the sha256 the manifest publishes.

**What the two dialogs look like.** They are not the platform's any more (ADR-0054). The card is the
site's own surface — `background` with a hairline `border/60` edge and a 24dp radius, IBM Plex Sans
Arabic, centred text, the Hero CTA's gradient on a pill for the primary action and the label alone, in
`muted-foreground`, for the secondary — and the values are generated into
`android/app/src/main/res/values/colors.xml` from `shared/tokens/tokens.json` (`npm run tokens:generate`,
ADR-0089), so the palette the shell draws and the palette the site paints are one file instead of two
kept in step by hand. The shell is dark-only and RTL on every device, because the site is: both questions were previously
answered by the OS, so a phone in light mode or an English locale got a shell that did not look like the
page it was hosting.

The fonts are in the APK rather than fetched. `res/font/ibm_plex_sans_arabic_regular.ttf` and its `_bold`
sibling are IBM Plex Sans Arabic, the face the site sets its body in (`frontend/shared/fonts.ts`,
`--font-arabic`), converted once from the two `.woff2` files in `public/fonts/` — which Android cannot
read — with `fontTools`. There is no regeneration step, so a change to the site's body face would not
reach here; that is the cost of the 344KB, and it is the reason the `.woff2` files are named above.

The numerals in both cards are the exception: they take Aref Ruqaa, the face the site uses for
read-only numbers (`--font-digits`). `res/font/aref_ruqaa_digits.ttf` is a digit-only subset of the
same `ArefRuqaa-Bold.woff2` (about 4.5KB), applied by `DigitSpans` to the ASCII runs `DigitRanges`
finds, so the Arabic around a version or a size stays in IBM Plex. `formatPercent` formats with
`Locale.ROOT` because `getString(id, args)` otherwise renders `%d` in Arabic-Indic digits on an Arabic
phone.

Measured on the API 30 image — en-US locale, 320dp wide, shell at `20005`, a manifest at `20099`, and an
APK served at 300KB/s so the bar stayed on screen:

| Step           | What the device showed                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| The offer      | «تحديث التَّطبيق», «يتوفَّر إصدار جديد من التَّطبيق. تنزيله الآن؟», «تحديث من 1.0.5 إلى 1.9.9 · 30 م.ب»                          |
| The download   | «جاري تنزيل التَّحديث…», «23%» at the start of its row and «6.6 من 30 م.ب» at the end, the gradient fill from the right, «إلغاء» |
| «إلغاء»        | `ShellUpdater: the download was cancelled: cancelled at 7243394 of 31457280 bytes`, and the card closed onto the page            |
| A failed retry | «تعذَّر تنزيل التَّحديث» with the reason under it, «إعادة المحاولة» and «لاحقًا» — one card, no toast                            |

Two defects were found by that drill rather than by a test, and both would otherwise have shipped: the
layout took its direction from the phone, so on this en-US image the percentage and the size swapped
ends, and the percentage shared the headline's line, which wrapped the headline on a screen this narrow.

**Publishing releases itself.** `.github/workflows/android-release.yml` runs every Monday at 06:00 UTC,
and on a manual dispatch. It is a weekly train, not a per-merge pipeline (ADR-0090): a batch of native
changes earns one version, one APK and one update prompt, because twenty-one releases in the shell's
first weeks — one per commit — is not how an app ships.

1. **Grade the batch.** `scripts/android-release.mjs --plan` asks whether anything native changed since
   the last `android-*` release (`android/**`, `capacitor.config.ts`, or a Capacitor plugin dependency)
   and grades every commit since: `!`/BREAKING → major, `feat` → minor, anything else → patch. A week
   with no native change stops here in ten seconds with `release=false`. A scheduled run also waits out
   its own cadence; a dispatch cuts the batch immediately.
2. **Cut the version and collect the notes.** `--apply` writes `android/shell-version.properties` as
   `1.<minor>.<patch>` plus its derived code, folds the Arabic fragments in
   `android/release-notes/unreleased/` into this release's notes, freezes them in
   `android/release-notes/<version>.md`, and prepends the release to `public/android/changelog.json`.
   It refuses to cut without a note: the pull-request check (`--check-notes`) demands one from the
   change itself, so this is the second line of the same rule. Agents write the fragment with
   `npm run android:note -- "إصلاح: …"` / `"ميزة: …"` / `"تحسين: …"` — never by hand — and repeat the
   same line in the pull request body; `AGENTS.md` makes that part of the change, and `-- --list` shows
   what the next cut will carry.
3. **The shell's JVM tests**, so nothing lands on main without them.
4. **The build and the stamp** — `npm run android:publish --json`, signing the release APK with the
   keystore from repository secrets and writing the file's real `versionCode`, size and SHA-256 into
   `public/android/latest.json`. Before it builds, the run asks the bucket whether this version's file
   is already there: if it is, those bytes are adopted and stamped instead, because a rebuild is not
   byte-identical (ADR-0069).
5. **The uploads** — the APK goes to the Supabase Storage bucket first, because that is what the site
   serves (ADR-0047), and the release `android-1.1.0` carries the same file, titled with its own tag so
   the releases list and the tags list cannot disagree. The tag names the batch's tip, and it is
   created before the commit on purpose: a cut whose commit failed is resumed by the next run from that
   tag, instead of being graded again.
6. **The re-download** — the URL the manifest names,
   `https://royaraqamia.com/android/royaraqamia-1.1.0.apk`, is fetched from outside and hashed before
   anything is announced. That is the path a device takes — the site's rewrite to the bucket — so the
   check is also what proves the rewrite serves the file.
7. **The commit** — `chore(android): release 1.1.0 (20100)`, carrying the version, the notes archive,
   the site's changelog and the manifest in one commit, pushed by CI so the deploy serves it.

Failing at 2–5 leaves the published channel exactly as it was. Failing at 7 leaves the asset published
and the manifest stale — the safe direction, because nobody is told about an APK whose bytes were not
verified, and re-running finishes it by adopting the bytes already in storage instead of rebuilding
them (ADR-0069). Only `main` publishes; a dispatch on a branch can rehearse with `dry_run` (grade, build
and sign, publish nothing). A failed week raises one `release:alert` issue from
`.github/workflows/release-health.yml`.

**The version, and where a user sees it.** `shellVersionName` is semantic and the counter is _derived_
from it — `versionCode = 20000 + (major-1)*10000 + minor*100 + patch`, so `1.0.21` is 20021 and
`1.1.0` is 20100 — which means the train writes one name and both numbers agree by construction.
The name is graded from what the batch contains (`!` → major, `feat` → minor, else patch), so `1.1.0`
means the release added something and `1.0.22` means it fixed something; the code only ever goes up.
`--check` fails a tree where the two disagree and a pull request that hand-edits them; the cut writes
both. Publishing refuses an APK whose own `versionName` is not the one the code means, so Gradle and the
script cannot drift. It reaches a user in three places, all only inside the app (ADR-0046, ADR-0090):

| Where                     | How                                                                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android's app info screen | the APK's `versionName`, so the platform shows it for free                                                                                                                                                            |
| `/account`'s footer       | the shell's user agent, `RoyaraqamiaShell/1.0.3+20003` — the name alone, on the account area's front page only; a browser sends no token, and a shell built before it carried a name has none, so both render nothing |
| `/account/changelog`      | «ما الجديد», the Arabic notes of every Android release, read from `public/android/changelog.json`; the row is rendered only inside the shell                                                                          |

The user agent carries both facts on purpose: the counter is what the update check compares, and every shell
already installed sends the older spelling (`RoyaraqamiaShell/20003`) and always will, because a phone can
only send what it was built with.

**The secrets it needs** (Settings → Secrets and variables → Actions):

| Secret                      | Value                                           |
| --------------------------- | ----------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | the upload keystore, base64-encoded (see below) |
| `ANDROID_KEYSTORE_PASSWORD` | the store password                              |
| `ANDROID_KEY_ALIAS`         | the key alias (`royar`)                         |
| `ANDROID_KEY_PASSWORD`      | that key's password                             |

```powershell
# Windows, from the keys directory
[Convert]::ToBase64String([IO.File]::ReadAllBytes('D:\Projects\royaraqamia-android-keys\royaraqamia-release.jks')) |
  Set-Clipboard    # paste into the ANDROID_KEYSTORE_BASE64 secret
# Linux/macOS
base64 -w0 royaraqamia-release.jks
```

The keystore is the one credential that cannot be re-derived, so having it in the repository's secrets is
a backup decision as much as a convenience one. Rotating it means updating `ANDROID_KEYSTORE_BASE64` **and**
`public/.well-known/assetlinks.json` together — a signature change that a device with the app installed
cannot be talked out of: it would have to be reinstalled by hand.

The local path still exists, and is the right one for a dry run or an emergency. It follows the same
steps the train takes, so a hand-published version is not a different shape:

```powershell
node scripts/android-release.mjs --plan             # what would ship, and why
node scripts/android-release.mjs --apply           # write the version, the notes and the changelog
npm run android:publish                             # add --dry-run to see everything and touch nothing
# the bytes first: the bucket is what the site serves (ADR-0047)
curl -X POST "$env:SUPABASE_URL/storage/v1/object/android/royaraqamia-1.1.0.apk" `
  -H "Authorization: Bearer $env:SUPABASE_SERVICE_ROLE_KEY" `
  -H "Content-Type: application/vnd.android.package-archive" `
  -H "x-upsert: false" --data-binary "@<staged>\royaraqamia-1.1.0.apk"
# and the release, which is the archive
gh release create android-1.1.0 <staged>\royaraqamia-1.1.0.apk `
  --title "android-1.1.0" --latest --target main
git add -A android/shell-version.properties android/release-notes public/android
git commit -m "chore(android): release 1.1.0 (20100)"
```

`android:publish` prints those commands with the values already in them, so the numbers above are what
it would say for that version rather than something to retype.

The asset name is load-bearing: the manifest's URL ends in it, the bucket object and the release asset
carry it, and `android:publish` stages a copy under exactly it. Both uploads refuse to replace an existing
name — the bucket with `x-upsert: false`, the release with the rule in `android-release.yml` — which is
the immutability guarantee, in the two commands where a person could otherwise undo it.

**What remains is not code.** The APK on any device today predates this, so the first update still has to
be installed by hand (or by a store) — after that the loop closes itself. And declaring
`REQUEST_INSTALL_PACKAGES` rules the shell out of Google Play while it updates itself, which is
consistent with where this project is pointed (item 3 above).

The counter is what the check compares, so a bump with no published APK tells shells nothing (the
published code is not ahead of theirs) — the safe direction. A manifest test refuses a manifest that
names an APK newer than the counter in the tree.

**Counter notes.** It starts at 20000: the previous scheme derived `versionCode` from the site version
(`1.91.0` → 19100), and a device with that build installed refuses anything lower — the first drill
ended in `INSTALL_FAILED_VERSION_DOWNGRADE` against `1.88.4` with a counter of 1.

## The recitation in the shell

The site's player works in a browser because a page that is playing audio is not suspended. The shell is
different: `BridgeActivity.onPause` pauses the WebView, so the JavaScript queue stops at the end of the
Ayah that is playing. The shell therefore plays the recitation itself (ADR-0086).

- `QuranPlaybackService` is a media3 `MediaSessionService` with an ExoPlayer. It owns the queue, the
  system notification, the lock screen, the media keys and the seek bar. `android:stopWithTask="false"`
  is what makes a swiped-away app keep playing; Stop (the notification's action or the page's) clears the
  resume record and ends the service.
- `QuranPlayerPlugin` is the page's controller. It connects a media3 `MediaController`; the standard
  commands are play/pause/seek/skip, and `loadSurah`, `keep`, `keepState`, `stop` are custom commands
  advertised in `onConnect`. State arrives as a `state` event shaped like the web engine's; `state()` is
  the resync after a frozen WebView returns.
- That controller is built and driven **only on the main looper**. media3 asserts that every
  `MediaController` call arrives on the looper the controller was built on, and Capacitor invokes a
  plugin method on its own bridge looper: a controller built there half-connects (`addListener`
  throws), so the load never reaches the service and the page reports a streamable sura as «غير
  محفوظة على هذا الجُهاز», and the next press throws `IllegalStateException` from
  `sendCustomCommand` on the main thread, which kills the process. Every method posts through one
  helper, and `scripts/__tests__/quran-player-thread.test.mjs` holds it there (#626).
- The service reads the site's committed manifests (`/quran/audio/ar.alafasy/NNN.json`) from the origin
  the WebView is on, caches them under `filesDir/quran-manifests`, and prepares the next sura itself.
- Kept copies live under `filesDir/quran-audio` with the web store's key, sha256 gate and 128 MiB LRU. A
  metered connection skips the keep; a keep asked for while another is running waits.
- Permissions: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`,
  `ACCESS_NETWORK_STATE`, and the existing `POST_NOTIFICATIONS` (a device that refused it plays, but the
  shade has no controls). The channel is `quran_playback`.
- The page's controller ships with the web build, so a shell that already carries the service picks up
  controller changes from the site; after that only a native change needs a counter bump.
- `src/debug/AndroidManifest.xml` allows cleartext so a build pointed at a local dev server
  (`CAPACITOR_SERVER_URL`) can read that server's manifests; release does not.

`npm run android:test` covers the manifest reader and the store on the JVM. The service, the notification
and the controller need a device: install the debug APK, play, turn the screen off, swipe the app away,
and use the notification's controls.

## Where the plan this came from was wrong

The original conversion plan has five defects worth not repeating:

1. `import type { CapacitorConfig } from '@capacitor-cli/types'` — the real module is
   `@capacitor/cli`.
2. `keytool … -keystore my-release-key.idsig` — `.idsig` is an APK Signature Scheme v4
   signature, not a keystore. Use `.jks`/`.keystore`.
3. `apksigner sign … app-release.aab` — `apksigner` signs APKs and cannot sign an AAB. An
   AAB is signed by Gradle from a `signingConfig` (or `jarsigner`).
4. `cleartext: true` + `allowMixedContent: true` — both are pointless against an
   HTTPS-only origin and weaken the WebView. Both are `false` here.
5. Bluetooth + Contacts permissions — no surface in this app reads contacts or scans for
   devices; `READ_CONTACTS` is a Play sensitive permission. Plugins are installed, no
   permissions are declared.
