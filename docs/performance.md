# Performance Baseline & Budget

The shipped-weight baseline for the performance program (issue #118). Every
change in that program is measured against these numbers, and `npm run
perf:check` fails the build when a route pushes past its budget.

## What is measured

`scripts/perf-baseline.mjs` reads the `next build` output statically — no server
or network — and reports **raw and gzip** bytes per category for each route:

| Category | What it covers                                                     |
| -------- | ------------------------------------------------------------------ |
| `html`   | The prerendered HTML for the route (including inline RSC payload)  |
| `js`     | Same-origin module scripts the HTML requests                       |
| `css`    | Stylesheets the HTML links                                         |
| `fonts`  | Font preloads plus `woff2` files referenced from those stylesheets |
| `legacy` | `<script nomodule>` polyfills — **reported, excluded from TOTAL**  |

`legacy` is excluded on purpose: a modern browser (including the low-end Android
devices this program targets) never requests a `nomodule` script, so counting
the polyfill chunk would overstate what those devices download. It stays visible
so the chunk cannot grow unnoticed.

**Why the chunk is kept.** Dropping it was considered once real traffic was
measured: over a 7-day window every visitor was on an ES-module browser — Chrome
/ Edge / Samsung / Firefox, Mobile Safari, and the Chromium-based Instagram and
Facebook in-app browsers. No IE11 and no legacy Android, so nothing in the
audience fetches the polyfill. It also cannot be removed through configuration:
Next imports it from the client runtime entry, so the only route out is
post-build surgery on the framework's output for a file no user downloads.
Instead the gate is guarded — `npm run perf:check` fails if the polyfill is ever
loaded without `nomodule`, which would turn it into a blocking download for
everyone.

Images are out of scope here; they are handled by the image-compression ticket
in the same program. Runtime metrics (INP, long tasks, dropped frames) are a
separate concern — this tool measures transferred weight only. See
[Runtime budget](#runtime-budget) and [Launch and tap](#launch-and-tap) for the
field measurements that cover them.

## Commands

```bash
npm run build                  # perf tooling reads .next, so build first
npm run perf:baseline          # report the current numbers + budget status
npm run perf:check             # same, but exit 1 on a budget breach (used in CI)
npm run perf:baseline:update   # re-record perf/baseline.json after an intended change
```

Point it at other built routes, or a different build directory:

```bash
node scripts/perf-baseline.mjs --routes /,/community,/terms
node scripts/perf-baseline.mjs --public-dir public
node scripts/perf-baseline.mjs --json          # machine-readable output
```

## Baseline

Recorded from the landing page (`/`) and committed as `perf/baseline.json`. Raw
values; `legacy` is not part of the total.

| Category  | Raw       | Gzip         |
| --------- | --------- | ------------ |
| `html`    | 203.9 KB  | 29.2 KB      |
| `js`      | 641.5 KB  | 200.6 KB     |
| `css`     | 317.7 KB  | 46.9 KB      |
| `fonts`   | 160.5 KB  | 160.5 KB     |
| **TOTAL** | 1323.6 KB | **437.2 KB** |
| `legacy`  | 110.0 KB  | 38.7 KB      |

The baseline now records five routes — `/`, `/community`, `/scan`, `/terms` and
`/habitflow` — so a per-surface stylesheet that regresses is visible on the route
that pays for it, not only on the landing page. The table above is `/`, the route
with the largest stylesheet.

`fonts` raw and gzip match because `woff2` is already compressed: `gzip` here means
"gzip when that helps, otherwise raw", so the fonts ceiling is in effect a raw-size
ceiling rather than an inflated one.

Sizes are environment-sensitive by a few percent, so treat small deltas as
noise. The budget is the guard; the baseline is the reference the program's
tickets measure their wins against.

## Budget

`perf/budget.json` is the single source of truth for the ceilings, in gzip KB:

- `measure` lists the routes the report covers by default (`--routes` overrides).
- `default` applies to every route; `routes.<path>` overrides it per route.
  Route keys are normalized, so `community`, `/community` and `/community/` all match the same route.
- Available metrics: `totalGzipKb`, `jsGzipKb`, `cssGzipKb`, `cssRawKb`, `htmlGzipKb`,
  `fontsGzipKb`. All but `cssRawKb` are gzip; `cssRawKb` reads the stylesheets'
  **raw** bytes, the size the parser walks through, which is the number the
  per-surface split in #497 is held to. A metric absent from both `default` and
  the route's override is simply not constrained.
- Ceilings sit a few percent above the current baseline: they catch
  **regressions**, not intentional reductions.

Edit the file to change a ceiling. The values are deliberately not copied here,
so the docs cannot drift from the guard.

**Ratchet policy.** As program tickets land, lower the ceilings to the new
measured values so the win cannot silently leak back. Reductions never trip the
budget; only growth does, which is the point.

## Stylesheets by surface

Every route used to ship one stylesheet: the union of every product's utilities
(HabitFlow, SpendTrack, LinkSnap, BlogPress, Community, the Quran reader, the
admin dialogs, the editor), so a visitor reading `/terms` parsed all of it
(issue #497). Tailwind compiles utilities from the files it can see, and the old
`@import 'tailwindcss'` could see the whole repository.

The fix is one stylesheet per surface, cut by route rather than by component:

| File                    | Loaded by                                         | Holds                                                |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| `app/global.css`        | the root layout, on every route                   | tokens, resets, chrome, shared primitives, hand CSS  |
| `app/surface.css`       | imported by every entry above                     | the Tailwind preamble both sides must agree on       |
| `app/<surface>/app.css` | that surface's layout (or its pages)              | the sources that surface's components are written in |
| `app/landing.css`       | `app/page.tsx`                                    | the landing sections                                 |
| `app/marketing.css`     | the pricing/privacy/security/terms/app-info pages | those five pages                                     |
| `app/leads.css`         | the training, request-project and hire layouts    | the three lead forms and their shared sections       |

`surface.css` is what keeps the two compilations honest: it declares
`source(none)` (nothing is scanned unless an entry lists it), imports
`theme.css` (so a token resolves identically on both sides) and declares the
`dark` variant once (so a surface cannot silently fall back to
`prefers-color-scheme`). `global.css` then lists the root layout's sources and
nothing else, and a surface entry lists its own.

Adding a surface is three lines: create `app/<surface>/app.css`, `@source` the
surface's route directory and the `frontend/ui/**` directories its components
import, and `import './app.css'` from the layout that owns the segment. A
component that a surface imports from another surface's directory must be listed
in both entries — the shell is the only place that is shared by definition.

What the split does not remove: two chunks that are both loaded still carry the
utilities they have in common, because each is an independent Tailwind
compilation. That overlap is the price of deferring, and it is why the shell is
kept to chrome rather than chrome plus the landing page.

Measured on the build that landed it:

| Route    | CSS raw before | CSS raw after |
| -------- | -------------- | ------------- |
| `/`      | 534.2 KB       | 317.7 KB      |
| `/terms` | 534.2 KB       | 276.8 KB      |
| `/scan`  | 534.2 KB       | 276.9 KB      |

`default.cssRawKb` in `perf/budget.json` is the ceiling that holds this: no route
may exceed 350 KB of stylesheet.

## Runtime budget

Shipped weight is only half the goal: the program exists to make the site _feel_
instant, and `perf:check` cannot see that axis (ADR 0004). The runtime budget is
the field measurement that can, taken from real users rather than build
artifacts.

| Metric | Ceiling | What it covers                                              |
| ------ | ------- | ----------------------------------------------------------- |
| INP    | 200 ms  | Interaction responsiveness — the metric this program is for |
| LCP    | 2500 ms | Largest Contentful Paint — perceived load                   |
| CLS    | 0.1     | Layout stability                                            |
| TTFB   | 800 ms  | Server response — a diagnostic when LCP regresses           |

The ceilings are the Web Vitals "good" thresholds. `perf/runtime-budget.json` is
the single source of truth: it holds the ceilings, the aggregation (`p75`), the
window (`7d`) and the recorded baseline, so this page cannot drift from it.

**Source.** Vercel Speed Insights, reported by `<SpeedInsights />` in the root
layout and aggregated as the 75th percentile over a rolling 7-day window. The
percentile is deliberate: a mean would hide the slow tail this program targets.

**Reading it.** The dashboard is the primary view. For a scripted check the
Vercel CLI queries the same data:

```bash
npx vercel metrics vercel.speed_insights.inp_ms  --aggregation p75 --since 7d --project royaraqamia --prod
npx vercel metrics vercel.speed_insights.lcp_ms  --aggregation p75 --since 7d --project royaraqamia --prod
npx vercel metrics vercel.speed_insights.cls     --aggregation p75 --since 7d --project royaraqamia --prod
npx vercel metrics vercel.speed_insights.ttfb_ms --aggregation p75 --since 7d --project royaraqamia --prod
```

The matching `*_count` metrics show how many datapoints each value rests on;
treat a value backed by a handful of samples as noise, not a signal.

**Not CI-gated.** Runtime is real-user data, not a build artifact, so it cannot
fail a pull request. It is a monitoring budget: review it after a change lands
and treat a p75 regression against a ceiling as a bug, not a style choice.

**Ratchet policy.** When a change lands an improvement, re-record the baseline in
`perf/runtime-budget.json` so the next change is measured against a new floor.
The ceilings stay at the Web Vitals thresholds; only the baseline moves.

**Window limit.** The Speed Insights API exposes only the last 7 days on the
Hobby plan, which is why the window is fixed at `7d`. Longer trends are read from
the dashboard.

## Launch and tap

Web Vitals measure the page the browser rendered; they do not measure what the
instant-feel program (#486) is for: **the gap between a tap and the content that
answers it**. Three numbers carry that, measured in the client and read from one
log query (#487).

| Number              | Mark pair          | Ceiling (#486 decision gate) |
| ------------------- | ------------------ | ---------------------------- |
| cold open → content | `boot` → `content` | 900 ms                       |
| warm open → content | `boot` → `content` | 150 ms                       |
| tap → paint         | `tap` → `paint`    | 50 ms                        |

**What each row means.**

- **`boot`** is the earliest client code of a launch:
  `instrumentation-client.ts`, before hydration. All durations run from
  `performance.timeOrigin`, so they include the document request a cold open
  pays.
- **`shell`** is the app chrome's first committed frame, marked once by
  `AppPerfObserver` in the root layout.
- **`content`** is owned rows painted from the Local Store, marked by the product
  dashboards (SpendTrack, HabitFlow, BlogPress, LinkSnap) and by the Quran reader
  — the surfaces ADR-0073 made cached shells.
- **`tap` → `paint`** brackets a local mutation's tap to the first frame after it
  updated the UI. Today that is the HabitFlow check-in (optimistic) and LinkSnap's
  link create (write → store subscriber → repaint); a new site is one
  `beginTap()` call.
- **cold vs warm** is the document's provenance: a reload or back/forward
  navigation is warm, and so is a document that reports `transferSize === 0`
  (Cache Storage or the HTTP cache). Everything else — including a WebView that
  reports no navigation entry — is cold. That is the split the decision gate
  budgets on: a warm open is the one that must paint in one frame.
- **platform** is `shell` (the Capacitor bridge, or the `RoyaraqamiaShell` user
  agent), `pwa` (`display-mode: standalone`) or `web`.

**How it travels.** `frontend/shared/perf-marks.ts` writes the marks with
`performance.mark`/`measure` and posts one record per launch — when the first
content surface paints — and one per local mutation's tap, to
`POST /api/app-perf`. The endpoint validates the body, applies a per-IP limit
(60/min, fail-closed) and writes a single `logger.info('[app-perf]', …)` line.
The beacon is deferred past the paint, uses `keepalive`, is skipped while
offline and is never retried — as droppable as the offline-miss beacon (ADR-0074).
The decision and its privacy boundary are recorded in
[ADR-0075](adr/0075-launch-and-tap-timings-are-counted.md).

**What it never carries:** no URL, no path, no user, no session, no client id, no
user agent, no product name and no mutation name. The record is the platform, the
cold/warm flag and the durations; the log line is safe to grep and to keep.

**Reading it.** One query, one table (example output below):

```bash
npx vercel logs --project royaraqamia --since 1h --json --query '[app-perf]' \
  | npm run perf:field
```

```text
kind    platform  open  n   shell p75  content p75  paint p75
launch  shell     cold  12  812 ms     1180 ms      —
launch  shell     warm  30   96 ms      132 ms      —
tap     shell     —     41       —           —      42 ms
```

`npm run perf:field` is a nearest-rank p75 by platform (and by cold/warm for
launches); pass `--file <path>` to read saved JSON lines instead of stdin.

**Window limit.** Vercel keeps runtime logs for an hour on the Hobby plan, so
this is a recent-window read — the number just after a deploy, not a historical
trend. Read it while the deployment is fresh, and treat a sample count in the
single digits as noise.

**Baseline.** There is no field-metrics store on the Hobby plan, so the baseline
is this table, copied by hand from the query above after a deploy. Read it, then
replace the row: the ceilings in the first table do not move, only the recorded
number does.

| Read on | cold open → content | warm open → content | tap → paint      |
| ------- | ------------------- | ------------------- | ---------------- |
| —       | not yet recorded    | not yet recorded    | not yet recorded |

**Cost.** One function invocation per launch and per tap, bounded by the limiter.
A launch only sends when a content surface paints owned rows; a public/SEO route
sends nothing, and neither does a dashboard that never paints (that case is the
skeleton in its own state, not a sample).

### The paint gate

The field numbers above are the authority for real devices, and they cannot fail
a pull request — no log query runs in CI, and the Hobby plan keeps an hour of
logs. `e2e/perf-paint.spec.ts` is the web-side gate that closes that gap: it
measures the same marks, on a build, before the change ships.

```bash
npm run perf:paint             # build, measure every budgeted surface, fail on a breach
npm run perf:paint -- --update # build, measure, then record perf/paint-baseline.json
npm run perf:paint -- --from <file>  # record from a CI artifact instead
```

The runner sets `CI=1`, which is what makes Playwright's `webServer` build and
serve a production build: the worker does not register in development, so a dev
server would answer every offline reload with nothing and fail the gate for the
wrong reason.

The `E2E: Offline` workflow runs it and uploads
`node_modules/.playwright/paint-measurements.json`, which is the file the
`--from` form takes.

**What each number is here.** The three marks are the ones the client writes, so
the gate asserts what `/api/app-perf` reports rather than a second definition:

- **cold** — a first visit with the network on, in a fresh context with the
  service worker blocked. The document genuinely comes over the wire, so the
  number includes the request a cold open pays.
- **warm** — an offline reload in a context the worker has taken over. This is the
  promise ADR-0073 makes, and the strictest reading of "warm".
- **tap** — one local mutation, driven by the `tap.steps` in the budget file
  (LinkSnap's link create today). A surface that declares no steps is ungated for
  that number, with the reason in `tapNote`.

**Two-sided, like every other budget here.** `perf/paint-budget.json` holds an
absolute ceiling per surface and per number, generous enough for CI noise — the
"is it broken" line — and `perf/paint-baseline.json` holds the recorded numbers
the gate compares against with a 10% tolerance (`regressionPct`) — the "did this
pull request make it worse" line. The ceilings are **not** the program's design
targets: #486's decision gate (900 ms cold, 150 ms warm, 50 ms tap) stays the
target, and the ceilings sit two to three times above it on purpose.

**The baseline is recorded where it is enforced.** These numbers are
machine-sensitive the way `perf/baseline.json` is, so a baseline recorded on a
laptop and enforced on a GitHub runner would fail every pull request. The file
ships empty (`recorded: null`), which means the gate enforces the ceilings and
skips the relative half until someone folds a CI run into it with
`--from node_modules/.playwright/paint-measurements.json`. It then prints the
deltas on every later run.

**Flake control, stated rather than tuned away.** The medians come from
`runs` samples with the first one always discarded (it pays the worker's install
and the store's first seed); a surface needs the signed-in test account and is
skipped — not failed — when the secrets are absent, so a fork's run gates Quran
and nothing else; and the workflow already runs `--workers=1` for its own
reasons, which is the serialisation this gate needs too.

**Still ungated.** The `/account` views, `/scan`, and the public
snapshots (`/community`, `/rates`, `/verify`, `/u/`, `/news`) have no `content`
mark yet, so nothing measures their paint path; `docs/specs/surfaces.md` shows an
empty Paint cell for each, and `perf/surfaces.json` carries an `ungated` reason.
The account views and the fifth product's remaining routes are #493's; the public
ones arrive with #555.

## CI

The `Code Quality` workflow runs `npm run build` and then `npm run perf:check`,
so a budget breach fails the pipeline (and therefore blocks a release, which
gates on Code Quality). To raise a ceiling, change `perf/budget.json` in the
same PR and justify it there.

## Rendering policy

The site ships **one flat rendering path for every device** (ADR 0004): no
backdrop filters, no live glow blurs, no always-on decorative animation. This
replaced an earlier `lite` capability check that could not cover "every device":
`navigator.deviceMemory` does not exist in Safari or Firefox, and the check
failed **open** to full effects when a signal was missing, so those engines
stayed on the expensive path no matter how slow the device was.

The line is a rule: **if a non-per-frame alternative delivers the same function,
the effect is decorative and is removed.**

- **Removed** — `backdrop-blur-*` and the `.glass*` frost, live `blur`/glow
  filters, `logo-glow`, the fixed-button backdrop blurs, always-on decorative
  motion, and `transition-all`.
- **Kept** — static depth cues (shadows, gradients), which are a one-time raster;
  and functional feedback (loading shimmer, focus rings, dialog enter/exit),
  which is transform/opacity based.

`npm run lint` enforces the strip through a local rule
(`eslint-rules/no-heavy-effects.mjs`): `transition-all`, `backdrop-blur-*` and
the removed glow utilities fail the build, so the flattening cannot leak back.

The win here is runtime — paint, compositing and battery — which this tool does
**not** measure. See Limitations.

## Limitations

- **Prerendered routes only.** `--routes` works for routes Next prerenders to
  `.next/server/app/<path>.html`. A dynamically server-rendered route (for
  example `/community/[slug]`) has no such artifact and needs a live-server mode,
  which this tool does not implement.
- **Initial request only.** It counts the document plus the subresources its HTML
  references. Chunks pulled in later by client-side navigation or hydration are
  invisible, so it is a faithful proxy for first-load weight, not for everything
  a session eventually downloads.
- **No module attribution.** It prices chunks, not the packages inside them. When
  a cut needs to know which dependency the bytes belong to, use
  `next experimental-analyze` and the method in
  [landing-client-js-audit.md](landing-client-js-audit.md).
- **Build artifacts, not the wire.** Sizes are read from disk. `gzip` means
  "gzip when that helps, otherwise raw"; real header/frame overhead and any CDN
  brotli are not modelled.
- **Weight, not jank.** No INP, long tasks, or frame timing. This measures bytes
  transferred, which is a different axis from the smoothness work in the
  program. The [Runtime budget](#runtime-budget) covers that axis from real-user
  data instead.
