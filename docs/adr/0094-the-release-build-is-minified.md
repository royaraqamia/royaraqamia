# The release APK is minified

The shell's release build ran with `minifyEnabled false` from the beginning, which was free while the
APK was a WebView and a dozen Java classes: R8 would have saved a few hundred kilobytes and could only
have broken a release.

ADR-0089 changed the arithmetic. Compose costs about **5.4 MiB** of dex before a single screen exists,
and the release budget in [native-app.md](../mobile/native-app.md) is **20 MiB**. Measured on
2026-10-29, with the same `cap sync` assets in both:

| Build                                                          | Release APK |
| -------------------------------------------------------------- | ----------- |
| `main`, no Compose, unminified                                 | 16.1 MiB    |
| + Compose and the theme, unminified                            | 21.7 MiB    |
| + Compose and the theme, minified, at the merge of this record | 11.4 MiB    |

So the unminified path crosses the ceiling before the first Compose screen is drawn, and every later
phase starts from over budget. The minified path lands the same change at 11.4 MiB, which is **4.7 MiB
under the ceiling and 4.7 MiB smaller than the shell shipped today** — the WebView era's headroom was
being spent on code the app never calls.

## The decision

`release` sets `minifyEnabled true` with `getDefaultProguardFile('proguard-android.txt')` and the
module's own `proguard-rules.pro`. `debug` stays unminified, so a developer keeps stack traces, and
`chrome://inspect` keeps working, which is what the debug build is for.

Nothing else changes: no resource shrinking, no optimisation file, no obfuscation dictionary. R8
renames what it can reach from code and keeps what it cannot.

## What keeps working, and why

Shrinking a Capacitor app breaks in exactly one way if it is done carelessly: Capacitor resolves its
plugin list at runtime from `assets/capacitor.plugins.json`, one `Class.forName` per entry
(`PluginManager.loadPluginClasses`), so a renamed plugin class is a plugin the page can no longer reach.
The classes are kept by the consumer rules Capacitor ships (`-keep public class * extends
com.getcapacitor.Plugin { *; }`), and AGP generates keep rules for everything the merged manifest names.

Verified at the measured build, against `app/build/outputs/mapping/release/mapping.txt`, where a kept
class maps to itself:

- all ten plugin classes in `capacitor.plugins.json` keep their names,
- `MainActivity`, `SyncMessagingService` and `QuranPlaybackService` (the manifest's own components)
  keep theirs,
- `QuranPlayerPlugin`, the recitation service and the bridge classes keep theirs,
- the push plugin's own `MessagingService` is renamed, which is correct: this app replaces it with
  `SyncMessagingService`, so it is reachable from nothing.

The app has no other reflective lookup: no `Class.forName`, no `newInstance`, no `getDeclared*` in
`android/app/src/main`. A future one needs a `-keep` rule and a line in `proguard-rules.pro` saying
which name is being protected and why.

## What it costs

- **Stack traces from a release are obfuscated.** `mapping.txt` is written to
  `android/app/build/outputs/mapping/release/` on every release build and is not committed; a crash
  report from a device is only readable beside the mapping from the same build. Nothing currently
  uploads one, so this is a file to keep when a release is published, not a pipeline.
- **`android.util.Log` calls are stripped in release.** They were visible before, because minification
  was off. Diagnostics on a release device were already documented as a debug-build affair; this makes
  it literal.
- **A keep rule is now part of adding a reflective dependency.** The failure mode when one is missing is
  a feature that silently does nothing in release and works in debug, which is exactly the bug this
  record's verification step exists to prevent.

## What this record does not decide

- **Resource shrinking.** `shrinkResources` stays off; the APK's weight is in dex and assets, and a
  resource shrinker that removes a drawable a reflection-built name points at is a second failure mode
  nobody asked for yet.
- **Code optimisation.** `proguard-android.txt` rather than `proguard-android-optimize.txt`, so the
  compiler does not rewrite method bodies while the app is still gaining its first screens.
- **What replaces Capacitor.** Phase 5 of [native-app.md](../mobile/native-app.md) removes it and rises
  above this floor again; the budget check that follows is the same one.
