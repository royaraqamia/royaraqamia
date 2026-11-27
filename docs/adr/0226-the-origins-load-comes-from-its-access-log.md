# The origin's load numbers come from its own access log

`#1885` asked a single question and found no instrument for it: after the move to the VPS, nothing in the
repository produced the origin's request rate or its latency. ADR-0225 answered the memory half with an
hourly health line. This is the other half.

The instrument was already in the request path. Caddy terminates TLS for everything that reaches the
origin, so it sees the count and the duration of every request whether or not the app is healthy. The
decision is to read that, rather than to add a collector.

## Decision

1. **Caddy logs access to stdout.** One `log` line in the site block, default JSON, ending in Docker's
   `json-file` driver: 10 MB × 3, the same bounded window the app container already has.
2. **`deploy/vps/metrics.sh` reads it.** `docker logs --since <window>`, one pass to extract duration and
   status, then requests, rate, p50, p95 and the 5xx count as `key=value`. No agent, no scrape interval,
   no storage.
3. **The read goes through the deploy key.** `authorized_keys` now forces `ci.sh`, which accepts exactly
   `deploy` and `metrics <window>`, matched literally and never passed to a shell (ADR-0209's key, one word
   wider). One credential, two verbs, still no shell.
4. **`Origin metrics` runs it hourly** (`.github/workflows/origin-metrics.yml`), writes the numbers into
   the run summary, and warns — rather than fails — when a window is empty, because an empty window is a
   quiet hour or a disabled log and the two look the same from outside.

## Why not the alternatives

- **Caddy's Prometheus endpoint** (`:2019/metrics`) is a better long-term shape, but it means exposing an
  admin API and computing histogram quantiles by hand or adding a scraper to a 2 GB box. The access log
  already carries the exact durations; percentiles are a sort, not an approximation.
- **A metrics agent** (node_exporter, Prometheus, Grafana) is a second service and a second storage
  problem to answer one number on a single host.
- **Shipping the log off the box** turns a 30 MB window into a log pipeline with a retention policy and a
  bill. If history is ever needed, that is the time to add it, with the retention question answered first.
- **Reading the app's own logs** sees only the requests that got an answer from the app — a 502 from a
  dead container is exactly the moment the number matters.

## Consequences

- The numbers are the **origin's**, not the customers': a request served from Cloudflare's cache never
  reaches Caddy. That is the right number for "can this box take 10x", and the wrong one for "how many
  people visited".
- History is a rolling window controlled by Docker's rotation, not a series. A trend needs the sink in
  the second half of #1885 (`/api/app-perf`), not another probe.
- `rps` falls when the edge caches more of the site, which is an improvement that looks like a regression
  unless the page-view count is read next to it — worth knowing before anyone tunes a threshold against it.
- The key can now read container logs as root. That is more than it could do before (nothing but
  `deploy.sh`), so the verb list is the security boundary: two literal words, no arguments beyond a
  duration, no shell.
