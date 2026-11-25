# 0219. The keyboard is an IME in the same APK

## Status

Proposed (2026-11-25). Builds on [ADR-0089](0089-the-android-app-is-native.md).
Does not contradict [ADR-0100](0100-a-port-draws-the-sites-glyphs-and-scale.md): that rule stops a
port from imitating OS furniture, while here the keyboard itself is the product.

## Context

The request is a toggle on the account page that lets our own keyboard type into every app on the
device, not only into our own fields. Only an `InputMethodService` declared by an installed APK can
receive an `InputConnection` from another app's text field, so an in-app custom view cannot satisfy
it.

Two platform facts bind the design. Android does not give a normal app an API to silently make an
IME the system default; the honest control is to open the system's input-method picker or settings
and read the chosen IME back. And our own WebView must keep its native `InputConnection`:
`android.captureInput` stays off because a plain `BaseInputConnection` committed Arabic edits at the
end of the field ([android-shell.md](../mobile/android-shell.md)). The new IME is a separate
`InputMethodService`, not a replacement for that connection.

The owner's decisions are fixed: sideload distribution only; Arabic and English; a full engine with
plain typing, autocorrect and prediction, swipe, emoji and clipboard; no GIF in any release; and
GPL-3.0 obligations accepted for a fork. AI rewrite and reply are separate and governed by
[ADR-0220](0220-typed-text-is-never-uploaded-without-a-tap.md).

## Decision

1. **The IME is a new Gradle module `:keyboard` inside the existing APK.** It shares the application
   id and signing identity. There is no second app, no second install and no second update channel.
2. **The engine is a fork of FlorisBoard at a pinned upstream commit**, licensed GPL-3.0. The
   upstream `LICENSE` and `NOTICE` are vendored, the pinned commit is recorded, and our changes stay
   public. Swipe decoding, clipboard, emoji, themes and the suggestion pipeline come from the base;
   we add the Arabic layout and copy, our own visual identity, and the account bridge.
3. **The account-page toggle is "set as default", and says so.** On means opening the system IME
   picker and then reflecting whatever the system reports as the default; off means opening the same
   system control with the choice explained. The control never claims to switch a keyboard silently,
   and it never writes a secure system setting itself.
4. **v1 ships Arabic and English layouts only**, with swipe, on-device autocorrect and next-word
   prediction, a clipboard and an emoji panel. GIF is cancelled outright and is not a later phase.
5. **The IME emits ASCII digits only.** The repo's digit rule and Aref Ruqaa for read-only numbers
   are unchanged; Arabic shaping and bidi caret behaviour stay the renderer's and the platform's job,
   which the IME must respect rather than reimplement.
6. **Distribution is sideload only.** No Google Play policy is treated as binding, but the APK stays
   a genuine, fully functional input method rather than a toggle wrapper.
7. **The keyboard is not a port.** It gets no `docs/mobile/screens.json` row, no `parity.json` row
   and no `check:visual` gate, because there is no page it has to be pixel-identical to. The toggle
   is a document change while the account surface is still the document
   ([ADR-0117](0117-the-document-is-the-app-until-a-port-is-the-same-screen.md)).
8. **The APK stays a shipped artefact.** Every pull request touching `android/**` carries its Arabic
   release note in the same change
   ([ADR-0090](0090-the-web-has-no-releases-and-the-shell-ships-weekly.md)).

## Why not the alternatives

- **A second standalone keyboard app.** Two installs, two update channels and two signing keys for
  a feature the member expects inside the app they already have.
- **A custom keyboard inside our own text fields only.** Cannot type into another app, which is the
  whole request.
- **Write the engine from scratch.** Arabic shaping, gesture decoding and a usable language model
  are multi-year problems; a fork buys a measured baseline to harden instead of an invention to
  debug.
- **An Apache-2.0 AOSP-LatinIME-derived engine.** Cleaner license, weaker out-of-box gesture and
  clipboard experience, and more integration work before the first release. Chosen only if the
  copyleft consequence below becomes unacceptable.
- **Silently changing the default IME.** Not available to a normal app, and a UI that promises it
  would lie to the member.
- **Reusing our WebView's `InputConnection`.** That is the exact path that broke Arabic caret
  placement; the new IME must not touch it.

## Consequences

- GPL-3.0 attaches to the keyboard module and, if linked into the same APK, plausibly to the
  combined work. The repo being public makes source release natural; a future proprietary license
  would require replacing the engine, not relicensing it.
- The release APK grows beyond the 11.4 MiB minified baseline
  ([ADR-0094](0094-the-release-build-is-minified.md)). The delta is measured at the spike gate and
  recorded in [the keyboard plan](../mobile/keyboard-plan.md) rather than guessed here.
- The engine needs a permanent maintenance owner for OS upgrades and layout changes. An agent can
  write and test the module, but license acceptance, keystore custody, real-device Arabic validation
  and maintenance after merge remain human ownership.
- Enabling the IME persists across updates of the same application id; a member still has to enable
  it once after installing, because sideloading grants no system role automatically.
