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
npm run android:assets    # regenerate launcher icon + splash from public/icons (after `npm run icons`)
npm run android:apk       # debug APK   → android/app/build/outputs/apk/debug/app-debug.apk
npm run android:release   # signed APK  → android/app/build/outputs/apk/release/app-release.apk
npm run android:aab       # signed AAB  → android/app/build/outputs/bundle/release/app-release.aab
npm run android:verify-bridge   # on a connected device: is the native bridge live?
```

The launcher icon and splash are generated from `public/icons/icon-1024x1024.png`, the
same artwork the PWA ships, so the two installs look like one product: one purple, one logo.
How large the logo _reads_ is a chosen number, `TARGET_DISC_RATIO` (0.64) — the middle the owner
picked after being shown the two extremes on the emulator: 76% with the artwork drawn across the
adaptive canvas, 52% inset to the 72dp safe zone. The extremes exist because the launcher draws
the adaptive canvas's visible centre magnified, measured at **1.47x** on the API 30 Pixel
Launcher, so that one surface divides the magnification out (`ADAPTIVE_ARTWORK_SCALE`) while the
notification icon, the legacy and round launcher icons and the splash logo scale the artwork
instead, cropping purple. The PWA's own icon set keeps the artwork's 51.7%, since that is what
the installed PWA's icon is drawn from. The splash draws the disc on `#0f172a`, because nothing
masks a splash and the square tile was the one place the logo appeared square.
`scripts/generate-android-assets.mjs` does this by hand rather than through
`@capacitor/assets`, whose transitive `tar` carries a critical advisory that would fail
`security-scan.yml`'s `npm audit --audit-level=high`. It measures every asset it writes
against its surface's target and exits non-zero on a miss, and
`scripts/__tests__/icon-shape.test.mjs` holds the committed files to the same proportions in
`npm test` (`scripts/logo-shape.mjs` is the measurement both use).

The splash is **one logo drawable and an XML layer-list**, not a bitmap per screen
(`drawable/splash.xml` + `drawable-xxxhdpi/splash_logo.png`). That is forced by the plugin, not
chosen: on launch it hands the drawable to `setBackground` on a view
(`SplashScreen.java`), so a bitmap is stretched to fill, `androidScaleType` never applies
([its docs say so](https://github.com/ionic-team/capacitor-plugins)), and our 1:2 frames came
out 190x180px on the API 30 emulator. A layer-list draws its item by gravity at a declared dp
size instead, so the disc cannot be stretched by any screen shape — and the launch theme uses
the same resource as the starting window, which is the surface a cold start actually shows
first. It is 96dp, the size the frames were designed around. On **Android 12+ none of this
renders at launch**: the platform splash draws the launcher icon itself in a **160dp**
visible circle, so the two OS families show different splash sizes rather than two logos in a
row. Removing the plugin entirely settles that and drops the last splash-specific asset —
[#212](https://github.com/royaraqamia/royaraqamia/issues/212).

Install on a device or emulator:

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

Point the shell at a local dev server (an emulator reaches the host on `10.0.2.2`):

```powershell
$env:CAPACITOR_SERVER_URL = 'http://10.0.2.2:3000'; npm run android:apk
```

`versionsName`/`versionCode` come from `package.json#version` at Gradle configure time —
`versionCode = major * 10000 + minor * 100 + patch`. The Play Store will not accept a
version _name_ as a version code, so the mapping lives in `android/app/build.gradle`.

## What the shell wires up

| Capability                           | Where                                                 | State                                                                                  |
| ------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Load the live site                   | `capacitor.config.ts` `server.url`                    | Working                                                                                |
| Announcing web updates               | `frontend/ui/shared/update-prompt.tsx`                | Working — in-page, so it shows in the shell too                                        |
| Deep links (App Links + `royar://`)  | manifest intent filters, `MainActivity.webUrlFor`     | Working                                                                                |
| Custom-scheme OAuth return           | manifest + `MainActivity`                             | Working — needs two Supabase allowlist entries (below)                                 |
| Splash, status bar, RTL, back button | `capacitor.config.ts` plugins, `MainActivity`         | Working                                                                                |
| Native file save / share             | `@capacitor/filesystem`, `@capacitor/share` installed | Installed, unused by app code yet                                                      |
| Biometric lock                       | `@capgo/capacitor-native-biometric` installed         | Installed, unused by app code yet                                                      |
| Bluetooth LE + Contacts              | plugins installed, **no manifest permissions**        | Scaffolding only, by decision                                                          |
| Push (FCM)                           | `@capacitor/push-notifications` + manifest            | Native side ready; server side blocked on credentials — see "Push notifications" below |

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

### 4. Announcing a shell update: the page-side contract

The page announces web builds on its own (ADR-0042), but it cannot install an APK. The shell therefore
owns its own announcement, and the two must not both speak: `MainActivity` publishes

```js
window.__royaraqamiaShell = { versionCode: 1234, updatePending: true };
```

before the page loads, and `frontend/shared/shell-update.ts` reads it. While `updatePending` is true the
in-page prompt stays down, because installing the APK brings the new web build with it. Absent (a
browser, or a shell that does not set it) reads as "no shell update pending".

The native half is **not built**. When it is, the shape that fits this repo — a directly distributed
APK, no Play account (open item 3) — is: the shell compares its own `versionCode` against a published
manifest, and when it is behind it offers to download and install that APK itself
(`REQUEST_INSTALL_PACKAGES`, a `FileProvider` URI, and `ACTION_VIEW` for
`application/vnd.android.package-archive`). Two constraints worth carrying into that work: only a build
signed with the same key can update an installed app (which is why the keystore backup at the top is not
optional), and the shell needs its **own** version counter — `versionCode` derived from
`package.json#version` moves on every web release, which would announce an APK that does not exist
every time the site deploys.

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
