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

Images are out of scope here; they are handled by the image-compression ticket
in the same program. Runtime metrics (INP, long tasks, dropped frames) are a
separate concern — this tool measures transferred weight only.

## Commands

```bash
npm run build                  # perf tooling reads .next, so build first
npm run perf:baseline          # report the current numbers + budget status
npm run perf:check             # same, but exit 1 on a budget breach (used in CI)
npm run perf:baseline:update   # re-record perf/baseline.json after an intended change
```

Point it at other built routes, or a different build directory:

```bash
node scripts/perf-baseline.mjs --routes /,/blog,/terms
node scripts/perf-baseline.mjs --public-dir public
node scripts/perf-baseline.mjs --json          # machine-readable output
```

## Baseline

Recorded from the landing page (`/`) and committed as `perf/baseline.json`. Raw
values; `legacy` is not part of the total.

| Category  | Raw       | Gzip         |
| --------- | --------- | ------------ |
| `html`    | 432.6 KB  | 59.6 KB      |
| `js`      | 788.2 KB  | 244.3 KB     |
| `css`     | 640.8 KB  | 71.4 KB      |
| `fonts`   | 160.5 KB  | 160.5 KB     |
| **TOTAL** | 2022.1 KB | **535.9 KB** |
| `legacy`  | 110.0 KB  | 38.7 KB      |

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
  Route keys are normalized, so `blog`, `/blog` and `/blog/` all match the same route.
- Available metrics: `totalGzipKb`, `jsGzipKb`, `cssGzipKb`, `htmlGzipKb`,
  `fontsGzipKb`. A metric absent from both `default` and the route's override is
  simply not constrained.
- Ceilings sit a few percent above the current baseline: they catch
  **regressions**, not intentional reductions.

Edit the file to change a ceiling. The values are deliberately not copied here,
so the docs cannot drift from the guard.

**Ratchet policy.** As program tickets land, lower the ceilings to the new
measured values so the win cannot silently leak back. Reductions never trip the
budget; only growth does, which is the point.

## CI

The `Code Quality` workflow runs `npm run build` and then `npm run perf:check`,
so a budget breach fails the pipeline (and therefore blocks a release, which
gates on Code Quality). To raise a ceiling, change `perf/budget.json` in the
same PR and justify it there.

## Limitations

- **Prerendered routes only.** `--routes` works for routes Next prerenders to
  `.next/server/app/<path>.html`. A dynamically server-rendered route (for
  example `/blog/[slug]`) has no such artifact and needs a live-server mode,
  which this tool does not implement.
- **Initial request only.** It counts the document plus the subresources its HTML
  references. Chunks pulled in later by client-side navigation or hydration are
  invisible, so it is a faithful proxy for first-load weight, not for everything
  a session eventually downloads.
- **Build artifacts, not the wire.** Sizes are read from disk. `gzip` means
  "gzip when that helps, otherwise raw"; real header/frame overhead and any CDN
  brotli are not modelled.
- **Weight, not jank.** No INP, long tasks, or frame timing. This measures bytes
  transferred, which is a different axis from the smoothness work in the
  program.
