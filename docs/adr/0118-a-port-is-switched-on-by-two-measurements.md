# A port is switched on by two measurements

[#872](https://github.com/royaraqamia/royaraqamia/issues/872) switched every native port off, because
the app was drawing a second design: a services sheet that filled the screen where the page stops at
85dvh, rows without the site's per-row grips, a bare Material card where the page has its glass one.
[ADR-0117](0117-the-document-is-the-app-until-a-port-is-the-same-screen.md) says a port returns when
it "is the same screen", and left that as a judgement. This makes it a measurement.

## The decision

- **Two measurements, because they fail differently.** The _layout contract_ records every named
  element's box and the properties that make it what it is, from the page at the app's viewport and
  from the composed screen; it fails by name and by number ("`services-sheet.maxHeight` is 852 in the
  app and 723 on the page"). The _raster_ diffs the two captures pixel for pixel and fails by share.
  The first is actionable, the second catches what a box cannot express.
- **The evidence is committed, and the gate reads it.** `docs/mobile/visual-gate.json` names the
  gated surfaces, their routes, contracts and tolerances; `e2e/__visual__/<surface>/` holds the four
  files (`web.json`, `app.json`, `web.png`, `app.png`). `check:visual` refuses a surface switched on
  in `docs/mobile/screens.json` without a pair that compares, and refuses half a pair as worse than
  none — it looks like evidence and cannot be compared.
- **One viewport, because the measurement is the viewport.** 393 x 852 CSS px at DPR 2.75, Arabic,
  dark, reduced motion. Playwright's `visual-gate` project and the app's Robolectric test compose at
  that size; a second project at another width would record a different page.
- **The tolerances are the surface's, and they are small.** `pixels` is a share of the capture (at
  most 5%, and a surface should ask for far less), `length` is CSS-pixel drift per box (0.5 by
  default). A tolerance wide enough to pass anything is refused, which is what stops the gate from
  becoming the opinion it replaces.
- **The contract is the target list, not the whole screen.** It names the boxes that carry the design
  decisions — the sheet's height, the row's grip, the card's radius and type step. A surface whose
  contract lists one element is a surface that will pass while looking wrong, so the contract is
  reviewed as part of the port.
- **Recording is a command, not a habit.** `npm run visual:capture` records the page side; the app's
  test writes the other pair. Re-recording after an intended design change is a reviewed diff, like
  `npm run visual:baseline` ([ADR-0096](0096-the-visual-baseline-is-values-not-pixels.md)).

## What this costs

- **A recording needs a running site with a session.** The page capture is a real navigation with the
  fixture account, so a surface behind auth needs the e2e user and data the other specs already
  assume. A surface whose data changes per run (a timestamp, a counter) records unstable values: the
  contract has to name the parts that are the design, not the parts that are the data.
- **The raster is never zero.** Chromium and Skia rasterise the same glyph differently, `backdrop-filter`
  glass has no Compose equivalent, and a CSS shadow's last pixels do not match a Compose one's. That is
  why `pixels` exists; a surface that cannot get under it is a surface that should stay the document,
  and ADR-0117 already makes that a working state rather than a failure.
- **Motion is not covered.** A still frame says nothing about a transition, a scroll behaviour, a
  gesture. Those stay a review item, named in `docs/mobile/two-clients.md`.
- **It cannot make a port exact; it can only refuse an inexact one.** The app still draws with
  Compose. If a surface needs to be pixel-identical _and_ interactive, the answer remains the document.

## Why not the alternatives

- **A pixel diff alone.** It says "37% of pixels differ" and nothing about which box moved. The
  failure that produced #872 — a sheet that fills the screen — is a contract failure, and the report
  should say so.
- **The recipe comparison that already exists.** `e2e/plan-card-recipe.spec.ts` proves the browser
  paints the recipe the app also reads. It cannot see layout: the recipe has no idea how tall a sheet
  is on a 852px-tall screen.
- **A human comparing two phones.** It is what shipped 1.1.0, and it is not evidence anyone else can
  re-run.
