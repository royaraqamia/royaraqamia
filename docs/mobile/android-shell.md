# Android shell (APK / AAB)

The site ships as an Android app through Capacitor. It is a **remote-URL shell**: the
WebView loads `https://royaraqamia.com` instead of bundling a static export of it.

That is forced by the app, not chosen for convenience. Every product surface is
server-rendered, uses Server Actions, and authenticates with Supabase cookies
(`controller → service → repository`); `next export` produces nothing that runs. A
bundled shell would also move pages onto a `https://localhost` origin, where our own
CSP (`default-src 'self'`), Supabase cookie auth and the offline-first service worker
(ADR-0027…0030) all stop matching. The reasoning, and what it costs, is ADR-0036.

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
(`#0f172a`, the colour the WebView paints, so the handover shows no colour change),
`windowSplashScreenAnimatedIcon` (`@drawable/splash_icon`) and `postSplashScreenTheme`. Android 12+
draws that natively; `androidx.core:core-splashscreen` draws the same theme below it, which is why
`MainActivity` calls `installSplashScreen()` before `super.onCreate`. Neither family leaves a
duration of ours to keep in step: the platform dismisses the splash when the app draws its first
frame — this shell loads a remote URL, so a fixed duration had no relationship to when the WebView
was ready.

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

Install on a device or emulator:

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

Point the shell at a local dev server (an emulator reaches the host on `10.0.2.2`):

```powershell
$env:CAPACITOR_SERVER_URL = 'http://10.0.2.2:3000'; npm run android:apk
```

`versionsName`/`versionCode`: `versionName` is `package.json#version` plus the shell counter
(`1.91.0+shell.1`), which is what a support conversation wants — the site build and the native build in
one string. `versionCode` is **only** the counter, from `android/shell-version.properties`, and moves
only when the shell itself changes (ADR-0043): deriving it from `package.json` would make every web
deploy look like a new APK to the update check that compares it against `public/android/latest.json`.
`npm run android:shell-version` reads it, `-- --bump` moves it, and
`.github/workflows/shell-version.yml` fails a pull request that changed the shell without moving it.

`npm run android:test` runs the shell's JVM tests — the update decision and the download that verifies
what may be installed. `.github/workflows/shell-tests.yml` runs them on any pull request that touches
`android/**`, `capacitor.config.ts`, or the scripts that feed them, so they are checked where the shell
changes rather than only on the machine that wrote them.

## What the shell wires up

| Capability                                      | Where                                                                 | State                                                                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| capability                                      | where                                                                 | state                                                                                                                             |
| ------------------------------------            | -----------------------------------------------------                 | --------------------------------------------------------------------------------------                                            |
| Load the live site                              | `capacitor.config.ts` `server.url`                                    | Working                                                                                                                           |
| Offline / unsupported fallback                  | `capacitor.config.ts` `server.errorPath`, `android.minWebViewVersion` | Working — a bundled page with retry or update copy (ADR-0067)                                                                     |
| Announcing web updates                          | `frontend/ui/shared/update-prompt.tsx`                                | Working — in-page, so it shows in the shell too                                                                                   |
| Announcing a new APK                            | `ShellUpdatePrompt`, `public/android/latest.json`                     | Working — a native dialog, and it installs in place (ADR-0044); `/account` re-checks on demand                                    |
| Deep links (App Links + `royar://`)             | manifest intent filters, `MainActivity.webUrlFor`                     | Working                                                                                                                           |
| Custom-scheme OAuth return                      | manifest + `MainActivity`                                             | Working — needs two Supabase allowlist entries (below)                                                                            |
| Splash (platform), status bar, RTL, back button | launch theme, `capacitor.config.ts` plugins, `MainActivity`           | Working                                                                                                                           |
| Native file save / share                        | `@capacitor/filesystem`, `@capacitor/share` installed                 | Installed, unused by app code yet                                                                                                 |
| Biometric lock                                  | `@capgo/capacitor-native-biometric` installed                         | Installed, unused by app code yet                                                                                                 |
| Bluetooth LE + Contacts                         | plugins installed, **no manifest permissions**                        | Scaffolding only, by decision                                                                                                     |
| Push (FCM)                                      | `@capacitor/push-notifications` + manifest + `google-services.json`   | Working — the client config is committed (ADR-0050); the server side needs three Vercel variables, see "Push notifications" below |
| Camera (the Scanner)                            | manifest `CAMERA` + `frontend/ui/scan/scan-page.tsx`                  | Working — declared from `1.0.6` (`20006`); an older shell is told to update (ADR-0053)                                            |
| Background drain                                | `SyncScheduler`, `SyncFlushWorker`, `public/sync-flush.html`          | Working — WorkManager loads the drain page in a headless WebView, replays the Outbox and pulls what it can                        |
| Background wake (FCM)                           | `SyncMessagingService`, `ShellSyncWake`, `POST /api/push/wake`        | Working — a delivered write wakes the account's other devices with a silent data message; a force-stopped app waits for the floor |

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

