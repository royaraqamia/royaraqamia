# A shell that cannot ask for the camera says so

Tapping **تشغيل الكاميرا** in the Android shell answered with the site's browser wording —
_allow the camera from your browser settings, or upload an image_ — on a phone where no
setting could have allowed it.

The permission was never declared. Measured on the API 30 emulator against the published `1.0.4`
shell (`20004`):

```
adb shell dumpsys package com.royaraqamia.app
  requested permissions: INTERNET, REQUEST_INSTALL_PACKAGES, POST_NOTIFICATIONS, …
  → no android.permission.CAMERA

node scripts/verify-bridge.mjs --eval \
  "navigator.mediaDevices.getUserMedia({video:true}).then(()=>'ok').catch((e)=>e.name)"
  → NotAllowedError                      (immediately; no dialog was drawn)
```

The same call, once the manifest declares the permission, on `1.0.6` (`20006`) installed on the
Pixel_5 AVD:

```
adb shell uiautomator dump
  → "Allow رؤيَة رقَميَّة to take pictures and record video?"
     [While using the app] [Only this time] [Deny]

node scripts/verify-bridge.mjs --eval "navigator.mediaDevices.getUserMedia({…})"
  → {"ok":true,"label":"camera2 0, facing back","readyState":"live",
     "settings":{"facingMode":"environment","frameRate":30,"width":640,"height":480}}
```

So the fix is two things a person can see: the package asks, and Android answers with a dialog
that names the app.

**Why.** The WebView raises `VIDEO_CAPTURE`, and Capacitor's
`BridgeWebChromeClient.onPermissionRequest` maps that to `Manifest.permission.CAMERA` and
launches Android's own runtime request (`BridgeWebChromeClient.java:102-124` in
`@capacitor/android` 8.5.3). A permission the installed package does not declare is refused
before a dialog is drawn, so that callback sees "not granted" and calls `request.deny()`;
Chrome then rejects `getUserMedia` with `NotAllowedError` — the same name a visitor's own
refusal produces, which is what made the two indistinguishable from the page.

**The message was the second half of the bug.** `frontend/ui/scan/scan-page.tsx` turned that
`NotAllowedError` into _allow the camera from your browser settings_. That is the right advice
in a browser and impossible in the shell: the permission belongs to the app, and a build whose
manifest does not ask for it cannot be granted it by any screen the visitor can reach.

**The decision.** `android/app/src/main/AndroidManifest.xml` declares
`android.permission.CAMERA`, with `android.hardware.camera` `required="false"` so a device
without a camera is not filtered out of the download and the page's `NotFoundError` answer stays
reachable. The page keys the denial wording on the shell's own counter: below `20006` the shell
cannot ask, so it is told to update — which the shell already offers natively (ADR-0044) — and
from `20006` the request did reach Android, so the message names the app's permission in system
settings. `shellVersionFromUserAgent` (ADR-0046) is what makes the two cases readable, and the
counter in `android-shell-version.properties` moves with the manifest (ADR-0043) so the site and
the APK cannot disagree about which build can ask.

## Considered Options

- **A native camera plugin** (`@capacitor/camera`, or a Cordova barcode plugin). Rejected:
  decoding is the page's job by decision (ADR-0034, ADR-0035) — the overlay, the torch control,
  the WASM fallback and the upload path all live in the page, and a plugin would add a second
  path that does part of it worse, on exactly the old devices where the WebView is the problem.
- **Asking for the camera at app launch.** Rejected: a prompt during start, for a page the
  visitor may never open, is the kind that gets refused — and a refusal there is sticky.
- **Hiding the camera button below `20006`**, the way ADR-0050 withholds the push plugin.
  Rejected: there is nothing native to withhold — the camera is a web API plus one manifest line
  — and the button is where the explanation appears. Push had to be withheld because reaching
  it killed the process; here the honest surface is the refusal itself.
- **Raising `public/android/latest.json`'s `minSupportedVersionCode` so every older shell is
  told it is unsupported.** Rejected: it declares the whole app broken for a Scanner problem
  that the upload fallback already works around, and it would nag users who never scan.
- **Fixing the manifest only.** Rejected: the installed base is the point. Someone whose phone
  will not take the update for months keeps the browser wording, and that message is the only
  surface that can tell them the app itself has to change.

## Consequences

The manifest half ships when a device installs `1.0.6`; the copy half ships on the next web
deploy, so the message is right before the APK arrives. Every shell already installed stays
unable to open the camera until it updates — no web deploy can grant a permission that is not
in the installed package.

This is the first manifest permission the shell declares for a web feature. The shape to copy
for the next one (microphone, geolocation, …): declare the permission, add `uses-feature
required="false"` when the page can work without the hardware, and let the page name the
capability gap from the user agent instead of promising what the installed build cannot do.

`uses-feature` is worth the two lines: a declared permission implies its hardware unless it is
declared otherwise, and the shell's upload path is real for someone with no camera at all.
