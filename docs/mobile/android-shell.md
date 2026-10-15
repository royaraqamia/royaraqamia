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

| Capability                                      | Where                                                       | State                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| capability                                      | where                                                       | state                                                                                          |
| ------------------------------------            | -----------------------------------------------------       | --------------------------------------------------------------------------------------         |
| Load the live site                              | `capacitor.config.ts` `server.url`                          | Working                                                                                        |
| Announcing web updates                          | `frontend/ui/shared/update-prompt.tsx`                      | Working — in-page, so it shows in the shell too                                                |
| Announcing a new APK                            | `ShellUpdatePrompt`, `public/android/latest.json`           | Working — a native dialog, and it installs in place (ADR-0044); `/account` re-checks on demand |
| Deep links (App Links + `royar://`)             | manifest intent filters, `MainActivity.webUrlFor`           | Working                                                                                        |
| Custom-scheme OAuth return                      | manifest + `MainActivity`                                   | Working — needs two Supabase allowlist entries (below)                                         |
| Splash (platform), status bar, RTL, back button | launch theme, `capacitor.config.ts` plugins, `MainActivity` | Working                                                                                        |
| Native file save / share                        | `@capacitor/filesystem`, `@capacitor/share` installed       | Installed, unused by app code yet                                                              |
| Biometric lock                                  | `@capgo/capacitor-native-biometric` installed               | Installed, unused by app code yet                                                              |
| Bluetooth LE + Contacts                         | plugins installed, **no manifest permissions**              | Scaffolding only, by decision                                                                  |
| Push (FCM)                                      | `@capacitor/push-notifications` + manifest                  | Native side ready; server side blocked on credentials — see "Push notifications" below         |

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

Measured on the API 30 emulator, whose WebView is 83.0.4103.106 — i.e. the older path:

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

### 2. Push notifications (FCM) — implemented; credentials are environment state

Web Push (VAPID) does not exist in an Android WebView, so OS-level push uses FCM instead
(ADR-0038). The whole path is in place: `device_push_tokens` (migration
`20261013120000`, RLS own-rows), `POST`/`DELETE /api/push/devices`, the FCM HTTP v1 sender
with the service-account assertion, `PushFanout` delivering to Web Push and FCM together,
and the client half in `frontend/api/push-native.ts` — driven by the same toggle, reached
through the bridge rather than an npm import.

What remains is configuration, not code:

1. **`google-services.json`** in `android/app/` — git-ignored, downloaded from the Firebase
   console for `com.royaraqamia.app`. Without it Gradle logs "Push Notifications won't
   work" and the build still succeeds.
2. **Three environment variables** in Vercel (Production, Preview, Development), from the
   service-account JSON generated under Project settings → Service accounts:
   `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`. The private key is the PEM with
   its newlines escaped as `\n` — that is how the downloaded JSON already carries it, and
   `backend/config/env.ts` normalises it back. With any of the three missing the channel is
   a no-op rather than an error.
3. **A rebuild** of the APK/AAB so the shell picks up the messaging SDK.

The service-account JSON itself must never be committed or dropped next to the keystore
backup: it can send to every device in the project.

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
   `public/android/latest.json`.
4. **The uploads** — the APK goes to the Supabase Storage bucket first, because that is what the site
   serves, and then to its own release, `android-1.0.3`, one release per version, holding
   `royaraqamia-1.0.3.apk`, titled with its own tag so the releases list and the tags list cannot
   disagree. The tag in a published URL belongs to one version and is never repointed at other bytes.
   A bucket object or a release that already exists is a re-run: identical content is reused, different
   content is refused, and the release asset is replaced only when no committed manifest has ever named it.
5. **The re-download** — the URL the manifest names, `https://royaraqamia.com/android/royaraqamia-1.0.3.apk`,
   is fetched from outside and hashed before anything is announced (ADR-0047). That is the path a device
   takes — the site's rewrite to the bucket — so the check is also what proves the rewrite serves the file.
   Until this step existed, the only thing that had ever seen the uploaded file was the machine that
   uploaded it.
6. **The manifest commit** — `chore(android): publish shell 1.0.3 (20003)`, pushed by CI after the
   release train has finished with this commit (both write to `main`, and it refuses to push over a moved
   HEAD), so the deploy serves it.

Failing at 3–5 leaves the published channel exactly as it was. Failing at 6 leaves the asset uploaded and
the manifest stale — the safe direction, because nobody is told about an APK whose bytes were not
verified, and re-running finishes it. Only `main` publishes; a dispatch on a branch can rehearse with
`dry_run` (build and sign, upload nothing).

**The version, and where a user sees it.** `shellVersionName` sits beside the counter and is _derived_ from
it — `1.<minor>.<patch>` from `(counter − 20000)`, so counter 20003 is version `1.0.3` — which means
`npm run android:shell-version -- --bump` writes it and nobody types it. `--check` fails a tree where the
two disagree, and publishing refuses an APK whose own `versionName` is not the derived name, so Gradle and
the script cannot drift. It reaches a user in two places, both only inside the app (ADR-0046):

| Where                     | How                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Android's app info screen | the APK's `versionName`, so the platform shows it for free                                                       |
| The account area's footer | the shell's user agent, `RoyaraqamiaShell/1.0.3+20003` — a browser sends no token, so the footer renders nothing |

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
