#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The installed shell's launch gate (#1639).
 *
 * `perf:paint` drives the web surfaces from Playwright; it cannot reach the
 * WebView the app actually ships, and its CI runner has no device. This runner
 * reads the `RoyLaunch` lines `MainActivity` writes on the reference phone and
 * reduces them to the same `boot → content` number the field beacon reports.
 * The `shell` row in `perf/paint-budget.json` is its ceiling.
 *
 * The marks are written by two halves: the document callbacks in `MainActivity`
 * and the page's own User Timing, forwarded over `RoyShellPerf`. `boot` is the
 * page's `performance.timeOrigin`, so subtracting it from `content` removes the
 * process fork and the document fetch that the field number also excludes.
 *
 * ```bash
 * npm run perf:shell                              # 10 cold launches on the device
 * npm run perf:shell -- --runs 5 --device <serial>
 * npm run perf:shell -- --file captured.logcat    # reduce an earlier capture
 * ```
 */
export const LAUNCH_TAG = 'RoyLaunch';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_ID = 'com.royaraqamia.app';
const ACTIVITY = `${PACKAGE_ID}/.MainActivity`;
const DEFAULT_ROUTE = 'https://royaraqamia.com/?tab=/habitflow';
const LINE = /^\d\d-\d\d\s+\S+\s+(\d+)\s+\d+\s+D RoyLaunch:\s*(.+?) at (\d+)ms/;

/** Nearest-rank percentile, the same rule `perf-field.mjs` uses. */
export function percentile(values, p = 0.75) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/**
 * One launch per PID. A launch counts only when the page reported both `boot`
 * and `content`; a document that never painted owned rows is not a sample.
 */
export function parseLog(text) {
  const byPid = new Map();
  for (const line of text.split(/\r?\n/)) {
    const found = LINE.exec(line);
    if (!found) continue;
    const [, pid, moment, ms] = found;
    const launch = byPid.get(pid) ?? {};
    if (launch[moment] === undefined) launch[moment] = Number(ms);
    byPid.set(pid, launch);
  }
  return [...byPid.values()]
    .filter((launch) => launch['boot mark'] !== undefined && launch['content mark'] !== undefined)
    .map((launch) => ({
      commitMs: launch['page committed'] ?? null,
      shellMs: launch['shell mark'] - launch['boot mark'],
      contentMs: launch['content mark'] - launch['boot mark'],
      forkToContentMs: launch['content mark'],
    }))
    .filter((launch) => launch.contentMs >= 0 && launch.shellMs >= 0);
}

export function summarize(launches) {
  return {
    n: launches.length,
    commitP75: percentile(
      launches.map((launch) => launch.commitMs).filter((value) => value !== null)
    ),
    shellP75: percentile(launches.map((launch) => launch.shellMs)),
    contentP75: percentile(launches.map((launch) => launch.contentMs)),
  };
}

function adb(args, device) {
  return spawnSync('adb', [...(device ? ['-s', device] : []), ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function capture(device, route) {
  const chunks = [];
  for (let run = 1; run <= capture.runs; run += 1) {
    adb(['logcat', '-c'], device);
    adb(['shell', 'am', 'force-stop', PACKAGE_ID], device);
    const start = adb(['shell', 'am', 'start', '-S', '-W', '-d', route, ACTIVITY], device);
    if (start.status !== 0)
      throw new Error(`launch ${run} failed: ${start.stderr || start.stdout}`);
    // A bounded wait that needs no platform-specific sleep command.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15_000);
    chunks.push(adb(['logcat', '-d', '-s', `${LAUNCH_TAG}:D`], device).stdout);
  }
  return chunks.join('\n');
}

function shellCeiling() {
  const budget = JSON.parse(readFileSync(join(ROOT, 'perf', 'paint-budget.json'), 'utf8'));
  const row = budget.surfaces.find((surface) => surface.platform === 'shell');
  if (!row) throw new Error('perf/paint-budget.json has no shell row');
  return row.ceiling;
}

function cell(value) {
  return value === null || value === undefined ? '—' : `${value} ms`;
}

function main(argv) {
  const flag = (name, fallback = null) => {
    const index = argv.indexOf(name);
    return index === -1 ? fallback : argv[index + 1];
  };
  const file = flag('--file');
  const device = flag('--device');
  const route = flag('--route', DEFAULT_ROUTE);
  const runs = Number(flag('--runs', '10'));
  if (!Number.isInteger(runs) || runs < 1 || runs > 20) {
    throw new Error('--runs takes a whole number from 1 to 20');
  }

  const text = file
    ? readFileSync(file, 'utf8')
    : (() => {
        capture.runs = runs;
        return capture(device, route);
      })();
  const launches = parseLog(text);
  const summary = summarize(launches);
  const ceiling = shellCeiling();

  console.log('launches  commit p75  shell p75  content p75  ceiling');
  console.log(
    `${String(summary.n).padStart(8)}  ${cell(summary.commitP75).padStart(10)}  ` +
      `${cell(summary.shellP75).padStart(9)}  ${cell(summary.contentP75).padStart(11)}  ` +
      `${cell(ceiling.cold).padStart(7)}`
  );
  if (summary.n === 0) {
    console.log('perf:shell: no launch reported both marks; sign in to a surface with owned rows.');
    return 1;
  }
  if (summary.contentP75 > ceiling.cold) {
    console.log(
      `perf:shell: FAIL — cold content p75 ${summary.contentP75} ms > ${ceiling.cold} ms`
    );
    return 1;
  }
  console.log('perf:shell: PASS');
  return 0;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.log(`perf:shell: ${error.message}`);
    process.exitCode = 1;
  }
}
