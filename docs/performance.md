# Performance Baseline & Budget

The shipped-weight baseline for the performance program (issue #118). Every
change in that program is measured against these numbers, and `npm run
perf:check` fails the build when a route pushes past its budget.

## What is measured

`scripts/perf-baseline.mjs` reads the `next build` output statically — no server
or network — and reports **raw and gzip** bytes per category for each route:

| Category | What it covers                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| `html`   | The prerendered HTML for the route (including inline RSC payload)                                                     |
| `js`     | Same-origin module scripts the HTML requests (see [Post-paint script weight](#post-paint-script-weight) for the rest) |
| `css`    | Stylesheets the HTML links                                                                                            |
| `fonts`  | Font preloads plus `woff2` files referenced from those stylesheets                                                    |
| `legacy` | `<script nomodule>` polyfills — **reported, excluded from TOTAL**                                                     |

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
npm run perf:weight            # price every surface from the live origin, exit 1 on a breach
npm run perf:weight:report     # same, but report only
npm run perf:runtime           # price scripts fetched after load in Chromium, report only
npm run perf:runtime -- --check # same, but exit 1 above perf/runtime-weight.json
npm run perf:runtime -- --update # re-record the measured values, keeping the ceilings
npm run perf:runtime -- --probe-error # also price the reporter fetched on an error
```

Point it at other built routes, or a different build directory:

```bash
node scripts/perf-baseline.mjs --routes /,/community,/terms
node scripts/perf-baseline.mjs --public-dir public
node scripts/perf-baseline.mjs --json          # machine-readable output
```

The live mode reads the origin rather than `.next`, so it needs no build:

```bash
PERF_ORIGIN=https://royaraqamia.com node scripts/perf-baseline.mjs --live --check
node scripts/perf-baseline.mjs --live --routes /,/notifications   # a subset
node scripts/perf-baseline.mjs --live --json                      # machine-readable output
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

- `measure` lists the routes the **static** report covers by default (`--routes`
  overrides). The live gate does not read it: its route list comes from
  `perf/surfaces.json`, so a surface added to the matrix is priced by the next
  run without anyone remembering to add it to a second list (#1662).
- `default` applies to every route; `routes.<path>` overrides it per route.
  A live route that redirects is checked against the ceiling of the document it
  actually serves, not the one it was requested at.
  Route keys are normalized, so `community`, `/community` and `/community/` all match the same route.
- A route key may also be a dynamic pattern such as `/quran/[surah]`. It expands
  through `perf/surfaces.json`'s `weightSamples` to the concrete paths the gate
  prices, so every published sample of that pattern is held to one ceiling.
  That matters when a segment changes the document's weight: the surah reader
  prices both Al-Fatiha and Al-Baqarah, and the pattern's ceiling has to cover
  the heavier one. An exact key always wins over a pattern.
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
(HabitFlow, SpendTrack, LinkSnap, Community, the Quran reader, the
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
`theme.css` (so a token resolves identically on both sides), declares the `dark`
variant once (so a surface cannot silently fall back to
`prefers-color-scheme`), and imports Tailwind _unwrapped_ — the same layer names
as the shell (ADR-0132). `global.css` then lists the root layout's sources and
nothing else, and a surface entry lists its own.

Both stylesheets therefore meet in the same `utilities` layer, and a class
emitted by one chunk beats a _different_ class emitted by the other by document
order: Next appends the route's chunk after the shell's. That is the order the
app relies on, and it is why the surface import is not wrapped in a layer —
`@import 'tailwindcss' layer(surface)` takes Tailwind's Preflight into that
layer, so a surface's `h1 { font-size: inherit }` outranked every heading
utility the shell ships and `/quran`'s title measured 16px instead of 48px.

What that order cannot protect is a _shell_ component that pairs a base utility
with a breakpoint variant: whichever surface emits that base class wins the
property, and the `sm:`/`lg:` step silently drops. That is a code rule, not a
stylesheet one — write `max-sm:pt-5 sm:pt-6`, never `pt-5 sm:pt-6` —
`npm run check:layers` fails it, and `DialogContent`'s `phone="sheet"` prop
exists because a surface that must change a primitive's property is a case for a
prop, not for an overriding className (ADR-0132).

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

**Source.** `<WebVitalsReporter />` in the root layout observes LCP, CLS, INP
and TTFB and posts one `kind: 'vitals'` record to `/api/app-perf` when the
document is hidden. The controller writes the record twice: one `[app-perf]` log
line for a live tail, and one row in `public.perf_samples` for the report. The
row carries the same four numbers and the platform — no URL, path, user or
session. Aggregate the `kind: 'vitals'` rows to a p75; a mean would hide the slow
tail this program targets. This replaces Vercel Speed Insights, which left with
the origin's move to Render (ADR-0174) because its beacon 404s there and the CSP
never allowed Vercel's ingest host (#1498). The reporter is same-origin, so no
`connect-src` change is needed.

**Reading it.** `npm run perf:field` reads the table; see [Launch and tap](#launch-and-tap)
for the command and the window. Nothing here is CI-gated: runtime is real-user data, not a
build artifact, so it cannot fail a pull request. It is a monitoring budget: review it after a
change lands and treat a p75 regression against a ceiling as a bug, not a style choice.

**Ratchet policy.** When a change lands an improvement, re-record the baseline in
`perf/runtime-budget.json` so the next change is measured against a new floor.
The ceilings stay at the Web Vitals thresholds; only the baseline moves.

**Window limit.** `perf/runtime-budget.json` fixes the aggregation window at
`7d`, and `public.perf_samples` keeps 60 days (below), so a budget window is
always answerable from the table. A longer trend is the recorded baseline, not a
query.

## Origin load

The runtime budget answers what a browser felt. It cannot answer the other half of the 10x question:
whether the box is at 20% or 90% of what it can take. Caddy terminates TLS for every request that
reaches the origin, so its access log is that answer, and `deploy/vps/metrics.sh` reads it.

```bash
gh workflow run 'Origin metrics'                    # hourly on its own, at :23 UTC
ssh -p 2222 deploy@91.98.55.148 "metrics 24h"       # or any window: 30m, 1h, 2d
```

It prints one `key=value` per line — `requests`, `rps`, `p50_ms`, `p95_ms`, `errors_5xx` — over the
window. The read goes through the deploy key's `metrics` verb, which is one of exactly two words that
key can run (ADR-0226), so the numbers come from the box without a second credential or a shell.

One thing to read correctly: **a request served from Cloudflare's cache never reaches Caddy**, so these
are the origin's numbers, not the customers'. That is the number to scale, and a fall in `rps` next to a
flat page-view count means the edge is doing more of the work — not that fewer people came.

## Launch and tap

Web Vitals measure the page the browser rendered; they do not measure what the
instant-feel program (#486) is for: **the gap between a tap and the content that
answers it**. Three numbers carry that, measured in the client and read from one
table (#487).

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
  dashboards (SpendTrack, HabitFlow, LinkSnap, the account's posts) and by the Quran reader
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
(60/min, fail-closed) and writes two things: a single `logger.info('[app-perf]', …)`
line and one row in `public.perf_samples` (#1885, ADR-0228).
The beacon is deferred past the paint, uses `keepalive`, is skipped while
offline and is never retried — as droppable as the offline-miss beacon (ADR-0074).
The row write is droppable in the same way: a refusal is a lost sample, never a
failed request, and the row is the copy that outlives the container.
The decision and its privacy boundary are recorded in
[ADR-0075](adr/0075-launch-and-tap-timings-are-counted.md).

**What it never carries:** no URL, no path, no user, no session, no client id, no
user agent, no product name and no mutation name. The record is the platform, the
cold/warm flag and the durations; the log line is safe to grep and to keep.

**Reading it.** One command, one table (example output below):

```bash
npm run perf:field                    # public.perf_samples, last 24 hours
npm run perf:field -- --since 7d      # any window: 30m, 1h, 24h, 7d
npm run perf:field -- --file <jsonl>  # a saved log tail, not the table
```

It needs `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and
`SUPABASE_SERVICE_ROLE_KEY`; `npm run` loads `.env` when the file exists, and
`--env <file>` points at another. The read is the service role on purpose: the
table grants nothing to a client role and has no policy, because the samples are
telemetry, not a member's data.

```text
kind    platform  open  n   shell p75  content p75  paint p75
launch  shell     cold  12  812 ms     1180 ms      —
launch  shell     warm  30   96 ms      132 ms      —
tap     shell     —     41       —           —      42 ms
```

`npm run perf:field` is a nearest-rank p75 by platform (and by cold/warm for
launches). It also reads `kind: 'vitals'` rows and prints their LCP, CLS, INP and
TTFB p75, which is how the table above is now populated. `--file <path>` still
reads saved JSON lines instead of the table, for a tail that never reached it.

**Window limit.** `perf_samples` keeps 60 days, swept nightly at 03:40 UTC by
`perf-samples-sweep` — the same window the scheduler's own run log keeps, so a
perf window and the runs that collected it stay joinable for exactly as long as
both exist. Ask for anything inside that window; a longer trend belongs in the
recorded baseline below, not in a query.

**Baseline.** The baseline is this table, copied by hand from `npm run perf:field`
after a deploy. Read it, then replace the row: the ceilings in the first table do
not move, only the recorded number does. The table stays the live window; the row
here is what survives it.

| Read on    | cold open → content        | warm open → content       | tap → paint      |
| ---------- | -------------------------- | ------------------------- | ---------------- |
| 2026-11-19 | 8,631 ms (shell p75, n=47) | 6,620 ms (shell p75, n=9) | not yet recorded |

Read from the Render logs API over the seven days to 2026-11-19 (200 records),
aggregated with `node scripts/perf-field.mjs --file <jsonl>`. Both shell rows
breach the 900 ms / 150 ms ceilings; the web vitals in the same window are inside
theirs (LCP 1,596 ms, CLS 0.052, INP 128 ms), so this is the shell's launch path
and not the page's weight (#1639). Tap has no sample yet.

**Cost.** One function invocation per launch and per tap, bounded by the limiter,
and one row per accepted beacon in `perf_samples` (~120 bytes, 60 days). A launch
only sends when a content surface paints owned rows; a public/SEO route sends
nothing, and neither does a dashboard that never paints (that case is the
skeleton in its own state, not a sample).

### The paint gate

The field numbers above are the authority for real devices, and they cannot fail
a pull request — no table query runs in CI, and `perf_samples` is a monitoring
window, not a gate. `e2e/perf-paint.spec.ts` is the web-side gate that closes that
gap: it measures the same marks, on a build, before the change ships.

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

**The shell is measured on a device, not in a browser.** The `shell` row in
`perf/paint-budget.json` is the one surface the Playwright runner skips: it is
the installed WebView, whose launch the web runner cannot reach. `npm run
perf:shell` drives ten cold launches on the attached reference phone, reads the
`RoyLaunch` lines the document writes, and reduces the page's `boot`, `shell`
and `content` marks to the same `boot → content` p75 the field report uses. Its
ceiling is #486's design target (900 ms), not the relaxed CI line. The
measurement itself is recorded in
[android-shell.md](mobile/android-shell.md#what-the-document-costs-under-the-skeleton).

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
target, and the ceilings sit two to three times above it on purpose. SpendTrack's
warm ceiling is the one four-times exception, calibrated against its own measured
medians on the runner (the file's `notes` records the numbers).

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

## Page-level lab evidence

The paint gate measures the app's own `content` mark, which the local-store
dashboards and the server-rendered Quran reader write. The four main pages are
server-rendered or read on the client without that mark, so
`e2e/perf-pages.spec.ts` covers them instead:

```bash
npm run perf:pages
```

It builds and serves a production document, then measures `/`, the habitflow
tab, `/community`, `/community/explore`, `/account`, `/notifications` and the
reader's `/quran/1` and `/quran/2` under 4x CPU throttling and a ~1.6 Mbps /
150 ms link at 390x844. LCP, CLS, long
tasks, TTFB and wire bytes are written to `node_modules/.playwright/perf-pages.json`
and printed per route. Signed-in routes use the E2E account, so the same
credentials as the paint gate are needed. This is a measurement, not a gate:
the numbers move with the runner, so compare them against a recorded run rather
than treating one sample as a regression.

## Live document weight

The static gate reads `.next/server/app/<route>.html`, which only exists for
prerendered routes. A document rendered per request — `/notifications`,
`/community`, `/u/<handle>`, `/mcp/apps`, `/chats/new` — has no such file and
was invisible to the gate while still shipping bytes to users (#1662).

`npm run perf:weight` closes that hole. It derives the concrete path list from
`perf/surfaces.json`: every declared route is measured, and a dynamic segment
(`[username]`, `[surah]`, `[code]`) resolves through `weightSamples` in that same
file. A sample is normally one concrete path, but it can be a list: the surah
reader publishes both `/quran/1` and `/quran/2`, so the lightest and heaviest
members are priced instead of one lucky sample standing in for the pattern.
A dynamic pattern with no sample fails `check:surfaces` before the gate runs. The command fetches each document and its same-origin assets from
`PERF_ORIGIN` (default `https://royaraqamia.com`), then prices them with the
same `extractAssets`, `transferredSize` and bucket rules the build-artifact mode
uses. One verdict line per route shows the JS weight against its ceiling;
`--json` emits the full summaries. The origin is a third party, so a timed-out
request, a dropped connection, a 429 or a 5xx is retried three times with a short
backoff before a route is reported as unpriced; a definite answer such as a 404
is not retried.

Coverage is part of the check, not an afterthought: a route in the matrix that
does not appear in the output fails the command just as an uncovered `page.tsx`
fails `check:surfaces`. A route whose anonymous response redirects is priced
against the final document and the redirect is printed beside its verdict — the
bytes are real, but the ceiling has to describe what was served. The gate reads
the deployed origin, so a reduction in a pull request is reflected only after
that branch is deployed; use the static gate to prove a build-local win.

The ceilings for routes the live gate found over the 260 KB default were raised
in the pull request that added the gate, each with its 2026-11-22 measurement in
`perf/budget.json`, per the ratchet policy above. Lower them as those surfaces
are trimmed rather than treating the new number as a target.

## Post-paint script weight

Both gates above price the document's own script list. A chunk pulled in by a
lazy import after `load` has no `<script src>` tag, so neither gate can see it.
Issue #1820 found the client error reporter doing exactly that: an idle callback
requested a 148.8 KB gzip chunk on every route, twice the largest document
chunk, and nothing in the repository failed when it doubled.

`npm run perf:runtime` closes the hole. It resolves the same concrete paths
`perf:weight` uses from `perf/surfaces.json`, loads each one in a fresh Chromium
context at 393x852 @ 2.75 with the service worker blocked and no warm cache,
waits 3.5 seconds past `load`, and records every same-origin script response
with its gzip bytes. A response whose URL is in the document's script list is
`documentJs` — the subset the other gates price; everything else is
`afterLoadJs`; `totalJs` is the sum. `--json` includes the individual URLs and
`--update` re-records the measured values without moving a ceiling. The error
reporter is recognised by matchers on the script body rather than by filename,
because its filename is a content hash that changes on every release. Every
string in a matcher must be present: the app chunk also carries the DSN,
`captureException` and `__RoyaSentry`, so those alone would misidentify it. The
matchers live in `perf/runtime-weight.json`. `--probe-error` dispatches one
synthetic error after the clean measurement (with the `/monitoring` tunnel
blocked, so no event is posted) and records the reporter's gzip bytes as
`reporterOnErrorGzipKb` — the error path is priced from the same run too.

The gate keeps its three-at-a-time pace because the committed ceilings were
recorded with it: serial visits load more lazy chunks inside the settle window
and price a surface higher without the origin getting heavier. Under
that burst the production edge can answer 503/502 with script-less error pages,
which the coverage check used to report as an unpriced route even though the
build was fine (`/hire` on the 2026-11-24 `main` push). A 5xx document is now
named in the failure and retried on a longer backoff; a script-less success
still fails with the document status in the message.

Measured on the deployed origin on 2026-11-24, before the reporter fix (gzip KB):

| Surface          | documentJs | afterLoadJs | totalJs |
| ---------------- | ---------- | ----------- | ------- |
| `/terms`         | 202.2      | 155.9       | 358.0   |
| `/`              | 253.4      | 196.2       | 449.6   |
| `/quran/1`       | 247.6      | 155.9       | 403.4   |
| `/notifications` | 285.4      | 166.4       | 451.7   |
| `/chats/new`     | 264.9      | 166.4       | 431.3   |
| `/account/links` | 367.1      | 197.6       | 564.7   |

The reporter contributed 148.8 KB to every after-load column. The fix in
`frontend/shared/sentry.ts` installs first-party `error` and `unhandledrejection`
listeners at boot and buffers the first events. On the first event it appends a
plain same-origin `<script src="/sentry-client.js">`: Turbopack emits a
`<script async>` in prerendered HTML for every reachable dynamic import, so a
lazy `import()` would have kept loading the SDK on a clean visit. The standalone
bundle is built by `scripts/build-sentry-client.mjs` in `prebuild`, esbuild
tree-shakes the unused Replay and feedback exports, and the result is about
31 KB gzip. A clean visit requests no reporter script at all. The committed
ceilings in `perf/runtime-weight.json` still describe the deployed numbers:
this gate reads the origin, so a reduction is reflected only after the branch
is deployed. Ratchet them down then.

## CI

The `Code Quality` workflow runs `npm run build` and then `npm run perf:check`
for the prerendered routes. It also runs `npm run perf:weight` against the
public origin, so a budget breach on a per-request surface fails the same
pipeline (and therefore blocks a release, which gates on Code Quality). The
Chromium step after it runs `npm run perf:runtime -- --check` over the same
surface list, so a chunk fetched after load fails that pipeline too. To raise
a ceiling, change `perf/budget.json` or `perf/runtime-weight.json` in the same
PR and paste the measurement that justifies it there.

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

- **Static mode: prerendered routes only.** `--routes` works for routes Next
  prerenders to `.next/server/app/<path>.html`. A dynamically server-rendered
  route has no such artifact; run `--live` for those. The static route list and
  the live route list are deliberately separate — `perf:check` keeps measuring
  the same build artifacts it always has.
- **Live mode: deployed bytes, anonymous visitor.** `--live` prices the origin's
  current production documents, not the pull request's unbuilt source, and does
  not sign in. A route that only renders for a signed-in member is measured as
  the login redirect that an anonymous visitor receives; its own signed-in
  bundle still needs `perf:pages` evidence.
- **Initial request only (the static and live gates).** They count the document
  plus the subresources its HTML references. Chunks pulled in later by an idle
  callback, a lazy import or hydration are invisible to those two numbers.
  `npm run perf:runtime` measures the first 3.5 seconds after load in a real
  browser, including those chunks, and splits them from the document's own
  scripts; it does not follow later navigations or signed-in sessions.
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
