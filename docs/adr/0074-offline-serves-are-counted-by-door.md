# `/offline` serves are counted by door, and nothing else is

The offline roadmap (#447–#450) ends on a claim: after the phases, `/offline`
should answer only a brand-new install with no network, `/admin`, `/mcp/connect`
and a never-visited dynamic detail route (#473). Until now that claim rested on
the offline e2e suite and manual drills — an `e2e-offline.yml` run proves the
code path exists, not that production takes it. A regression (a bad deploy, a
cache-version change, an eviction wave) would surface as a user complaint.

## The decision

**The worker counts every `/offline` serve, by the door that led to it, and one
bounded beacon per serve lands in the Vercel log.**

Every path that answers the fallback now goes through one helper
(`serveOffline` in `public/sw.js`), so the door is named at the call site instead
of being inferred afterwards:

| door                   | what happened                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `navigation-deadline`  | an ordinary navigation's network answer missed the 10s deadline (#447)                                           |
| `navigation-offline`   | an ordinary navigation had no cached copy and no network                                                         |
| `online-only-deadline` | a never-cache navigation (`/admin`, `/mcp/connect`) missed the deadline                                          |
| `online-only-offline`  | a never-cache navigation had no network                                                                          |
| `static-offline`       | a static-asset navigation's fetch failed                                                                         |
| `api-offline`          | an API-read navigation's fetch failed                                                                            |
| `no-fallback`          | `/offline` itself was not in Cache Storage — the first-install shape, and the one that says the shell is missing |

The payload is `{ version, door, cache }`, where `cache` is the tally of cache
outcomes since the previous report: `hits` (answered from Cache Storage),
`misses` (no entry at request time), `failures` (a fetch threw or was cut by the
deadline). The tallies ride along with a serve rather than being beaconed on
every request, which is what bounds the traffic: the report rate **is** the
offline-page rate, and the roadmap says that is nearly zero.

**The sink is a Vercel log line.** `/api/offline-serve` validates the body
(`OfflineServeReportSchema`), applies an Upstash limit per IP (30/min,
fail-closed), and writes one `logger.info('[offline-serve]', …)` line. A
maintainer reads it with a log query:

```text
[offline-serve]   # then group by the door in the JSON context
```

The endpoint answers `{ success: true }` and nothing reads it back.

## What is deliberately not collected

- **No URL, not even a path.** The door class is the only thing that says where
  the user was, and it is coarse on purpose: page identity is what the roadmap's
  privacy boundary excludes, and a URL would turn a counter into a browsing log.
- **No user, session, client id or cookie.** The beacon is sent with
  `credentials: 'omit'`; the server keys the rate limit on the IP the platform
  reports and stores nothing from the request.
- **No timing, no sizes, no cache-version, no user agent.** A regression shows
  up as a door count changing shape, which is the question the issue asked.
- **No fourth-party script.** Sentry stays the error sink; the worker cannot
  import `@sentry/nextjs`, and hand-rolling a Sentry envelope from the worker
  would tie a counter to an SDK's wire format for no gain.

## Consequences

- The beacon is **droppable by design**: it is not awaited (`/offline` must paint
  instantly and the user is already waiting on a failure), it uses `keepalive` as
  a best effort at outliving the worker, and it is never retried. A limiter
  outage drops the signal rather than opening an unbounded write path. This is a
  field signal, not an audit — the spec's telemetry rule ("best-effort, bounded
  and droppable") is unchanged.
- **A cache hit is not a serve.** The five doors are counted only where the
  fallback actually answers, so the counter measures the user-visible failure and
  not the cache's health; the `cache` tallies carry the latter.
- `scripts/__tests__/sw.test.mjs` proves the count exists **with no network**:
  the only request the fake network answers is the beacon, and the tests assert
  the door, the tallies, the absence of a URL, and that the response does not
  wait on the beacon.
- `backend/controllers/__tests__/offline-metrics.test.ts` pins the schema → log
  line seam: an unknown door, a negative tally or an unknown version is refused
  before a bucket is spent, and unknown keys (a stray `url`, `userId`) never
  reach the log.
- The endpoint is a function invocation per serve. That is the entire cost, and
  the volume argument above is what keeps it inside the Hobby budget
  (`docs/vercel-usage.md`).

## Limits

- **Worker lifetime is the aggregation window.** `cache` tallies reset on every
  report and a worker terminated between two serves loses the second tally. That
  is acceptable: the door count is the acceptance criterion, and the tallies are
  a shape, not a total.
- **An offline beacon cannot be sent.** A serve caused by "radio off" reports
  nothing until the network returns, and then only if the same worker is still
  alive. The doors most likely to be reported are therefore the deadline ones;
  a `navigation-offline` count is a floor, not a census. Reading a zero as "no
  offline users" would be the mistake this ADR is warning about.
- **The first install is counted, not excluded.** `no-fallback` is the door the
  roadmap expects to stay visible; it is not noise to filter out.
- **This does not cover the Android shell's native states.** It counts the
  worker, which the shell also runs (ADR-0036), so WebView navigations are
  inside the count; a native launch that never reaches the site is not.
