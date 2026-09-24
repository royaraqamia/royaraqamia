# Landing page client-JS audit

Investigation for issue #128, in the performance program (issue #118) and under
ADR 0004. It maps what the landing page ships to the browser, prices each part,
and ranks the cuts worth making. **It produces a decision, not code changes** —
each cut below needs its own ticket before it is implemented.

Recorded 2026-09-24 against the build at the tip of `main` after the ADR 0004
flattening (tickets 1–5).

## Method

Two independent measurements, so a number is never taken on faith:

1. **Measured first load.** `scripts/perf-baseline.mjs` reads the prerendered
   `/` HTML and resolves every `<script>`/`<link>` it requests to a file on
   disk, reporting raw and gzip bytes. This is what a visitor actually
   downloads, and it is the number the weight budget guards.
2. **Per-module attribution.** `npx next experimental-analyze -o` writes the
   Turbopack analysis to `.next/diagnostics/analyze/`; `data/analyze.data`
   carries a `compressed_size` per source per output file. Summing those for the
   client chunks of the `/` route gives a package-level breakdown. This is the
   only way to attribute bytes, because Turbopack strips module paths from
   production chunks.

The first measurement is authoritative for "what loads". The second is scoped to
the route's **reachable client graph**, which includes async chunks a given
visitor may never fetch; the two are labelled separately below.

## What the landing page ships on first load

From the build: 18 chunks, **245.9 KB gzip** of JavaScript (excluding the legacy
polyfill), plus 65.4 KB CSS, 160.5 KB fonts and 56.7 KB HTML.

| Slice                          | Gzip         | Share of JS | Notes                                        |
| ------------------------------ | ------------ | ----------- | -------------------------------------------- |
| Framework (5 root chunks)      | 128.8 KB     | 52%         | React, the App Router, Turbopack runtime     |
| **`motion`**                   | **~64.9 KB** | **26%**     | Spread across 3 first-load chunks            |
| App code, `lucide-react`, rest | ~52.2 KB     | 21%         | Landing components and their icons           |
| `nomodule` polyfill (legacy)   | 38.7 KB      | —           | Block script; modern browsers never fetch it |

Only the `motion` slice is a live candidate. The framework share is the price of
React and is not actionable here.

## The reachable client graph for `/`

46 client chunks, **913.1 KB gzip**, including async chunks. A package here is
_reachable_ from the landing page, not necessarily downloaded on first load —
the next section separates the two.

| Package         | Gzip     | Purpose on this route                               |
| --------------- | -------- | --------------------------------------------------- |
| `next`          | 222.6 KB | Framework                                           |
| `zod`           | 130.9 KB | Validation — reached only via contract imports      |
| `@sentry/*`     | ~255 KB  | Error reporting; **Replay + Feedback = 75.4 KB**    |
| `motion` family | ~73 KB   | Animation (`motion-dom` 54.7, `framer-motion` 15.7) |
| `@supabase/*`   | ~66 KB   | Auth session state                                  |
| `lucide-react`  | 19.9 KB  | Icons                                               |
| `sonner`        | 18.4 KB  | Toasts                                              |

### What is actually in the first load

Probing each first-load chunk's contents settles which of those are real
first-load costs:

- **`motion` is first-load** — present in 3 of the 18 chunks.
- **`zod`, the Sentry SDK, `@supabase/*` and `sonner` are not** — none appear in
  any first-load chunk. They live in async chunks. (Sentry's `0b921oi51pd34.js`
  is a 5.7 KB loader stub, not the SDK.)

That reordering matters: the async packages are large but do not delay first
paint. The only first-load package worth cutting is `motion`.

## Ranked candidates

| #   | Cut                                                    | Impact | Risk   | Scope       |
| --- | ------------------------------------------------------ | ------ | ------ | ----------- |
| 1   | Move `MotionProvider` out of the root layout           | High   | Medium | First load  |
| 2   | Replace `AnimatedCounter` with a static value          | Medium | Low    | First load  |
| 3   | Split zod out of contract value-imports                | High   | Medium | Async graph |
| 4   | Trim the Sentry barrel (Replay + Feedback dead weight) | Medium | Low    | Async graph |
| 5   | Lazy-load the toaster (`sonner`)                       | Low    | Low    | Async graph |
| 6   | Drop the `nomodule` polyfill                           | Low    | Low    | Legacy only |

