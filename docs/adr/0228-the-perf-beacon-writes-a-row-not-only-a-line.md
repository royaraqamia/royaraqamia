# The perf beacon writes a row, not only a line

`#487` gave the instant-feel program its field numbers by writing one
`logger.info('[app-perf]', …)` line per launch, tap and page life, and reading
them back with `scripts/perf-field.mjs`. After the origin moved to the VPS
(`#1885`, ADR-0221) that line lands only in the app container's stdout, which
`deploy/vps/compose.yaml` pins to `json-file`, 10 MB × 3 — overwritten, and never
readable by SQL. The published baseline is still the 2026-11-19 Render read; the
same read has no input on the box. `#1969` answered the other half of the audit's
question with Caddy's access log (ADR-0226); this is the half that carries the
client's own marks.

## Decision

1. **One table, one row per beacon.** `public.perf_samples` holds the kind, the
   platform, the cold/warm flag and that kind's durations — no URL, path, user,
   session, client id, user agent, product or mutation name, the same boundary
   ADR-0074 and ADR-0075 fixed for the record itself. The controller keeps its
   log line for a live tail and writes the row through
   `controller → service → repository`.
2. **The shape belongs to the kind, not the column.** `platform` is nullable
   because a future origin row has none, and a table-level check makes it
   non-null for the three kinds that exist today and pins the durations each
   kind must carry. A row that lies about its kind cannot be stored, even by the
   service role; adding a fourth kind is one arm of that check.
3. **Sixty days, swept nightly.** `sweep_perf_samples()` runs at 03:40 UTC in
   5,000-row batches and declares its expectation to `/api/cron/job-health`
   (#1744). Sixty days is the window `cron-job-run-details-retention` already
   keeps, so a perf window and the runs that collected it are joinable for
   exactly as long as both exist. A longer trend belongs in the recorded
   baseline (`perf/runtime-budget.json`), not in the table.
4. **The reader is the existing command, pointed at the table.** `npm run
perf:field` reads `perf_samples` for the last 24 hours by default (`--since`
   widens it), through PostgREST and the service role, and keeps `--file`/stdin
   for a tail that never reached the table. Client roles hold nothing: RLS is on
   with no policy and no grant, because the samples are telemetry, not a
   member's data.
5. **A refused write is a dropped sample.** The beacon is already droppable
   (ADR-0074), so the insert is held to two seconds, its failure is logged once
   at the repository seam, and the endpoint still answers 200. A storage outage
   must not turn a beacon into an error page, and the client never waits for it.

## Why not the alternatives

- **A log shipper beside the container.** The files are still 30 MB, the
  destination is a vendor's retention option rather than a number in a
  migration, and nothing answers "is it still running" the way a pg_cron job
  with an expectation row does. Its one advantage — no database write on a hot
  path — is answered by decision 5.
- **Raising the `json-file` rotation to weeks.** It buffers the evidence without
  making it queryable, and it breaks the 30 MB-per-container assumption the box
  is sized on.
- **Keeping the Render service as a permanent probe.** It measures an origin
  nobody requests, the mistake ADR-0174 already named.
- **Reading the app's stdout from the host.** It works until the first rotation
  and gives prose to grep, not a percentile to compare.

## Consequences

- `npm run perf:field` answers after the cutover, from the origin that actually
  served the page, and the answer survives an image replace or a container
  restart.
- The command's default window is 24 hours, which is what the audit's acceptance
  criterion asks for; a seven-day read is `--since 7d`.
- Storage is bounded: at ~120 bytes a row the table is tens of megabytes over its
  whole window, and the sweep is the only writer that deletes.
- The `origin` kind is not stored yet. `metrics.sh` prints its numbers into a
  workflow summary; adding the row later is one arm of the shape check and one
  writer, with no migration of existing data.
- A future report may quote a number only from this table or from the recorded
  baseline; a number recovered from a log tail is now a diagnosis, not a record.
