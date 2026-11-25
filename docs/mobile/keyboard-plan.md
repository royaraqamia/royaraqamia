# The in-app keyboard: order of work

[ADR-0219](../adr/0219-the-keyboard-is-an-ime-in-the-same-apk.md) decides the shape: a real Android
IME in the existing APK, built on a pinned Apache-2.0 FlorisBoard fork, with an account toggle that
opens the system picker rather than pretending to switch a keyboard silently.
[ADR-0220](../adr/0220-typed-text-is-never-uploaded-without-a-tap.md) bounds the only network feature.
This file is the order of work and the evidence each phase needs before the next one starts. Phase 0
has been built; the device measurements below it have not been taken.

The risk is front-loaded. Phase 0 decides whether the forked engine is good enough at Arabic and
swipe to be worth carrying at all; phase 4 is where privacy and cost can quietly escape. The middle
phases are integration volume.

## Phase 0 findings (2026-11-25)

The upstream was fetched and inspected, but the gate is **not passed**: the engine has the features,
the build does not drop into ours.

- Pinned upstream: FlorisBoard **v0.5.2**, commit
  `2e82060251897226c0739b9f52d1d051b02305fb`. Its `LICENSE` and every source header say
  **Apache-2.0**, not GPL-3.0; only the optional Chinese language packs are GPL-3.0 and they are not
  vendored. ADR 0219 was corrected to match.
- The features are present: an Arabic layout asset and Arabic resources, `GlideTypingManager` for
  gesture typing, and clipboard and media contexts in the IME.
- The build does not match ours: upstream is Gradle 9.2 with Kotlin DSL, version catalogs and
  type-safe project accessors; this repo is Gradle 8.14.3 with Groovy scripts. Upstream also needs
  a `tools` catalog for build tools, NDK and CMake, a Sonatype snapshots repository for a jetpref
  snapshot, the AboutLibraries plugin from the plugin portal, and a Rust toolchain to compile
  `fl_native` through CMake. NDK and CMake are installed here; `cargo` and `rustup` are not.
- Upstream declares `minSdk` 26 where our app declares 24, so the IME would not run on API 24-25
  devices even if the build were adapted.

The upstream build was then adapted on branch `keyboard-ime`: one Groovy module `android/keyboard`
merges the sources, resources and assets of `:app` and all six `:lib:*` modules, with a single
license file and a NOTICE naming the pinned commit. Two substitutions were needed: the jetpref
snapshot no longer exists on Sonatype, so the published 0.3.0-beta02 (same v3 API, commit
`d6e12dda`) is used; the Rust `fl_native` source is vendored but not compiled, because its only
caller is `FlorisApplication.onCreate` and the APK keeps our own Application. The keyboard module
declares minSdk 26; the app stays at 24 with a manifest `tools:overrideLibrary`, so the IME is
simply unavailable on API 24-25. `:app:assembleDebug` succeeds and the merged manifest carries
`FlorisImeService`, `FlorisSpellCheckerService` and the clipboard provider.

The engine decision is therefore closed; the rest of phase 0 is still open: measure the release APK
delta and run the Arabic, swipe and latency gates on the RMX3195 before phase 1 begins.

## Budgets

Proposed targets, to be replaced by measurements at the gate that first reaches them. The reference
device is the **RMX3195** (realme C25s, Android 13, 360 dp, Helio G85, 4 GB), the same phone
[native-app.md](native-app.md) uses. An emulator is a regression comparison, not a sign-off.

| Measure                             | Target                            | Baseline or gate                                                                                                                                          |
| ----------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field focus to first key drawn      | < 150 ms on the RMX3195           | proposed at phase 0                                                                                                                                       |
| Keystroke to committed character    | < 40 ms, entirely on device       | proposed at phase 0                                                                                                                                       |
| Prediction candidates after a word  | < 80 ms, no network               | proposed at phase 2                                                                                                                                       |
| AI tap to suggestion                | < 3 s, hard timeout 5 s           | proposed at phase 4                                                                                                                                       |
| Network packets from the IME typing | 0, in every phase                 | captured on device, asserted by a test                                                                                                                    |
| Release APK size                    | delta recorded, never unexplained | 11.4 MiB before the IME ([ADR-0094](../adr/0094-the-release-build-is-minified.md)); 15,072,211 bytes after the vendored module, minified and R8-processed |
| App cold start                      | no regression past 550 ms         | [native-app.md](native-app.md) budget                                                                                                                     |

## Phase 0 — engine spike and license gate

Nothing ships from this phase. It decides whether the engine is viable.

- Pin one upstream FlorisBoard commit and vendor it into a new `android/keyboard` Gradle module.
  Commit the upstream `LICENSE` and `NOTICE` and the pinned commit hash with it.
- Build the release APK and measure the size delta against the current minified baseline.
- On the RMX3195, enable the unbranded IME and measure first-key latency, keystroke latency, swipe
  acceptance and Arabic caret correctness by editing the middle of an Arabic word in a third-party
  app. A commit that lands at the end of the field is a failed gate, not a polish item
  ([android-shell.md](android-shell.md)).
- Record the numbers in the table above, replacing the proposed targets with measured ones.

**Exit:** the engine passes the Arabic caret test, swipe works, the APK delta is understood, and the
license files are committed. A failure stops the work and reopens the engine decision; it is not a
reason to lower the gate.

## Phase 1 — the IME shell and the account toggle

- Declare the `InputMethodService` from `:keyboard` in the app's manifest and keep the application id
  and signing identity unchanged.
- Add the local bridge that opens the system input-method picker and reads back the system's chosen
  IME. No secure system setting is written by us.
