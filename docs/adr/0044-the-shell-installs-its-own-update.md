# The shell installs its own update

ADR-0043 gave the shell a version of its own, a published manifest to compare it with, and a prompt
that told a user a newer APK existed. It stopped at the last step: the dialog opened the published URL
in a browser, and what happened next was between the user and GitHub. On a device where nothing
installs APKs by hand, that is where the update story ended.

This is the rest of it. Four decisions, each of which had a cheaper version that the platform or the
drill ruled out.

**The download is ours, and nothing is offered that does not hash to what the manifest published.**
`ShellDownload` streams the APK into app-private storage, counting bytes and hashing as it goes, and
only renames the file into place once the size and the SHA-256 match. A manifest with no usable hash
installs nothing at all: the point of the check is the file that is about to be handed to the installer,
and "it arrived over https from GitHub" is not a check. The rename is also the only moment a file
becomes readable at the target path, so a reader never sees a half-written APK, and every failure path
deletes the partial file — the directory holds either the verified file or nothing.

**The install belongs to the platform, and we cannot do it without the user.** Android's package
installer is the only thing that may install, and from Android 8 the permission to hand it an APK is
per app and can only be granted by the user in Settings. So the button does not fail when that
permission is missing: it shows a toast saying what to change, opens
`ACTION_MANAGE_UNKNOWN_APP_SOURCES` for this package, and remembers that the user asked. The drill
measured what happens next, and it is not what the code was written expecting: **granting the setting
kills the app.** The process was the same one before and while the user was in Settings (`pid 6668`) and
gone the moment the toggle moved — Android restarts an app whose install permission changes — so the
parked install went with it and the shell asks again on the next launch. The second tap goes straight
through, because the verified file is still on disk. `resume()` is kept for the case where the process
does survive the trip (nothing is granted, or a platform that does not restart): it is six lines, and
without it that case would need a third tap for no reason.

**The file reaches the installer through the provider that is already there.** `FileProvider`
(`${applicationId}.fileprovider`) exposes a new `external-files-path` for `updates/`, and the install
intent is `ACTION_VIEW` with `application/vnd.android.package-archive` and
`FLAG_GRANT_READ_URI_PERMISSION`, which is the supported spelling from Android 8. `minSdk` is 24, so
`ACTION_INSTALL_PACKAGE` remains as the fallback, marked deprecated at its call site rather than
pretended away.

**Plain http is allowed for a development host, and only in a debug build.** The emulator reaches its
host on `10.0.2.2`, and every real defect in this feature so far was found by a device drill rather
than by a test — the version-code downgrade, the missing Capacitor bridge, the manifest with a
byte-order mark. An install path that could only be exercised by publishing to GitHub first would not
be exercised. `ShellUpdate.isAllowedUpdateUrl` takes the build's `DEBUG` flag, so a release build
accepts nothing but https, and the check is unit-tested in both directions.

**Publishing is a command that cannot type the numbers wrong.** `npm run android:publish` builds the
signed release APK, reads `versionCode`/`versionName` out of it with `aapt2`, reads the signing
certificates with `apksigner`, and writes `public/android/latest.json` with the file's real size and
SHA-256. It refuses four things that were previously silent mistakes: an unsigned APK (which is what a
release build without `keystore.properties` produces), a signature that `public/.well-known/assetlinks.json`
does not list (a device with the app installed could not install it, and its App Links would stop
verifying), a `versionCode` that disagrees with `android/shell-version.properties` (the counter CI
checks and the APK users get are then different claims), and a published version going backwards (a
device on a higher build would be told nothing, forever). Uploading the file stays manual, because it
needs the upload keystore and the keystore is the one credential that must not be duplicated.

## Considered Options

- **`DownloadManager`.** The platform's own downloader: a notification, resume across process death,
  and no socket code to write. Rejected because the verification is then a second step far from the
  write — the download finishes into a file whose name we do not choose, a broadcast arrives, and only
  then can the hash be checked, with a window in between where a complete-looking file exists that has
  not been verified. `ShellDownload` is about a hundred lines, and being Android-free is what let its
  real behaviour be tested on the JVM: those tests found a rename that fails on Windows when the target
  exists, and a truncation case the first version of the test did not actually produce.
- **Verifying the transport instead of the file (https, GitHub, and trust).** Rejected: the file is
  handed to the installer, and the manifest is a document that can be edited by anything that can write
  to the site. A hash in the manifest and a check on the device are the two ends of the same claim.
- **A notification instead of a progress dialog.** Rejected for now: the download starts from a dialog
  the user just confirmed and lasts seconds on a normal connection; a notification would add a channel,
  a permission on Android 13+, and a second place for the same state.
- **Serving the APK from our own origin rather than GitHub Releases.** Rejected: a nine-megabyte binary
  in `public/` would be in every deploy and every CDN cache, for a file fetched once per update. The
  manifest stays on our origin, where it is small and must be fresh; the APK is on a host that already
  serves release assets over https.
- **Publishing from CI.** Still no, for the reason ADR-0043 gave: the keystore lives outside the
  repository and duplicating it is a decision about where the backup lives, not a build detail.
  `android:publish` removes the hand-typed numbers, which was the part CI would have been buying.
- **Asking for `REQUEST_INSTALL_PACKAGES` upfront at first launch.** Rejected: it is a permission that
  only matters when there is an update, and a permission asked for at a moment with no reason behind it
  is the one users deny.

## Consequences

`npm run android:test` now covers the whole decision on the JVM: 22 cases across the manifest
(`ShellUpdateTest`) and the download (`ShellDownloadTest`), the latter against a real HTTP server it
starts itself — a body that arrives whole, a body cut short, a body that is not the published one, a
manifest with no hash, an HTTP error, and the reuse of a file verified on an earlier attempt. What is
left to a device is the part a device owns: the permission flow, the progress dialog, the installer,
and the version code afterwards.

The manifest's `sha256` and `sizeBytes` are now load-bearing rather than advisory. A manifest published
by hand without them installs nothing, which is the safe direction, but it is also a silent one: the
prompt appears and the install then fails with «الملف الذي نزَّلناه لا يطابق الإصدار المنشور». The
publish script is the answer to that, and the reason to keep using it.

`REQUEST_INSTALL_PACKAGES` is declared, which rules out Google Play for the shell as long as it installs
its own updates — Play policy forbids an app updating itself outside the store. That is consistent with
where this project is pointed (ADR-0036, and open item 3 in docs/mobile/android-shell.md): the APK is
distributed directly.

The install takes three user actions the first time — our button, the Settings trip, and the installer's
own confirmation — and two afterwards. None of them can be removed by an app that is not the device
owner, which is the point of the platform taking this over.

An update the user declines is not re-downloaded: the verified APK stays in `updates/` and the dialog
after it is free. The prompt itself still comes back at most every six hours, and never while one
install is already in flight.