The page reads `Chrome/<major>` from its own user agent:

- **below 111** — the update copy, with the installed and required versions and no retry: the site
  cannot run until the WebView is updated.
- **otherwise** — the offline copy and an «إعادة المحاولة» link to `https://royaraqamia.com`. A tap is
  one navigation. If the site is still unreachable, Capacitor serves this page again — one attempt per
  tap, not a loop. There is no timer, no `online` listener and no automatic `location` write.

The inline script is **ES5** on purpose: the page is shown precisely on WebViews that cannot parse the
site. Its two IBM Plex Sans Arabic `.woff2` files are the site's own, copied beside it, and the palette
is the card's from `res/values/colors.xml`. `scripts/__tests__/shell-fallback.test.mjs` pins the config
to the page, parses the script as ES5, refuses automatic navigation, and compares the bundled fonts with
`public/fonts/`.

The API 30 image's WebView is 83.0.4103.106, which is below the floor — the same image that used to
render the site without hydrating. A launch there now shows the update card instead of that blank page.
Measured with the debug APK at counter `20011`:

| Step                                   | What the device showed                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Cold launch                            | WebView target `https://localhost/unavailable.html`; «يلزم تحديث عرض النظام»; «عرض النظام: 83 · المطلوب: 111 أو أحدث»; no retry action |
| The card on the 320px image            | the heading, body and version line all fit inside the card's 320px gutter; the gradient wordmark is above it                           |
| Offline attempt (UA overridden to 120) | `location.href` is `https://localhost/unavailable.html`; «تعذَّر فتح الموقع» and an «إعادة المحاولة» link are shown                    |
| Four seconds later                     | URL still `https://localhost/unavailable.html` — one main-frame error produced one page load, not a reload loop                        |
| Retry after reconnecting               | the «إعادة المحاولة» link navigated to `https://royaraqamia.com/`; the site's server-rendered text was present                         |

The offline copy was exercised by overriding the running WebView's user agent to `Chrome/120` in
DevTools, because the only installed image is 83 and would otherwise be stopped by the floor before a
navigation was attempted; the engine stayed 83, which is enough to prove the page's branch, the link and
the absence of a loop, not to claim the site hydrates on 83.

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

| What the device showed              | Evidence                                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Both schedules registered           | `dumpsys jobscheduler`: two jobs on `androidx.work…SystemJobService`, `initial backoff +30s`                                                  |
| The bridge is live in the page      | from the page itself: `typeof window.RoyShellSync.schedule === 'function'`                                                                    |
| An attempt loads the drain page     | the worker's WebView appears as a `sync-flush.html` target in `adb forward …/json`, and `logcat` carries its `page: …` console line           |
| A page that says nothing comes back | `RoySyncFlush: queued another attempt: the page reported nothing (the drain page did not report within 60000ms)`                              |
| A clean report ends the attempt     | `e2e/sync-flush.spec.ts` loads the same page against a production build and gets `pending: 0`, one replayed intent, and the row on the server |

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

### The drain drill

`scripts/shell-drill.mjs` is that whole arrangement as one command (`npm run android:drill`). It exists
because the first version of this section was four throwaway scripts (`.drill.mjs`, `.probe*.mjs`) and
the next person wrote them again: the knowledge was here, the driver was not.

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
worker. No script can make the API 30 image do more than the worker half in the table above.

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
for the two environmental reasons above. `--matrix` fills the three rows that do not need a person
pressing buttons:

