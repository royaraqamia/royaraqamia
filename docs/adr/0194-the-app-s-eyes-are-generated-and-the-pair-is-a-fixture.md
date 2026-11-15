# 0194. The app's eyes are generated, and the pair is a fixture

## Status

Accepted (the second half of ADR-0181, #1422).

## Context

ADR-0181 decision 6 says the native client publishes the same snapshot as the
site, registers the same screen ids, and is listed in `docs/mobile/parity.json`.
The web half landed; the app has nothing. Writing that change raised two
questions the decision left open, and guessing either one would have cost more
than the code.

**Where does the pair live?** `docs/mobile/parity.json` is one row per component
the app draws natively and the site already draws, and its check requires every
row to carry a copy source, a state list whose copy keys both components render,
and a drawn surface or the shell frame. A snapshot publisher draws nothing: it
has no copy, no states and no frame. Adding four optional fields for one row type
would weaken the schema for the 84 rows it currently guards, and the value of
that schema is that nothing in it is optional.

**Where do the screen ids come from?** The site resolves a path with a table
generated from `perf/surfaces.json` (`shared/contracts/screens.generated.ts`).
The app's surface registry is a different list: `NativeSurfaces` names the ports
that passed the visual gate (ADR-0117), not every surface that exists. A Kotlin
table typed by hand would be a second interpretation of one matrix, which is the
drift ADR-0098 exists to forbid — and it would start with three ids where the
matrix has 39.

## Decision

**One: the pair is a fixture and a generated type, not a parity row.**

- The snapshot's Kotlin type is an output of `scripts/generate-contracts.mjs`,
  fed by `ScreenContextSnapshotSchema`. Field names (`screenId`, `updatedAt`)
  come from the schema the server parses with, so a rename is a compile error
  rather than a snapshot the assistant silently never sees. The `{ blind: true }`
  arm is a hand-written companion type: it is a shape the app _sends_, not one it
  reads, and widening the generator to emit a sealed interface for two cases is
  not worth it yet.
- What both clients must agree on is pinned by
  `shared/fixtures/parity/screen-snapshot.json`, the same mechanism as the
  hijri dates, the post text and the rates board: a web test asserts it against
  the schema and `resolveScreen`, and `ScreenSnapshotFixtureTest` decodes it into
  the generated type, re-encodes it and resolves the same rows with the app's
  resolver. That compares outputs, where a parity row would compare file text.
- `docs/mobile/parity.json` gains no row, and nothing is exempted either: the
  publisher reads neither `Recipes` nor `LucideVectors`, so the discovery rule
  does not claim it.

**Two: the app's route table is a second output of `check:screens`.**

- `scripts/check-screens.mjs` writes `Screens.kt` beside
  `screens.generated.ts` from the same matrix, in the same run, and
  `npm run check:screens` fails when either is stale. One table, two languages,
  both stale together or neither.
- `Screens.resolve` is the site's own order — tab routes, then patterns, then
  prefixes — with the segment-boundary guard (`/administer` is not `/admin`).
  The fixture's resolver rows are what prove the two agree path by path.
- `NativeSurfaces` keeps its meaning (the gate) and is not reused as the
  snapshot's registry.

**Three: the title is the copy the screen draws.**

- The site's title is `document.title`. The app has none, so the equivalent is
  the constant the screen paints as its heading, and `ScreenTitles` reads those
  generated copy constants rather than retyping the words.
- A route whose screen draws no single heading is listed as untitled _with its
  reason_, and a test requires every route `NativeSurfaces` declares to be in
  exactly one of the two tables. "No title" stays a decision when a port adds a
  route.
- Routes handed to the document (the browser) never publish from the app: there
  is no app-side turn while the member is in the browser.

**Four: the app publishes no content yet.**

`overlays`, `focus`, `fields` and `text` are empty and published as empty. The
app has no overlay registry and no field allowlist, so naming the screen is the
whole claim it can make; a surface that adds a readable field adds it here, and
that change is the one `security-review` is mandatory on (ADR-0181).

## Consequences

- A snapshot the app writes cannot name a field the server's block does not read,
  and a path cannot resolve to one screen in the app and another on the site.
- A new surface reaches the app's resolver with no edit in the app, and a new
  ported route owes a title or a stated reason.
- `scripts/__tests__/check-screens.test.mjs` carries the Kotlin output, so the
  generator's formatting and its prefix guard are tested like the TypeScript
  one.
- The `{ blind: true }` arm lives outside the generator. When a third shape is
  needed, the generator grows `anyOf`, not the app.
