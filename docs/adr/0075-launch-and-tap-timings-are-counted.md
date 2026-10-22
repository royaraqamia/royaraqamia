# Launch and tap timings are counted, and nothing else

The instant-feel program (#486) ends on a decision: bundle the app surfaces only
if a cheap real device paints a cold open → content in **0.9 s**, a warm open in
**150 ms** and a tap → paint in **50 ms**. Its phases were argued from reasoning.
`perf/budget.json` prices the bytes and the Speed Insights budget prices Web
Vitals, but neither sees the number the program exists for: **what the user feels
between a tap and the content that answers it**.

## The decision

**The client marks the launch and the tap, and sends one bounded record per
launch and per tap to `/api/app-perf`, which writes one Vercel log line.**

The marks live on the User Timing timeline (`performance.mark`/`measure`), so a
profiler trace and a log line describe the same launch:

| mark      | written at                                                          |
| --------- | ------------------------------------------------------------------- |
| `boot`    | `instrumentation-client.ts`, before hydration                       |
| `shell`   | `AppPerfObserver`, the chrome's first committed frame               |
| `content` | the product dashboards, after owned rows paint from the Local Store |
| `tap`     | a local mutation's tap; `paint` follows in the first frame after it |

Both launch durations run from `performance.timeOrigin`, so a cold open pays the
document request inside the number and a warm open does not.

**Cold vs warm is the document's provenance**, because that is the split the
gate budgets on. A reload and a back/forward navigation are warm; otherwise a
document that reports `transferSize === 0` came from Cache Storage or the HTTP
cache and is warm. Everything else — including a WebView that reports no
navigation entry — is cold, the conservative reading.

**The platform tag is coarse on purpose:** `shell` (the Capacitor bridge, or the
`RoyaraqamiaShell` user agent), `pwa` (`display-mode: standalone`), `web`.

The payload is `{ version, kind, platform, cold, shellMs, contentMs }` for a
launch and `{ version, kind, platform, paintMs }` for a tap. One launch record is
sent per launch, when the first content surface paints; one tap record per local
mutation.

**The sink is a Vercel log line.** `/api/app-perf` validates the body
(`AppPerfReportSchema`), applies an Upstash limit per IP (60/min, fail-closed)
and writes one `logger.info('[app-perf]', …)` line. `npm run perf:field`
(`scripts/perf-field.mjs`) reads the JSON lines back and prints a nearest-rank
p75 per platform, with launches split cold and warm. The endpoint answers
`{ success: true }` and nothing reads it back.

## What is deliberately not collected

- **No URL, not even a path.** A per-page breakdown is a browsing log; the
  record says only that a content surface painted.
- **No product or mutation name.** Same reason: which link a visitor created,
  and which habit they checked, is a behaviour, not a duration.
- **No user, session, client id or cookie.** The beacon is sent with
  `credentials: 'omit'`; the server keys the rate limit on the IP the platform
  reports and stores nothing from the request.
- **No user agent, no cache version, no bytes.** The platform tag is the only
  thing about the device, and it is three values wide.

## Consequences

- **Droppable by design.** The beacon is deferred off the paint path (idle, or a
  macrotask), uses `keepalive`, is skipped while offline and is never retried. A
  limiter outage drops a sample rather than opening a write path — the same
  guarantees as the `/offline` beacon (ADR-0074).
- **One invocation per record.** A launch only sends when a content surface
  paints owned rows, so public and SEO routes send nothing. That bounds the cost
  to product sessions, and a tap is bounded by the limiter.
- **A launch that never paints sends nothing.** A dashboard stuck on its
  skeleton is a failure its own UI and Sentry already carry; this counter does
  not need a fourth signal for it. The absence shows up as a sample count that
  stops growing.
- **Tap coverage is the sites instrumented today** — the HabitFlow check-in and
  LinkSnap's link create. A new site is one `beginTap()` call, and the number is
  a p75 over whatever is covered: adding a site changes the population, so read
  the count beside the value.
- **The window is short.** Vercel keeps runtime logs for an hour on Hobby, so the
  reading is the number just after a deploy, not a historical trend. The program
  records its baseline by hand in `docs/performance.md`.