| Case                    | What it does                                                                                                     | What it proves                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Force-stop              | queues offline, `am force-stop`, restores the radio, waits a minute, launches                                    | nothing arrives before the launch, and the launch then delivers exactly one habit         |
| Doze                    | queues offline, `am kill`s, forces `mState=IDLE`, restores the radio, waits a minute, releases                   | the `CONNECTED` job is deferred while idle, and the release drains exactly one            |
| Process death mid-flush | queues offline, `am kill`s, restores the radio, `SIGKILL`s the process the moment the worker starts it, launches | the queue survives an interrupted drain, and the retry leaves exactly one habit — not two |

```powershell
npm run android:drill -- --device <serial> --matrix
```

Three constraints, all of them things a short run would otherwise measure dishonestly:

- **Doze is a deferral test, not a 15-minute clock.** The floor is `PERIOD_MINUTES = 15` in
  `SyncScheduler.java`, which WorkManager enforces; what the case watches is that the forced-idle
  device runs no worker at all, and that releasing it drains. Timing the period belongs to the
  manual row below, with the phone left alone for a quarter of an hour.
- **A case the device refuses is recorded as `skipped`, never as a pass.** An OEM that ignores
  `force-idle`, a build where `run-as` cannot signal the app, a drain that starts and finishes
  before the kill lands — each prints the device's own words in the table.
- **The radio and doze are restored in a `finally`,** so a failed case leaves the phone usable and
  the next case still starts from a network.

The cases that stay manual, and why:

- **The FCM wake** needs a Firebase-enabled build _and_ the server-side service account: with FCM
  unconfigured (which `.env` leaves it) `POST /api/push/wake` answers `202` and sends nothing, so a
  scripted wake would "pass" by never happening. Watch it land with `adb logcat -s RoySyncFlush:*`
  after a write from a second device.
- **Low storage / a full quota, a worker swap mid-queue and several tabs** are browser behaviours
  first (`docs/specs/offline-first.md`, Verification) whose device form needs a person to fill the
  disk, update the shell mid-queue, or open a second tab — nothing here can judge what the phone
  did.

The run prints its three rows as a markdown table; paste them over the three scripted rows below.
A row that says `_(manual)_` has not been measured by anything, and should not read as if it had.