- Add the toggle to the account page in the document, with Arabic copy from the shared contract and
  no user-facing string retyped into Kotlin. It names the action as setting our keyboard as the
  default and states that Android performs the switch.
- No `screens.json`, `parity.json` or parity-plan row: the keyboard is not a port, and the account
  surface remains the document while its ports stay off
  ([ADR-0117](../adr/0117-the-document-is-the-app-until-a-port-is-the-same-screen.md)).

**Exit:** on a real device the control opens the picker, the toggle reflects what Android reports,
and turning it off returns the member to the same system control. `check:copy` and `check:digits`
pass. The pull request carries its Arabic release note.

## Phase 2 — the typing core

- Keep the forked Arabic and English layouts; emit ASCII digits only and leave shaping and bidi to
  the platform and the renderer.
- Tune on-device autocorrect and next-word prediction so no candidate requires a network call.
- Tune swipe decoding on the reference phone and enforce the keystroke and prediction budgets.
- Test by typing into at least three third-party apps, including a mid-word Arabic edit and an edit
  that mixes Arabic and ASCII digits.

**Exit:** the measured budgets of phase 2 hold, the network capture is empty, and the IME neither
reads nor replaces our WebView's `InputConnection`.

## Phase 3 — emoji and clipboard

- Bring the fork's emoji panel and clipboard into our visual identity, with copy from the shared
  contract.
- Decide clipboard retention before writing it: in-memory only, on-device history with a stated
  lifetime, or no history. Nothing leaves the device either way.

**Exit:** no network traffic, no new user-facing strings in Kotlin, Arabic release note in the same
change. GIF stays cancelled.

## Phase 4 — AI rewrite and reply

- Add the consent screen and the account-setting revocation, both off by default.
- Build the narrow, short-lived, scoped token bridge; store it in Keystore-backed storage; revoke it
  on sign-out and on consent withdrawal. The IME never receives the site session.
- Add one bounded endpoint behind the existing gateway with a hard input cap, output cap and
  timeout, no tools, no memory and no agent loop. Decide the route name and the meter row here,
  before code fixes them.
- Render results in a suggestion strip above the keys. Never auto-insert. A failure shows one Arabic
  sentence and leaves the composing text intact.
- Capture the device network while typing for a full session and assert that the only request is the
  one a tap caused.

**Exit:** the capture test passes, the caps are enforced outside the model, and a failed call spends
nothing.

## Phase 4 decisions (2026-11-25)

- Routes: `POST /api/keyboard/credential` mints the credential from the signed-in
  web session; `POST /api/keyboard/rewrite` accepts only that credential in an
  `Authorization: Bearer` header. The rewrite route never reads a cookie.
- Meter row: `keyboard.rewrite`, daily, visitor 0 / free 5 / pro 50, seeded by
  `20270103000000_keyboard_rewrite_allowance.sql` and mirrored in the fallback
  catalog. A failed or timed-out call releases the reservation.
- Credential: a stateless HMAC claim scoped to `keyboard.rewrite`, TTL 15 minutes,
  signed with a server-only secret. It is not a session cookie or refresh token.
  Consent withdrawal and sign-out delete the only copy from the device; with no
  server-side token row, the TTL is the bound on an extracted copy. No new token
  table or migration was needed for the credential.
- Bounds outside the model: 280 characters in, 280 out, one call, 5 s timeout, no
  tools, no memory, no agent loop. Both ceilings are checked in TypeScript and
  again in the IME.

## Phase 5 — release cut

- Write the user-facing Arabic release note lines in the same pull request as the native change, and
  repeat them under `## Release note` in the pull request body. A purely internal native change still
  gets a line.
- Keep `android/shell-version.properties` untouched in the pull request; the version moves at the
  cut, not at the merge.
- Publish through the existing sideload channel and confirm that enabling the IME survives an
  in-place update of the same application id.

**Exit:** a signed APK installed over the current one keeps the IME enabled and the update card
reports the new version. Signing and the release dispatch remain the owner's manual steps.

## Implementation status (2026-11-25)

Phases 0 through 4 are implemented on branch `keyboard-ime` and committed locally; nothing has been
pushed or released.

- Phase 0: one `android/keyboard` module builds into the APK; the IME is registered in the merged
  manifest, with `minSdk` 26 behind a manifest `overrideLibrary` while the app stays at 24.
- Phase 1: `RoyShellKeyboard` reads Android's IME state and opens the system picker or settings; the
  account row never claims to switch a keyboard itself.
- Phase 2: the vendored Arabic and English layouts and gesture typing ship. Every committed digit is
  folded to ASCII at the `commitText` boundary, with four JVM tests.
- Phase 3: clipboard history is process-local only and nothing copied is written to Room. Branded
  `roy_day` and `roy_night` stylesheets are the fresh-install defaults; upstream themes stay
  selectable. GIF remains cancelled.
- Phase 4: opt-in rewrite is behind a 15-minute HMAC credential, two bounded routes, the
  `keyboard.rewrite` allowance row and a tap-only network capability in the IME.

## Still open

These need a device, a release cut or an owner decision; none was assumed.

- **Device gates:** first-key and keystroke latency, swipe acceptance and the mid-word Arabic caret
  test on the RMX3195. The release APK delta is measured (15,072,211 bytes after R8 against the
  11.4 MiB pre-keyboard baseline); the latency rows stay proposed until a device witnesses them.
- **Network capture:** assertion on a real device that typing alone produces no packet and only a
  rewrite tap makes a request. The code-level tap capability is tested; the device capture is not.
- **Release cut:** Arabic release-note fragments are staged but have not been folded; signing and
  dispatch stay the owner's manual steps (phase 5).
- **Arabic prediction corpus:** the upstream dictionary is vendored as published; no decision has
  been taken about contributing member data to it.
