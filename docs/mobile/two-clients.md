# Two clients, one contract and one token file

The site and the app are two implementations of one design, not one component tree shared by two
runtimes ([ADR-0089](../adr/0089-the-android-app-is-native.md)). Nothing in either client's code can
hold them together, so four rules do, and each rule is a check rather than a sentence in a plan:

| A pull request that… | must also…                                                | held by                                       |
| -------------------- | --------------------------------------------------------- | --------------------------------------------- |
| changes a Zod schema | regenerate the app's Kotlin, in the same pull request     | `npm run check:contracts` (Lint & Type Check) |
| changes a token      | regenerate all four outputs, in the same pull request     | `npm run check:tokens` (Lint & Type Check)    |
| reads a contract     | read the shared fixtures, not a copy of them              | the Vitest suite and the app's JVM suite      |
| adds a screen        | list which client draws it, with the ticket or the reason | `npm run check:screens` (Lint & Type Check)   |

The one thing the four rules cannot do is decide for you; they only refuse a pull request that has not
decided. What follows is what each one means when you are the one holding the keyboard.

## 1. A contract change regenerates both clients

`shared/contracts` is the source: a Zod schema is the contract, and the site reads it directly. The app
cannot read TypeScript, so `npm run contracts:generate` emits a Kotlin data class per schema
(`android/app/src/main/kotlin/com/royaraqamia/app/contracts/generated/`), and `npm run check:contracts`
fails a schema change that was not regenerated.

The app's side of the seam is a list, not "whatever is exported": a schema reaches Kotlin only by being
named in `CONTRACTS` in `scripts/generate-contracts.mjs`. Adding one is a line there — and that line is
the review of what the app may decode.

Why it matters: a contract that drifts silently is a runtime failure a user discovers
([ADR-0089](../adr/0089-the-android-app-is-native.md)). The generated type makes it a compile error in
the app and a red check here instead.

## 2. A token change regenerates both outputs

`shared/tokens/tokens.json` is the one file. `npm run tokens:generate` writes the site's
`app/tokens.css` and the app's `res/values/colors.xml`, `DesignTokens.kt` and `ThemeColors.kt`;
`npm run check:tokens` fails a stale output and fails a stylesheet that re-declares a generated
property by hand.

The bundled app needs nothing extra: `app-native/habitflow/spike.css` imports `app/global.css`, which
imports the generated `app/tokens.css`, so the annotations a token change reaches the APK through the
site's own stylesheet rather than a second copy.

What those outputs resolve to is pinned as well — `e2e/visual-baseline.spec.ts` reads every generated
custom property and one real surface back out of a browser
([ADR-0096](../adr/0096-the-visual-baseline-is-values-not-pixels.md)), so a `clamp()` transcribed one
stop off fails even though the file still matches the generator.

## 3. Offline semantics change in the spec and the fixtures first

The behaviour is written down before it is coded: `docs/specs/offline-first.md` for the model,
`docs/specs/surfaces.md` for what each surface owes the user with the radio off. A change to either is
a change to the fixtures in the same pull request.

`shared/fixtures/contracts/` holds response bodies with their expectation — readable or not, and which
field the refusal names. Both clients' suites read the same manifest:

- `shared/fixtures/__tests__/contract-fixtures.test.ts` parses each body with the Zod schema;
- `android/app/src/test/kotlin/com/royaraqamia/app/contracts/ContractFixturesTest.kt` decodes the same
  bodies with the generated Kotlin type.

A case is a line in the manifest and a file beside it, and both suites read the manifest rather than
the directory: deleting the file fails both (the line names a body that is not there), and deleting
the line fails both (the file is one the manifest does not list). Adding a contract means adding its
directory and one suite on each side; the protocol is the same.

**A listed gap:** the fixtures cover what a client _reads_. The outbox a client _writes_ is still the
web's alone — the app holds no writes until the product screens land (phase 3 of
[native-app.md](native-app.md)), so there is nothing on the app's side for a write fixture to assert.
The fixture file is the place it will go, and this paragraph is the reminder that it is owed.

## 4. A screen in one client is a listed gap

`docs/mobile/screens.json` has one row per surface in `perf/surfaces.json`: either the Kotlin screen
that draws it, or the reason the app does not have one and, where there is one, the ticket.
`npm run check:screens -- --write` regenerates [screens.md](screens.md), and the check fails when:

- a surface has no row — `check:surfaces` already forces a decision for a new route, and this forces
  the other half of it, which client draws the screen;
- a row names a surface that no longer exists;
- a row claims a Kotlin screen that is not there, or two rows claim the same one;
- a `*Screen.kt` exists with no row — a screen in the app that the site does not have, or has not
  listed, is a discovery on a device otherwise.

The convention is what makes the last one work: an app screen is a Kotlin file whose name ends in
`Screen.kt`. A screen named otherwise is invisible to the check, so it does not get to exist silently.

## What the checks do not cover

- **Visual drift.** Generated tokens make a colour or a type step the same in both clients; they cannot
  make a layout the same. The mitigation is unchanged and human: design review against the web screen
  for every surface ([native-app.md](native-app.md), risks).
- **The outbox's write semantics in the app** — see the gap in rule 3.
- **The bundled app's parity.** Whether the app can show a surface with the radio off is the `Bundle`
  column of [the surface matrix](../specs/surfaces.md) — a different question from which client draws
  it, with its own check.
