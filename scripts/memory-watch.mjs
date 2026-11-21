import { pathToFileURL } from 'node:url';

/**
 * Reads the origin's memory graph and restart events from the Render API and
 * prints one JSON report. The workflow turns that report into a single GitHub
 * issue; the script itself is read-only and never writes to Render.
 *
 * The threshold is the one already written down in docs/memory-budget.md: a
 * graph that sits above ~400 MB through an ordinary day, or an OOM restart.
 * Neither is a feeling — both come from Render's own metrics and events.
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

/**
 * Pure half of the watch, so the decision can be tested without network calls.
 * `series` is the `/metrics/memory` response; `events` is the `/events` response.
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
    .filter((entry) => (entry.type ?? entry.event?.type) === 'server_failed')
    .filter((entry) => (entry.details ?? entry.event?.details)?.reason?.oomKilled)
    .map((entry) => entry.timestamp ?? entry.event?.timestamp);

  const p95Mb = percentile(samples, 0.95);
  const maxMb = samples.length === 0 ? null : Math.max(...samples);
  const reasons = [];
  if (ooms.length > 0) reasons.push(`${ooms.length} OOM restart(s)`);
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
  const service = services
    .map((entry) => entry.service ?? entry)
    .find((entry) => entry.name === name);
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

  const report = summarize(
    series,
    events.map((entry) => entry.event ?? entry),
    {
      now: end,
      windowHours: hours,
      thresholdMb,
    }
  );
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
