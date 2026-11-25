# The in-app keyboard: order of work

[ADR-0219](../adr/0219-the-keyboard-is-an-ime-in-the-same-apk.md) decides the shape: a real Android
IME in the existing APK, built on a pinned GPL-3.0 FlorisBoard fork, with an account toggle that
opens the system picker rather than pretending to switch a keyboard silently.
[ADR-0220](../adr/0220-typed-text-is-never-uploaded-without-a-tap.md) bounds the only network feature.
This file is the order of work and the evidence each phase needs before the next one starts. It is a
plan, not a claim: nothing below has been built or measured yet.

The risk is front-loaded. Phase 0 decides whether the forked engine is good enough at Arabic and
swipe to be worth carrying at all; phase 4 is where privacy and cost can quietly escape. The middle
phases are integration volume.

## Budgets

Proposed targets, to be replaced by measurements at the gate that first reaches them. The reference
device is the **RMX3195** (realme C25s, Android 13, 360 dp, Helio G85, 4 GB), the same phone
[native-app.md](native-app.md) uses. An emulator is a regression comparison, not a sign-off.

| Measure                               | Target                                   | Baseline or gate                                                |
| ------------------------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| Field focus to first key drawn        | < 150 ms on the RMX3195                  | proposed at phase 0                                             |
| Keystroke to committed character      | < 40 ms, entirely on device              | proposed at phase 0                                             |
| Prediction candidates after a word    | < 80 ms, no network                      | proposed at phase 2                                             |
| AI tap to suggestion                  | < 3 s, hard timeout 5 s                  | proposed at phase 4                                             |
| Network packets from the IME typing   | 0, in every phase                        | captured on device, asserted by a test                          |
| Release APK size                      | delta recorded, never unexplained        | 11.4 MiB minified today ([ADR-0094](../adr/0094-the-release-build-is-minified.md)) |
| App cold start                        | no regression past 550 ms                | [native-app.md](native-app.md) budget                           |

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

## Open decisions

These are deliberately not assumed; each is closed at the phase named above.

- The route and the allowance row for the AI rewrite endpoint (phase 4).
- Clipboard history retention, if any (phase 3).
- The TTL of the scoped IME token and the exact bridge mechanism that delivers it (phase 4).
- Whether the IME needs its own settings surface, and if so how it is represented without becoming
  a port (phase 1).
- The Arabic prediction corpus: which words are included and whose data may feed it (phase 2).
