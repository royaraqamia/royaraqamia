import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Reads the launch and tap records the app writes with `logger.info('[app-perf]', …)`
 * (#487) and prints the p75 the instant-feel program is judged against: cold
 * open → content, warm open → content, and tap → paint, per platform.
 *
 * Input is JSON Lines from the Vercel CLI, so the numbers come from one query:
 *
 * ```bash
 * npx vercel logs --project royaraqamia --since 1h --json --query '[app-perf]' \
 *   | node scripts/perf-field.mjs
 * ```
 *
 * Vercel keeps runtime logs for an hour on Hobby, so this is a recent-window
 * read, not a historical report. Nothing here identifies a user or a page: the
 * record itself was built without one (ADR-0074's boundary, #487).
 */

export const PERF_TAG = '[app-perf]';

const PLATFORMS = ['web', 'pwa', 'shell'];

/** The JSON context as it appears after the tag in the log message. */
function payloadOf(text) {
  const start = text.indexOf(PERF_TAG);
  if (start === -1) return null;
  const json = text.slice(start + PERF_TAG.length).trim();
  if (!json.startsWith('{')) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** The first string field of a Vercel log line that carries the tag. */
function taggedText(entry) {
  if (!entry || typeof entry !== 'object') return null;
  for (const value of Object.values(entry)) {
    if (typeof value === 'string' && value.includes(PERF_TAG)) return value;
  }
  return null;
}

/** A finite, non-negative number, or null. */
function duration(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * One parsed record, or null. Unknown kinds and malformed lines are dropped
 * rather than guessed at, so a stray log line cannot skew a percentile.
 */
export function parseRecord(line) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }

  const text = taggedText(entry);
  if (!text) return null;
  const payload = payloadOf(text);
  if (!payload || !PLATFORMS.includes(payload.platform)) return null;

  if (payload.kind === 'launch') {
    const shellMs = duration(payload.shellMs);
    const contentMs = duration(payload.contentMs);
    if (typeof payload.cold !== 'boolean' || shellMs === null || contentMs === null) return null;
    return { kind: 'launch', platform: payload.platform, cold: payload.cold, shellMs, contentMs };
  }

  if (payload.kind === 'tap') {
    const paintMs = duration(payload.paintMs);
    if (paintMs === null) return null;
    return { kind: 'tap', platform: payload.platform, paintMs };
  }

  return null;
}

/** Nearest-rank percentile: the value at or above which p of the samples sit. */
export function percentile(values, p = 0.75) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/**
 * Groups records the way the program reads them: a launch is split by platform
 * and by cold/warm (the decision gate's two budgets), a tap by platform alone.
 */
export function summarize(records) {
  const launches = new Map();
  const taps = new Map();

  for (const record of records) {
    if (record.kind === 'launch') {
      const key = `${record.platform}|${record.cold ? 'cold' : 'warm'}`;
      const group = launches.get(key) ?? {
        platform: record.platform,
        cold: record.cold,
        shell: [],
        content: [],
      };
      group.shell.push(record.shellMs);
      group.content.push(record.contentMs);
      launches.set(key, group);
    } else {
      const group = taps.get(record.platform) ?? { platform: record.platform, paint: [] };
      group.paint.push(record.paintMs);
      taps.set(record.platform, group);
    }
  }

  const platformRank = (platform) => PLATFORMS.indexOf(platform);
  const rows = [];

  for (const group of [...launches.values()].sort(
    (a, b) => platformRank(a.platform) - platformRank(b.platform) || Number(b.cold) - Number(a.cold)
  )) {
    rows.push({
      kind: 'launch',
      platform: group.platform,
      cold: group.cold,
      samples: group.content.length,
      shellMs: percentile(group.shell),
      contentMs: percentile(group.content),
      paintMs: null,
    });
  }

  for (const group of [...taps.values()].sort(
    (a, b) => platformRank(a.platform) - platformRank(b.platform)
  )) {
    rows.push({
      kind: 'tap',
      platform: group.platform,
      cold: null,
      samples: group.paint.length,
      shellMs: null,
      contentMs: null,
      paintMs: percentile(group.paint),
    });
  }

  return rows;
}

function cell(value) {
  return value === null || value === undefined ? '—' : `${value} ms`;
}

/** The terminal table. Fixed widths keep it readable without a dependency. */
export function formatTable(rows) {
  const header = ['kind', 'platform', 'open', 'n', 'shell p75', 'content p75', 'paint p75'];
  const body = rows.map((row) => [
    row.kind,
    row.platform,
    row.cold === null ? '—' : row.cold ? 'cold' : 'warm',
    String(row.samples),
    cell(row.shellMs),
    cell(row.contentMs),
    cell(row.paintMs),
  ]);

  const widths = header.map((title, index) =>
    Math.max(title.length, ...body.map((row) => row[index].length))
  );
  const render = (row) =>
    row
      .map((value, index) =>
        index === 0 ? value.padEnd(widths[index]) : value.padStart(widths[index])
      )
      .join('  ')
      .trimEnd();

  return [
    render(header),
    render(widths.map((width) => '-'.repeat(width))),
    ...body.map(render),
  ].join('\n');
}

export function readRecords(text) {
  const records = [];
  let ignored = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const record = parseRecord(line);
    if (record) records.push(record);
    else ignored += 1;
  }

  return { records, ignored };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main(argv) {
  const fileIndex = argv.indexOf('--file');
  const file = fileIndex === -1 ? null : argv[fileIndex + 1];

  if (file) {
    run(readFileSync(file, 'utf8'));
    return;
  }

  if (process.stdin.isTTY) {
    console.log('perf-field: pipe `npx vercel logs … --json` in, or pass --file <path>.');
    return;
  }

  run(await readStdin());
}

function run(text) {
  const { records, ignored } = readRecords(text);
  if (records.length === 0) {
    console.log(
      'perf-field: no [app-perf] records in this window. Vercel keeps runtime logs for an hour ' +
        'on Hobby — widen --since and re-run, or check that the deployment carries #487.'
    );
    return;
  }

  console.log(formatTable(summarize(records)));
  console.log(
    `\n${records.length} records read, ${ignored} line(s) ignored. ` +
      'Launch durations run from navigation start; a warm open is a document answered from cache.'
  );
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main(process.argv.slice(2)).catch((error) => {
    console.log(`perf-field: ${error.message}`);
    process.exitCode = 1;
  });
}
