# Vercel Usage Budget (Hobby)

On 2026-10-12 the project hit **Exceeded free resources** on Vercel Hobby:
`Fluid Active CPU 5h 6m / 4h`. Everything else was inside its cap but climbing
(`Functions Storage 7.06/10 GB`, `Deployment Storage 4.88/10 GB`,
`Fast Origin Transfer 1.88/10 GB`, `ISR Writes 28K/200K`).

On 2026-10-20 the same panel read `Deployment Storage 9.18/10 GB` and pull
requests started failing the Vercel check with **Deployment rate limited — retry
in 24 hours**. That is a second, separate cap: Hobby also limits deployment
_creation_ to roughly 100 per day per project, and 94 deployments had been
created in the previous 24 hours (149 retained). Pruning does not refund that
one — only creating fewer deployments does ([below](#deployment-creation-is-capped-too)).

Hobby has no overage. When a cap is reached the resource stops being usable, so
this page records what was measured, what changed, and what to watch.

## Diagnosis

| Signal (2026-09-12 → 2026-10-12) | Value                                 |
| -------------------------------- | ------------------------------------- |
| Vercel Web Analytics             | 419 visitors, 4,374 pageviews         |
| Function Invocations             | 235K / 1M                             |
| CDN Requests                     | 216K / 1M                             |
| ISR Writes                       | 28K / 200K                            |
| Fluid Active CPU                 | 5h 06m / 4h                           |
| Deployments created              | 325 (291 production, 127 `[skip ci]`) |

Traffic is tiny, so the caps were not reached by users. Three separate problems
were behind it, in order of size.

### 1. `GET /mcp` pinned a function for a full minute, every minute

The worst offender was self-inflicted. The Streamable HTTP transport opens a
standalone SSE stream on `GET`, and a stateless server never writes anything into
it, so the client held the connection until the platform killed it and then
immediately reconnected. Runtime error clusters over seven days:

```
Vercel Runtime Timeout Error: Task timed out after 60 seconds
  count=2779  users=12  routes=/mcp
[ERROR] [MCP:SESSION] refreshSession failed: Invalid Refresh Token: Already Used
  count=313
```

Live logs showed the cadence — `GET /mcp` hitting the 60s ceiling at 10:25:36,
10:26:38, 10:27:39, 10:28:41, 10:29:42, one every ~61s per connected client. Each
one is a Node function held open for 60 seconds: the largest single consumer of
Fluid Active CPU _and_ Provisioned Memory, and the source of the
`refreshSession` error storm through the reconnect loop. The previous mitigation
(`maxDuration = 60`) only shortened each pin; it did not stop the loop.

### 2. Execution amplification on cached routes

235K invocations against 4.4K pageviews is ~54 invocations per pageview, and
28K ISR writes is ~6.4 per pageview. Timer-based ISR (`revalidate = 60`) on the
community routes and the sitemap regenerated renders that changed nothing, and
the middleware matcher ran on nearly every request including public assets.

### 3. Storage is retention, not build output

7.06 GB of Functions Storage is 325 retained deployments × ~21 MB. Source maps
are **not** the cause: Sentry v11 deletes them after upload by default and the
token is configured, so the 109 MB of `.map` files a local build produces are
already gone from deployed bundles. Hobby never prunes deployments, so the meter
grows with every deployment whether or not anything ships.

The daily prune from 2026-10-12 does not stop that growth on its own. It was
invoked with `--min-age-days=1`, which protects every deployment younger than a
day; at ~90 deployments/day that is the entire retained set, so `keep` never
bound and storage climbed back to 9.18 GB by 2026-10-20 (~54 MB per retained
deployment — the build output has grown since the 21 MB measured in October).
The gate is now six hours and `keep` is 25, which is what the meter actually
responds to.

### 4. Deployment creation is capped too

Hobby also limits deployment _creation_ to roughly 100 per day per project, and
that is what the pull-request check reports as **Deployment rate limited — retry
in 24 hours**. It is not the storage meter and pruning does not refund it.

On 2026-10-20, 94 deployments were created in 24 hours: 64 of the 149 retained
were preview deployments (one or more per push to an agent's branch) and 85 were
production (one per merge plus one per `chore(release)` commit). The fix is to
stop deploying branches at all — `vercel.json` sets `git.deploymentEnabled` to
`main` only — which leaves ~30 production deployments/day. A CLI `vercel deploy`
still works; only the Git integration's per-branch previews are off.

## What changed

| Lever                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Where                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CPU: `GET /mcp` answers 405** instead of opening a stream nothing can complete (spec-compliant; clients stay on POST). `maxDuration = 60` still covers POST/DELETE tool calls. Vercel does not cache a 405, so a lingering client still costs one (millisecond) invocation per reconnect instead of pinning a function for 60s                                                                                                                                                             | `app/mcp/route.ts`                                                                                                                                         |
| CPU: Sentry tracing 10% → 1% (server, edge, client)                                                                                                                                                                                                                                                                                                                                                                                                                                          | `sentry.server.config.ts`, `sentry.edge.config.ts`, `frontend/shared/sentry.ts`                                                                            |
| CPU: Sentry no longer instruments middleware (it runs on nearly every request)                                                                                                                                                                                                                                                                                                                                                                                                               | `next.config.js` (`autoInstrumentMiddleware: false`)                                                                                                       |
| CPU: `reactComponentAnnotation` and `automaticVercelMonitors` were under `webpack:`, where SDK v11 ignores them — moved to the top level and switched off; dead `hideSourceMaps`/`widenClientFileUpload` removed; source maps are only generated when there is a token to upload them to                                                                                                                                                                                                     | `next.config.js`                                                                                                                                           |
| Invocations: client route cache 30s/300s → 120s/1800s                                                                                                                                                                                                                                                                                                                                                                                                                                        | `next.config.js` (`staleTimes`)                                                                                                                            |
| Invocations: middleware matcher no longer runs on public assets, the Sentry tunnel, fonts, CSS/JS/JSON/XML or service-worker files                                                                                                                                                                                                                                                                                                                                                           | `proxy.ts` (+ `backend/middleware/__tests__/proxy-matcher.test.ts`)                                                                                        |
| Invocations: `/api/version` is a static route (it was re-invoked for the 60s poll of every open tab)                                                                                                                                                                                                                                                                                                                                                                                         | `app/api/version/route.ts`                                                                                                                                 |
| ISR writes + render CPU: community routes 60s → 300s (pages and loaders), sitemap 60s → 300s, CDN `s-maxage=300`                                                                                                                                                                                                                                                                                                                                                                             | `app/community/page.tsx`, `app/community/[slug]/page.tsx`, `app/u/[username]/page.tsx`, `app/sitemap.ts`, `backend/loaders/community.ts`, `next.config.js` |
| Invocations + DB: codes that cannot exist are rejected before the Supabase lookup and answered with a cacheable 404 instead of a redirect into a full `/linksnap` render                                                                                                                                                                                                                                                                                                                     | `backend/services/linksnap/redirect-url.ts`, `backend/controllers/linksnap.ts`                                                                             |
| Correctness: click analytics and owner notifications run under `after()` instead of a bare fire-and-forget promise, which Fluid compute can cut off with the response                                                                                                                                                                                                                                                                                                                        | `app/[code]/route.ts`                                                                                                                                      |
| **Deployment rate: `git.deploymentEnabled` is `main` only** — pull-request branches no longer create a preview deployment. That was 64 of 149 retained deployments and the bulk of the 94 created in the day that exhausted the Hobby creation cap on 2026-10-20. Review happens on the pull request, not on a preview URL                                                                                                                                                                   | `vercel.json`, `README.md`                                                                                                                                 |
| Storage: retained deployments are pruned daily to the newest 25, preserving rollback candidates and the current production deployment, and nothing younger than six hours. First real run on 2026-10-12 deleted 201 of 266 and then hit Vercel's own deletion rate limit (~200 per 10 minutes), which the script now paces around (180 per run; the remainder converges on the next run). Counted on 2026-10-12: 325 retained → 60 kept, 265 deleted, ~5.6 GB of Functions Storage reclaimed | `.github/workflows/prune-deployments.yml`, `scripts/prune-deployments.mjs`                                                                                 |

Community caching stays correct because every mutation already invalidates by
tag (`COMMUNITY_MUTATION_TAGS` via `backend/transport/http-result.ts`), so the
300s window is a floor for **scheduled** posts — the published filter admits
`scheduled AND publish_at <= now` rows with no write — not the freshness
mechanism for edits.

`/verify/[code]` and the certificate loaders stay at 60s on purpose: a
certificate page showing a revoked credential for five minutes is worse than the
CPU it would save.

## Deliberately not changed

- **Skipping the `[skip ci]` release deploys.** 127 of 325 deployments come from
  `chore(release)` commits and `ignoreCommand` could skip them, but the release
  commit is what bakes the new `releaseVersion`/commit into the build, so
  skipping it would leave the previous deployment serving the old version and
  break update detection. Pruning is the lever instead.
- **Caching the article render (`ReactMarkdown` + `rehype-highlight`).** It is
  the most CPU-dense thing left in a community render, but it is unmeasured:
  after the `[slug]` window moved to 300s it renders at most a few times an hour,
  and precomputing it means either shipping a sanitizer (`marked` would newly
  allow raw HTML that `ReactMarkdown` escapes today) or a `content_html` column
  and a publish-path migration. Revisit only if Sentry p75 for
  `/community/[slug]` stays in the hundreds of milliseconds after this change.
- **The `/monitoring` Sentry tunnel.** Every tunnelled client event is a function
  invocation, but `Content-Security-Policy` forbids direct `sentry.io` calls, so
  removing the tunnel means loosening the CSP. Sampling was cut instead.
- **Vercel WAF rules for scanner traffic.** The firewall config is not
  provisioned for this project (`PATCH`/`PUT /v1/security/firewall/config` both
  answer `404 Seawall Config not found`, and `firewallEnabled` is `false`), so
  CRS scanner protection has to be enabled from the dashboard, not from here.
  Enabling **Scanner Detection** and **PHP Attack** with a deny action is the
  intended follow-up; the code-side guard in `redirect-url.ts` covers the codes
  that cannot exist, but word-shaped scanner paths (`/wp-admin`) still cost one
  invocation each.
- **Moving the rates cron off Vercel.** A daily cron is ~30 invocations/month;
  it is noise against the budget.

## How to check

Observability Plus is not available on Hobby, so the metrics API is not usable
(`POST /v2/observability/query` and `/v1/billing/charges` both reject the plan).
Two things that _do_ work, and one that found the whole problem above:

- **Runtime error clusters, 7-day window** — `get_runtime_errors` / the dashboard
  Errors view. Pre-aggregated, so it is fast and it is not limited to the one-hour
  log retention. This is where the `GET /mcp` timeouts were found.
- `npx vercel logs --project royaraqamia --group-by requestPath` — live requests,
  last hour only; useful immediately after a change.
- **Sentry performance** (already installed) — p75 server transaction duration
  per route; the slow routes are the ones burning CPU.
- **Dashboard → Project → Usage** — the authoritative view of every meter.
- `npm run prune:deployments -- --dry-run` — what a prune would delete, without
  deleting it.
- **Deployment count** — the creation cap is not a line on the Usage panel.
  `npm run prune:deployments -- --dry-run` prints the retained total, and
  `vercel ls royaraqamia` lists them with ages; both are how you tell whether a
  pull request's "Deployment rate limited" is churn rather than a bad commit.

Monthly routine: read the Usage panel early in the period (a cap hit mid-month is
felt as an outage, not a bill), confirm the retained deployment count is near
`keep`, and re-check `Fluid Active CPU`, the tightest of the caps. To prune on
demand, dispatch the workflow (`gh workflow run prune-deployments.yml`) — it
defaults to a dry run; pass `-f dry_run=false -f keep=25` to delete.

The Android shell's APK is the one large file the site serves: `/android/*.apk` is
rewritten to Supabase Storage (ADR-0047), so it costs Fast Data Transfer rather
than CPU — a rewrite is proxied at the routing layer, which is why it is not a
route handler (a function's response body is capped at 4.5 MB and the APK is
~7.4 MB). A few thousand installs or updates a month is what would move this
meter, against a 10 GB cap.