| Case                     | Expected                                                                 | Observed            |
| ------------------------ | ------------------------------------------------------------------------ | ------------------- |
| Force-stop               | nothing until launch                                                     | _(run `--matrix`)_  |
| Doze                     | deferred while idle, drains after release                                | _(run `--matrix`)_  |
| Process death mid-flush  | one habit, no duplicate                                                  | _(run `--matrix`)_  |
| FCM wake, backgrounded   | the drain runs without the app being opened                              | _(manual)_          |
| FCM wake, killed         | the drain runs from a closed process                                     | _(manual)_          |
| 15-minute floor          | a queued write drains within one period, with no signal                  | _(manual, 15+ min)_ |
| No network at launch     | the shell opens, the queue waits, and it drains when the network returns | _(manual)_          |
| Low storage / full quota | the failure is visible and the write is not silently lost                | _(manual)_          |
| Worker swap mid-queue    | the queue survives the swap and each intent is delivered once            | _(manual)_          |
| Several tabs             | one intent per write, not one per tab                                    | _(manual)_          |

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
adb logcat -s RoySyncFlush:*   # what the worker did with the wake, or with its floor
# Exactly one MESSAGING_EVENT service, and it is com.royaraqamia.app.SyncMessagingService:
Select-String -Path android/app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml -Pattern 'MESSAGING_EVENT'
```

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
from `android/shell-version.properties` rather than from `package.json`. `ShellUpdatePrompt` asks the
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
`muted-foreground`, for the secondary — and the values are the site's tokens restated in
`android/app/src/main/res/values/colors.xml`, each with the CSS declaration it came from written above
it. The shell is dark-only and RTL on every device, because the site is: both questions were previously
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

**Publishing releases itself.** `.github/workflows/shell-release.yml` runs on any push to `main` that
touches `android/**`, `capacitor.config.ts`, `package.json` or `package-lock.json`, and on a manual
dispatch. A Capacitor plugin dependency is a shell change (ADR-0043), so without those last two a plugin
bump could be required to move the counter and then never publish it. In order:

1. **A verdict** — the counter in `android/shell-version.properties` against the manifest that is
   published. A push that changed nothing native, or a re-run, stops here in about ten seconds with
   `publish=false` and the reason why.
2. **The shell's JVM tests**, so nothing lands on main without them.
3. **The build and the stamp** — `npm run android:publish --json`, signing the release APK with the
   keystore from repository secrets and writing the file's real `versionCode`, size and SHA-256 into
   `public/android/latest.json`. Before it builds, the run asks the bucket whether this version's file
   is already there: if it is, those bytes are adopted and stamped instead, because a rebuild is not
   byte-identical (ADR-0069).
4. **The uploads** — the APK goes to the Supabase Storage bucket first, because that is what the site
   serves, and then to its own release, `android-1.0.3`, one release per version, holding
   `royaraqamia-1.0.3.apk`, titled with its own tag so the releases list and the tags list cannot
   disagree. The tag in a published URL belongs to one version and is never repointed at other bytes.
   A bucket object or a release that already exists is a re-run: the run adopts the bytes storage
   already holds — after checking them against the release — and refuses anything that disagrees with
   them. The release asset is replaced only when no committed manifest has ever named it.
5. **The re-download** — the URL the manifest names, `https://royaraqamia.com/android/royaraqamia-1.0.3.apk`,
   is fetched from outside and hashed before anything is announced (ADR-0047). That is the path a device
   takes — the site's rewrite to the bucket — so the check is also what proves the rewrite serves the file.
   Until this step existed, the only thing that had ever seen the uploaded file was the machine that
   uploaded it.
6. **The manifest commit** — `chore(android): publish shell 1.0.3 (20003)`, pushed by CI after a
   release commit has appeared on `main` (both write there, and the manifest is the one that can wait),
   so the deploy serves it.

Failing at 3–5 leaves the published channel exactly as it was. Failing at 6 leaves the asset uploaded and
the manifest stale — the safe direction, because nobody is told about an APK whose bytes were not
verified, and re-running finishes it by adopting the bytes already in storage instead of rebuilding
them (ADR-0069). Only `main` publishes; a dispatch on a branch can rehearse with `dry_run` (build and
sign, upload nothing).

**The version, and where a user sees it.** `shellVersionName` sits beside the counter and is _derived_ from
it — `1.<minor>.<patch>` from `(counter − 20000)`, so counter 20003 is version `1.0.3` — which means
`npm run android:shell-version -- --bump` writes it and nobody types it. `--check` fails a tree where the
two disagree, and publishing refuses an APK whose own `versionName` is not the derived name, so Gradle and
the script cannot drift. It reaches a user in two places, both only inside the app (ADR-0046):

| Where                     | How                                                                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android's app info screen | the APK's `versionName`, so the platform shows it for free                                                                                                                                                            |
| `/account`'s footer       | the shell's user agent, `RoyaraqamiaShell/1.0.3+20003` — the name alone, on the account area's front page only; a browser sends no token, and a shell built before it carried a name has none, so both render nothing |

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

The local path still exists, and is the right one for a dry run or an emergency:

```powershell
npm run android:shell-version -- --bump        # in the pull request that changes the shell
npm run android:publish                        # add --dry-run to see everything and touch nothing
# the bytes first: the bucket is what the site serves (ADR-0047)
curl -X POST "$env:SUPABASE_URL/storage/v1/object/android/royaraqamia-1.0.4.apk" `
  -H "Authorization: Bearer $env:SUPABASE_SERVICE_ROLE_KEY" `
  -H "Content-Type: application/vnd.android.package-archive" `
  -H "x-upsert: false" --data-binary "@<staged>\royaraqamia-1.0.4.apk"
# and the release, which is the archive
gh release create android-1.0.4 <staged>\royaraqamia-1.0.4.apk `
  --title "android-1.0.4" --latest --target main
git add public/android/latest.json; git commit -m "chore(android): publish shell 1.0.4 (20004)"
```

`android:publish` prints those commands with the values already in them, so the numbers above are what
it would say for that version rather than something to retype.

The asset name is load-bearing: the manifest's URL ends in it, the bucket object and the release asset
carry it, and `android:publish` stages a copy under exactly it. Both uploads refuse to replace an existing
name — the bucket with `x-upsert: false`, the release with the rule in `shell-release.yml` — which is the
immutability guarantee, in the two commands where a person could otherwise undo it.

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
