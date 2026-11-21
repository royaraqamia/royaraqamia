import { pathToFileURL } from 'node:url';

/**
 * Reads the origin's memory graph and restart events from the Render API and
 * prints one JSON report. The workflow turns that report into a single GitHub
 * issue; the script itself is read-only and never writes to Render.
 *
 * The threshold is the one already written down in docs/memory-budget.md: an
 * OOM restart, a graph that sits above ~400 MB through an ordinary day, or one
 * `[memory]` sample above 400 MB. The last one matters because an OOM here was
 * a single brief spike that the dashboard's averaged graph never showed.
 */

export const DEFAULT_THRESHOLD_MB = 400;
export const DEFAULT_WINDOW_HOURS = 6;

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/** MiB from the byte values the metrics API returns. */
function megabytes(bytes) {
  return typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0
    ? Math.round(bytes / 1024 / 1024)
    : null;
}

/** Render wraps some list responses in `{service}`, `{event}` or `{log}`. */
function unwrap(rows) {
  return rows.map((entry) => entry.service ?? entry.event ?? entry.log ?? entry);
}

/** The app's own five-minute `[memory]` lines, which catch a brief spike. */
export function rssSamplesFromLogs(logs) {
  const samples = [];
  for (const entry of unwrap(logs)) {
    const text = String(entry.message ?? '');
    const match = text.match(/\[memory\]\s*(\{[^}]*\})/);
    if (!match) continue;
    try {
      const rssMb = JSON.parse(match[1]).rssMb;
      if (typeof rssMb === 'number' && Number.isFinite(rssMb)) {
        samples.push({ timestamp: entry.timestamp, rssMb });
      }
    } catch {
      // A half-written line is not a sample; the next one arrives in five minutes.
    }
  }
  return samples;
}

/**
 * Pure half of the watch, so the decision can be tested without network calls.
 * `series` is the `/metrics/memory` response; `events` is the `/events` response;
 * `options.rssSamples` is the output of `rssSamplesFromLogs`.
 */
export function summarize(series, events, options = {}) {
  const thresholdMb = options.thresholdMb ?? DEFAULT_THRESHOLD_MB;
  const now = options.now ?? new Date();
  const windowHours = options.windowHours ?? DEFAULT_WINDOW_HOURS;

  const samples = series
    .flatMap((entry) => entry.values ?? [])
    .map((point) => megabytes(point.value))
    .filter((value) => value !== null);
  const ooms = events
    .filter((entry) => entry.type === 'server_failed')
    .filter((entry) => entry.details?.reason?.oomKilled)
    .map((entry) => entry.timestamp);
  const rssSamples = options.rssSamples ?? [];
  const rssOver = rssSamples.filter((sample) => sample.rssMb > thresholdMb);
  const rssPeak = rssSamples.length === 0 ? null : Math.max(...rssSamples.map((s) => s.rssMb));

  const p95Mb = percentile(samples, 0.95);
  const maxMb = samples.length === 0 ? null : Math.max(...samples);
  const reasons = [];
  if (ooms.length > 0) reasons.push(`${ooms.length} OOM restart(s)`);
  if (rssOver.length > 0) {
    reasons.push(`${rssOver.length} [memory] sample(s) above ${thresholdMb} MiB`);
  }
  if (p95Mb !== null && p95Mb >= thresholdMb) {
    reasons.push(`p95 ${p95Mb} MiB at or above ${thresholdMb} MiB`);
  }

  return {
    checkedAt: now.toISOString(),
    windowHours,
    thresholdMb,
    samples: samples.length,
    p95Mb,
    maxMb,
    rssSamples: rssSamples.length,
    rssPeakMb: rssPeak,
    rssOverCount: rssOver.length,
    oomCount: ooms.length,
    oomAt: ooms,
    alert: reasons.length > 0,
    reasons,
  };
}

async function get(url, headers) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok)
    throw new Error(`${response.status} from ${new URL(url).pathname}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function main() {
  const key = process.env.RENDER_API_KEY;
  if (!key) {
    console.error('RENDER_API_KEY is required');
    process.exitCode = 1;
    return;
  }

  const headers = { Authorization: `Bearer ${key}`, Accept: 'application/json' };
  const name = process.env.RENDER_SERVICE_NAME ?? 'royaraqamia';
  const hours = Number(process.env.MEMORY_WATCH_HOURS ?? DEFAULT_WINDOW_HOURS);
  const thresholdMb = Number(process.env.MEMORY_WATCH_THRESHOLD_MB ?? DEFAULT_THRESHOLD_MB);
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600 * 1000);
  const query = new URLSearchParams({
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  });

  const services = await get('https://api.render.com/v1/services?limit=100', headers);
  const service = unwrap(services).find((entry) => entry.name === name);
  if (!service) throw new Error(`no Render service named ${name}`);

  const series = await get(
    `https://api.render.com/v1/metrics/memory?${new URLSearchParams({
      ...Object.fromEntries(query),
      resource: service.id,
      resolutionSeconds: '60',
    })}`,
    headers
  );
  const events = await get(
    `https://api.render.com/v1/services/${service.id}/events?${query}&limit=100`,
    headers
  );

  // The dashboard's memory graph averages over minutes; an OOM here was one
  // brief spike. The app's own `[memory]` lines are the per-sample witness.
  const detail = await get(`https://api.render.com/v1/services/${service.id}`, headers);
  const ownerId = (detail.service ?? detail).ownerId;
  if (!ownerId) throw new Error(`no owner id for ${name}`);
  const logs = await get(
    `https://api.render.com/v1/logs?${new URLSearchParams({
      ...Object.fromEntries(query),
      ownerId,
      resource: service.id,
      text: '[memory]',
      limit: '100',
    })}`,
    headers
  );

  const report = summarize(series, unwrap(events), {
    now: end,
    windowHours: hours,
    thresholdMb,
    rssSamples: rssSamplesFromLogs(logs.logs ?? []),
  });
  console.log(JSON.stringify({ ...report, service: service.name, serviceId: service.id }, null, 2));
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
