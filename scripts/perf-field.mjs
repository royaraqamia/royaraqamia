import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Reads the launch, tap and vitals records the origin stores in
 * `public.perf_samples` (#1885, ADR-0228) and prints the p75 the instant-feel
 * program is judged against: cold open → content, warm open → content, tap →
 * paint and the four Core Web Vitals, per platform.
 *
 * The table is the default source, so the command answers the last 24 hours:
 *
 * ```bash
 * npm run perf:field                    # perf_samples, last 24h
 * npm run perf:field -- --since 7d      # any window: 30m, 1h, 24h, 7d
 * ```
 *
 * It needs `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and
 * `SUPABASE_SERVICE_ROLE_KEY`; `npm run` loads `.env` when it exists, and
 * `--env <file>` points at another one. The read is the service role because
 * the table grants nothing to a client role and has no policy: the samples are
 * telemetry, not a member's data.
 *
 * Two older inputs still work, for a tail that never reached the table: JSON
 * lines from the app's own stdout (`--file <path>`, or piped on stdin), and the
 * log form `logger.info('[app-perf]', …)` writes. Both go through the same
 * grouping, so a number read from a file and a number read from the table are
 * the same number.
 *
 * The row carries no user, page or session (ADR-0074's boundary, #487).
 */

export const PERF_TAG = '[app-perf]';

/** The window a bare `npm run perf:field` answers. */
export const DEFAULT_WINDOW = '24h';

/** PostgREST answers at most 1,000 rows unless a project raises the limit. */
const PAGE_SIZE = 1_000;

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

  if (payload.kind === 'vitals') {
    const lcpMs = duration(payload.lcpMs);
    const cls = duration(payload.cls);
    const inpMs = duration(payload.inpMs);
    const ttfbMs = duration(payload.ttfbMs);
    if (lcpMs === null || cls === null || inpMs === null || ttfbMs === null) return null;
    return { kind: 'vitals', platform: payload.platform, lcpMs, cls, inpMs, ttfbMs };
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
  const vitals = new Map();

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
    } else if (record.kind === 'tap') {
      const group = taps.get(record.platform) ?? { platform: record.platform, paint: [] };
      group.paint.push(record.paintMs);
      taps.set(record.platform, group);
    } else {
      const group = vitals.get(record.platform) ?? {
        platform: record.platform,
        lcp: [],
        cls: [],
        inp: [],
        ttfb: [],
      };
      group.lcp.push(record.lcpMs);
      group.cls.push(record.cls);
      group.inp.push(record.inpMs);
      group.ttfb.push(record.ttfbMs);
      vitals.set(record.platform, group);
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

  for (const group of [...vitals.values()].sort(
    (a, b) => platformRank(a.platform) - platformRank(b.platform)
  )) {
    rows.push({
      kind: 'vitals',
      platform: group.platform,
      cold: null,
      samples: group.lcp.length,
      shellMs: null,
      contentMs: null,
      paintMs: null,
      lcpMs: percentile(group.lcp),
      cls: percentile(group.cls),
      inpMs: percentile(group.inp),
      ttfbMs: percentile(group.ttfb),
    });
  }

  return rows;
}

function cell(value) {
  return value === null || value === undefined ? '—' : `${value} ms`;
}

/** The terminal table. Fixed widths keep it readable without a dependency. */
export function formatTable(rows) {
  const header = [
    'kind',
    'platform',
    'open',
    'n',
    'shell p75',
    'content p75',
    'paint p75',
    'lcp p75',
    'cls p75',
    'inp p75',
    'ttfb p75',
  ];
  const body = rows.map((row) => [
    row.kind,
    row.platform,
    row.cold === null ? '—' : row.cold ? 'cold' : 'warm',
    String(row.samples),
    cell(row.shellMs),
    cell(row.contentMs),
    cell(row.paintMs),
    cell(row.lcpMs),
    row.cls === null || row.cls === undefined ? '—' : row.cls.toFixed(3),
    cell(row.inpMs),
    cell(row.ttfbMs),
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

/**
 * A row of `public.perf_samples` back as the record `parseRecord` returns, or
 * null. The table's own check constraint already refuses a lying row, so an
 * unusable one here means a column changed shape - drop it rather than guess.
 */
export function rowToRecord(row) {
  if (!row || typeof row !== 'object') return null;
  if (!PLATFORMS.includes(row.platform)) return null;

  if (row.kind === 'launch') {
    const shellMs = duration(row.shell_ms);
    const contentMs = duration(row.content_ms);
    if (typeof row.cold !== 'boolean' || shellMs === null || contentMs === null) return null;
    return { kind: 'launch', platform: row.platform, cold: row.cold, shellMs, contentMs };
  }

  if (row.kind === 'tap') {
    const paintMs = duration(row.paint_ms);
    if (paintMs === null) return null;
    return { kind: 'tap', platform: row.platform, paintMs };
  }

  if (row.kind === 'vitals') {
    const lcpMs = duration(row.lcp_ms);
    const cls = duration(row.cls);
    const inpMs = duration(row.inp_ms);
    const ttfbMs = duration(row.ttfb_ms);
    if (lcpMs === null || cls === null || inpMs === null || ttfbMs === null) return null;
    return { kind: 'vitals', platform: row.platform, lcpMs, cls, inpMs, ttfbMs };
  }

  return null;
}

/** `30m`, `1h`, `24h`, `7d` or `90s` as a number of seconds. */
export function parseWindow(text) {
  const match = /^(\d+)([smhd])$/.exec(String(text ?? '').trim());
  if (!match) throw new Error(`--since must look like 30m, 1h, 24h or 7d (got "${text}")`);
  const unit = { s: 1, m: 60, h: 3_600, d: 86_400 }[match[2]];
  return Number(match[1]) * unit;
}

function loadEnvFile(path) {
  if (!path) return;
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`cannot read env file: ${path}`);
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    if (value && !process.env[match[1]]) process.env[match[1]] = value;
  }
}

/** The PostgREST endpoint and service key, or a message naming what is missing. */
function supabaseConfig(argv) {
  const at = argv.indexOf('--env');
  loadEnvFile(at === -1 ? null : argv[at + 1]);

  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(
    /\/+$/,
    ''
  );
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base || !key) {
    throw new Error(
      'need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment, in .env, or in --env <file>'
    );
  }
  return { base, key };
}

/**
 * Every row the window holds, read in PostgREST's 1,000-row pages so a busy day
 * is not silently truncated to its first page - a truncated read is a wrong
 * percentile, not a smaller one.
 */
async function fetchWindow(base, key, sinceIso) {
  const columns =
    'kind,platform,cold,shell_ms,content_ms,paint_ms,lcp_ms,cls,inp_ms,ttfb_ms,recorded_at';
  const rows = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url =
      `${base}/rest/v1/perf_samples?select=${columns}` +
      `&recorded_at=gte.${encodeURIComponent(sinceIso)}` +
      `&order=recorded_at.asc&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      if (response.status === 404 || /perf_samples/i.test(detail)) {
        throw new Error(
          `cannot read perf_samples (${response.status}): ${detail}\n` +
            'Apply the table with `npm run check:migrations` and the migration on `main`, then retry.'
        );
      }
      throw new Error(`perf_samples read failed (${response.status}): ${detail}`);
    }

    const page = await response.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main(argv) {
  const fileIndex = argv.indexOf('--file');
  const file = fileIndex === -1 ? null : argv[fileIndex + 1];
  const sinceIndex = argv.indexOf('--since');
  const since = sinceIndex === -1 ? null : argv[sinceIndex + 1];

  if (file) {
    if (since)
      throw new Error('--since reads perf_samples; use --file alone to read saved JSON lines.');
    print(readRecords(readFileSync(file, 'utf8')), `file ${file}`);
    return;
  }

  // `--since` is an explicit request for the table, so it works the same in a
  // terminal, in a script and in CI - a piped stdin is only the fallback when
  // nothing asked for a window.
  if (!since && !process.stdin.isTTY) {
    print(readRecords(await readStdin()), 'stdin');
    return;
  }

  // The table is the default source: a bare `npm run perf:field` is the last
  // 24 hours, and `--since` widens or narrows it.
  const window = since ?? DEFAULT_WINDOW;
  const seconds = parseWindow(window);
  const { base, key } = supabaseConfig(argv);
  const sinceIso = new Date(Date.now() - seconds * 1_000).toISOString();
  const rows = await fetchWindow(base, key, sinceIso);

  const records = [];
  let ignored = 0;
  for (const row of rows) {
    const record = rowToRecord(row);
    if (record) records.push(record);
    else ignored += 1;
  }

  print({ records, ignored }, `perf_samples, last ${window}`);
}

function print({ records, ignored }, source) {
  if (records.length === 0) {
    console.log(
      `perf-field: no [app-perf] records in ${source}. A row lands in perf_samples when a ` +
        'reporter posts to /api/app-perf; widen --since, or check that the deployment carries #487.'
    );
    return;
  }

  console.log(formatTable(summarize(records)));
  console.log(
    `\n${records.length} records read from ${source}, ${ignored} ignored. ` +
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
