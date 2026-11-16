# The heap cap belongs to the build, and a restart leaves a line

On 2026-11-15 the origin was restarted for exceeding its memory limit. The service had served the
10:26 UTC boot for two and a half hours, the last thing it logged before it died was a `/rates`
request still waiting on `iraqprices.com`, and there was no traffic spike to explain it: the free
instance is 0.1 CPU / 512 MB, and the request was enough.

Two things made that restart worse than it had to be.

**The heap cap was the build's, and the service inherited it.** `render.yaml` set
`NODE_OPTIONS=--max-old-space-size=6144` as a service variable, because collecting page data once
died on "used over 8GB" (ADR-0186's build). A service variable reaches `next start` as well, so V8 on
a 512 MB container was told it had six gigabytes to fill. V8 collects against the limit it is given:
the larger the limit, the later collection starts, and the kernel killed the process at the wall
before the GC it never saw coming.

**A restart left no line of its own.** The process wrote nothing when it started and nothing while it
ran, so the only way to date the restart was to diff deploy times against instance IDs in the log
stream — which is how ADR-0189's trigger ("an OOM restart in Render's events") had to be checked by
hand, weeks after the fact.

## The decision

1. **The 6 GB belongs to the build.** It moves into the build command
   (`NODE_OPTIONS=--max-old-space-size=6144 npm run build:render`), where page-data collection needs
   it, and the service variable becomes `--max-old-space-size=384`. Measured: 6144 reports a
   6,336 MB total heap limit, the default 2,240 MB, and 384 reports 576 MB — the old generation plus
   the young generation V8 adds on top. With ~100 MB of non-heap RSS in a 512 MB container, the two
   walls now sit ~60 MB apart instead of 5.8 GB apart, which is what makes collection happen while
   the instance is still alive.
2. **Every boot writes one line.** `[boot]` carries the release, the commit, the instance, the pid,
   the RSS at start, the heap limit the process actually has (`getHeapStatistics()`, so a cap that
   did not take effect is visible), the previous start, how long that process had been running, and
   whether this start came off the same commit. The previous start lives in Redis
   (`runtime:boot`) behind an 800 ms budget: a store that cannot answer leaves the fields `null`
   rather than delaying or failing a cold start.
3. **Every five minutes the process writes its size.** `[memory]` carries RSS, heap used, the heap
   limit, external memory and uptime. That is the ramp-or-flat reading the dashboard graph gives,
   in the log stream the owner already reads, and it is `unref`'d so it can never hold the process
   open.

## The alternatives

- **Keep 6 GB at runtime and buy the 2 GB plan.** That is the fix ADR-0189 already reserves for the
  second data point, not the first: paying now would have hidden a cap that was simply set wrong.
- **Cap the runtime at 256 MB.** A lower cap makes the JS error more likely to arrive first, at the
  cost of refusing ordinary renders: Next plus Sentry is the floor in
  [memory-budget.md](../memory-budget.md), and 384 MB keeps the two walls close without crossing it.
- **Write a "graceful exit" marker on `SIGTERM` to tell an OOM kill from a deploy.** Next's
  `start-server` already owns `SIGTERM`: it stops accepting connections, drains, and exits `143`. A
  handler of ours would either cut that drain short or race its own Redis write against the exit, so
  the marker would be least reliable exactly on the deploys it described. `sameCommitAsPreviousBoot`
  answers the useful half instead: `false` means a new build, `true` means the same build came back.
- **Read the memory graph from the Render API.** It is not in the CLI or the public API; the graph
  stays a dashboard visit, which is why the process reports its own size.

## Consequences

- **A heap exhaustion has a chance to be a logged error.** When the old generation fills, V8 throws
  `JavaScript heap out of memory`, which names the allocation and keeps the cause in the log stream.
  The container is still the outer wall — a 576 MB total heap limit against 512 MB of container is
  not a guarantee — so a second kill is ADR-0189's second data point, not a regression.
- **384 MB is a product ceiling, not a process one.** Raising it without moving to `1c-2g` pushes the
  heap limit back away from the container, which returns the process to "killed first, explained
  later".
- **A free-plan wake writes a boot line too.** `false`-commit boots are deploys; same-commit boots are
  a wake after a spin-down or a restart after a kill, and the deploy list tells those apart. Render's
  event stream remains the authority on the cause, and ADR-0189's trigger is unchanged: a second OOM,
  a graph above ~350 MB through an ordinary day, or one user-visible failure buys the 2 GB plan.
- **The trace costs one Redis read per boot.** With `UPSTASH_REDIS_REST_URL`/`_TOKEN` unset — local
  development, CI — the boot line is written with the previous-boot fields `null` and nothing else
  changes.
