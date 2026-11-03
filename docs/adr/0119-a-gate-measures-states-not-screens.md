# A gate measures states, not screens

[ADR-0118](0118-a-port-is-switched-on-by-two-measurements.md) made "the same screen" a measurement, and
recorded **one** pair per surface. That holds for `/verify`, whose second state is a card that appears
below the form. It does not hold for a screen whose design lives in what is opened on it: the account's
link list is one route and five drawings — the list at rest, the bulk bar with a selection, the
analytics drawer, the QR modal, the edit dialog. Recording only the first would pass a port whose
drawer is a Compose sheet the page never draws, which is the failure ADR-0117 exists to prevent.

## The decision

- **A surface declares states, and each state is measured.** `shared/visual/<surface>.json` carries a
  `states` array; each state names its own elements, its own `origin` and its own `capture` region.
  `docs/mobile/visual-gate.json` carries the matching list with a tolerance and a recorded baseline per
  state. Evidence moves to `e2e/__visual__/<surface>/<state>/`.
- **The two lists must agree, by name.** A state the contract describes and the gate does not measure is
  a screen nobody checked; a state the gate measures with no contract is a number with nothing behind
  it. `check:visual` refuses either direction, so adding a state is one change in two files.
- **A state is reached the way a person reaches it.** The page side runs a named routine
  (`PREPARE[state]` in `e2e/visual-contract.spec.ts`): sign in, seed rows, press select-all, open the
  drawer. A state with no routine fails by name rather than recording the page at rest under another
  state's name. The app side composes the same state in its Robolectric test.
- **Switching a surface on requires every state it declares.** A surface is `enabled: true` only when
  each of its states has a pair that compares; one unrecorded state keeps the whole surface the
  document. That is stricter than ADR-0118's single pair and is the point of this one.
- **The tolerances stay per state.** A drawer of text and a card of one button rasterise differently;
  one number for both would be either too tight to record or too wide to catch a change.

## What this costs

- **Each state is a routine on both sides.** Adding a state is not free: the page needs a way to reach
  it deterministically, and the app needs a test that composes it without a network, a session or a
  clock.
- **Seeded data becomes part of the recording.** A list with rows needs rows, and a chart needs clicks,
  so the capture seeds fixed rows through the real endpoints and deletes them after. A recording that
  depends on whatever the account happens to own cannot be re-recorded and is not evidence.
- **A modal is measured inside its own region, not the viewport.** The contract names what both clients
  draw identically; a scrim over a page that differs behind it would compare the page.

## Why not the alternatives

- **One state per surface id** (`account-links`, `account-links-bulk`). It needs no tooling change, but
  every state becomes a row in `docs/mobile/screens.json`, and the surface matrix stops meaning "a
  screen the app draws" — `check:plan` would then count five surfaces where the site has one.
- **At-rest in the gate, behaviour tests for the rest.** Cheaper, and it proves the drawer's boxes in
  Compose's own terms — but not that they are the page's, which is the only question the gate answers.