### 1. Move `MotionProvider` out of the root layout — ~64.9 KB, 26% of first-load JS

`frontend/ui/MotionProvider.tsx` wraps every route in `LazyMotion` with
`domAnimation`, and it sits in the root layout (`app/layout.tsx`). So every
visitor downloads `motion-dom` + `framer-motion` before the page is interactive.

After ADR 0004 removed the decorative animation, the landing page barely uses
it:

- `motion.*` JSX usage in the codebase is **0**.
- The landing page's only motion consumer is `frontend/ui/AnimatedCounter.tsx`
  (`useInView`, `animate`).
- Every other consumer is a product route: `verify/*`, `linksnap/*`,
  `habitflow/*`, `admin/*`, `blogpress/*`, `UpdatePopup`.

So the provider is paid for globally and needed locally. Moving it to the routes
that animate removes ~65 KB from the landing page (and from every route that
does not animate) while leaving animated routes unchanged. Risk is medium
because it touches the root layout and needs a per-route provider plus a check
that no shared component silently depends on `m`.

### 2. Replace `AnimatedCounter` with a static value — follows from #1

`frontend/ui/AnimatedCounter.tsx` counts up when scrolled into view. Under ADR
0004's rule — _if a non-per-frame alternative delivers the same function, the
effect is decorative_ — the final number rendered directly delivers the same
function. Removing it is what makes cut #1 possible for the landing page at all.

### 3. Split zod out of contract value-imports — 130.9 KB reachable

`shared/contracts/*.ts` import `z` and build schemas at module scope. Two of them
are reached from the landing page by **value** imports, not type-only ones:

- `frontend/state/NotificationContext.tsx` (root layout) → `@/shared/contracts/notifications`
- `frontend/ui/TrainingCourses.tsx` (landing page) → `@/shared/contracts/training`

Importing a plain constant (`TRAINING_COURSE`) or a type from a module that also
constructs schemas drags the whole module — and zod — into the bundle, because
top-level `z.object({...})` calls are not tree-shaken away. zod is 130.9 KB in
the graph.

The fix is structural: keep constants and types in zod-free modules, or make the
schemas lazily constructed, and use `import type` where only types are needed.
Impact is high wherever the package is reachable; on `/` it is async, so it
improves navigation and interaction rather than first paint. Risk is medium
because it touches shared contracts used by both client and server.

### 4. Trim the Sentry barrel — 75.4 KB of dead weight

`frontend/shared/sentry.ts` already lazy-loads the SDK on idle and passes
`integrations: []`, so **Replay and Feedback are not enabled**. Yet
`@sentry/replay` (50.3 KB), `@sentry/feedback` (19.9 KB) and
`@sentry/replay-canvas` (5.2 KB) are in the async graph because the
`@sentry/nextjs` barrel re-exports them and Turbopack emits every reachable
dynamic import. Importing from narrower subpaths, or excluding those integrations
explicitly, removes bytes that are downloaded and never executed.

### 5. Lazy-load the toaster — 18.4 KB

`sonner` is already async, so this is a small, low-risk tidy-up rather than a
first-load win. Listed for completeness.

### 6. Drop the `nomodule` polyfill — 38.7 KB, legacy only

Modern browsers do not fetch the `nomodule` script, so this is not a cost for the
devices ADR 0004 targets. It is build weight only, and it is already ticket 7 in
this program.

## Recommendation

Pursue **#1 and #2 together** — they are the only cuts that reduce the landing
page's first-load JS, and together they remove roughly a quarter of it. Then
**#3**, which is the largest single package in the client graph and a structural
fix worth doing once. **#4** is a cheap follow-up. **#5** and **#6** are already
covered elsewhere or are trivial.

Rejected: rewriting server/client boundaries speculatively (no measurement
justifies it); chasing the framework share (not actionable); and treating the
async packages as first-load problems (they are not).

## Appendix: reproducing this

```bash
npm run build
npm run perf:baseline            # first-load bytes per route
npx next experimental-analyze -o # writes .next/diagnostics/analyze/
```

`.next/diagnostics/analyze/data/analyze.data` is a JSON header followed by a
binary adjacency section. Parse the leading JSON, then sum `compressed_size` in
`chunk_parts` for the output files whose name contains
`[client-fs]/_next/static/chunks`, resolving each `source_index` to a path by
walking `parent_source_index` up to a `source_roots` entry. Per-route scoping is
free: each route has its own `data/<route>/analyze.data`.
