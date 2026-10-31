#!/usr/bin/env node
/**
 * The app's own first frame, measured on a device (#752).
 *
 * `docs/mobile/native-app.md` gives the shell two numbers: a cold start (process
 * dead to first drawn frame) inside 400 ms, and a warm start (activity recreated)
 * inside 300 ms. Until this script existed neither was a number in a run — the
 * budgets were the web's, and the only launch evidence was a sentence in a doc.
 *
 * The measurement is `am start -W`: its `TotalTime` is the launch through the
 * activity's first displayed frame, which for this app is the Compose frame
 * ([ShellActivity]) rather than a document. The splash is part of both numbers,
 * which is the point: the splash and that frame are one colour now, so what is
 * timed is the frame a person sees.
 *
 * A cold run is `am force-stop` first, so the process really is dead. A warm run
 * sends the app home and brings it back with the process alive; what the platform
 * then reports is either `WARM` (activity recreated — the budget's own case, which
 * a device with "Don't keep activities" enabled in developer options produces) or
 * `HOT` (the activity resumed from the background, which is the floor rather than
 * the case). The script prints which it saw and never pretends a `COLD` run was a
 * `WARM` one.
 *
 * Usage:
 *   npm run android:launch                     # 3 runs, default device
 *   npm run android:launch -- --device <serial>
 *   npm run android:launch -- --runs 5
 *   npm run android:launch -- --no-budget      # print, do not fail on a miss
 *
 * The APK has to be installed already (`npm run android:apk`, then
 * `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`). Exit codes:
 * 0 inside budget, 1 over it or the device could not be measured, 2 adb missing.
 *
 * A mid-range device is the budget's own wording: an emulator reports a different
 * number, and it is a floor rather than the figure the doc asks for. Say which
 * device the run used wherever the result is recorded.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The application id, pinned to `android/app/build.gradle` by the test beside this file. */
export const PACKAGE_ID = 'com.royaraqamia.app';
/** The launcher, pinned to the manifest's MAIN/LAUNCHER activity by the same test. */
export const LAUNCH_ACTIVITY = '.shell.ShellActivity';
/** `docs/mobile/native-app.md`: cold start and warm start, in milliseconds. */
export const BUDGET = { cold: 400, warm: 300 };
/** How many runs the median is taken over by default. */
export const RUNS = 3;
/** Time for the process to actually die after `am force-stop`. */
export const COLD_SETTLE_MS = 1000;
/** Time for the app to reach the background after the HOME key. */
export const WARM_SETTLE_MS = 400;

/**
 * The options, from argv.
 *
 * `--runs` is bounded because each run costs the settle windows; `--no-budget`
 * turns a miss into a printed warning for a device that is not mid-range.
 */
export function parseArgs(argv) {
  const options = { device: null, runs: RUNS, budget: true, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--no-budget') {
      options.budget = false;
      continue;
    }
    if (arg === '--device' || arg === '--runs') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('-')) throw new Error(`${arg} needs a value`);
      index += 1;
      if (arg === '--device') options.device = value;
      else {
        const runs = Number(value);
        if (!Number.isInteger(runs) || runs < 1 || runs > 20) {
          throw new Error('--runs takes a whole number of runs from 1 to 20');
        }
        options.runs = runs;
      }
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

/**
 * What `am start -W` printed.
 *
 * `LaunchState` is the platform's own word for what it did (COLD/WARM/HOT), and
 * the script trusts it rather than its own intent: a cold run that came back WARM
 * was not a cold run. `TotalTime` is the number the budgets are written in;
 * `WaitTime` is what the caller waited.
 */
export function parseAmStart(stdout) {
  const state = /LaunchState:\s*(COLD|WARM|HOT)/.exec(stdout)?.[1] ?? null;
  const total = /TotalTime:\s*(\d+)/.exec(stdout);
  const wait = /WaitTime:\s*(\d+)/.exec(stdout);
  return {
    state,
    totalTime: total ? Number(total[1]) : null,
    waitTime: wait ? Number(wait[1]) : null,
  };
}

/** The middle value; an even count takes the lower of the two middles. */
export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Whether a median is inside the budget for a kind of start. */
export function withinBudget(kind, ms) {
  if (ms === null) return false;
  return ms <= BUDGET[kind];
}

/**
 * The adb to use: the SDK's own first, then PATH.
 *
 * `ANDROID_HOME`/`ANDROID_SDK_ROOT` are what the machine already sets for the
 * build; the bare name is the fallback for a PATH that has platform-tools.
 */
export function adbCandidates(env = process.env, platform = process.platform) {
  const binary = platform === 'win32' ? 'adb.exe' : 'adb';
  const roots = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT].filter(Boolean);
  return [...roots.map((root) => join(root, 'platform-tools', binary)), binary];
}

/** The first adb that answers `version`, or null. */
export function findAdb(env = process.env, platform = process.platform) {
  for (const candidate of adbCandidates(env, platform)) {
    if (candidate !== 'adb' && candidate !== 'adb.exe' && !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ['version'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function adb(adbPath, device, args) {
  const prefix = device ? ['-s', device] : [];
  const result = spawnSync(adbPath, [...prefix, ...args], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`adb ${args.join(' ')} exited ${result.status}: ${result.stderr.trim()}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

/** A synchronous pause: the runs are sequential, and nothing else needs the loop. */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** One launch, with the reading the platform printed. */
function launch(adbPath, device) {
  const stdout = adb(adbPath, device, [
    'shell',
    'am',
    'start',
    '-W',
    '-n',
    `${PACKAGE_ID}/${LAUNCH_ACTIVITY}`,
  ]);
  const reading = parseAmStart(stdout);
  if (reading.totalTime === null) {
    throw new Error(`am start printed no TotalTime:\n${stdout.trim()}`);
  }
  return reading;
}

function coldRun(adbPath, device) {
  adb(adbPath, device, ['shell', 'am', 'force-stop', PACKAGE_ID]);
  sleep(COLD_SETTLE_MS);
  const reading = launch(adbPath, device);
  if (reading.state !== 'COLD') {
    throw new Error(
      `expected a COLD launch, the platform reported ${reading.state ?? 'no state'}: ` +
        'the process was not dead, so this run cannot be a cold start'
    );
  }
  return reading;
}

function warmRun(adbPath, device) {
  adb(adbPath, device, ['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  sleep(WARM_SETTLE_MS);
  const reading = launch(adbPath, device);
  if (reading.state === 'COLD') {
    throw new Error('a warm run came back COLD: the process died between runs');
  }
  return reading;
}

function report(cold, warm, { budget }) {
  const coldMedian = median(cold.map((run) => run.totalTime));
  const warmMedian = median(warm.map((run) => run.totalTime));
  const lines = [`component  ${PACKAGE_ID}/${LAUNCH_ACTIVITY}`, ''];

  for (let index = 0; index < Math.max(cold.length, warm.length); index += 1) {
    const c = cold[index];
    const w = warm[index];
    lines.push(
      `run ${String(index + 1).padEnd(2)}  ` +
        `cold ${String(c?.totalTime ?? '-').padStart(5)} ms (${c?.state ?? '-'})   ` +
        `warm ${String(w?.totalTime ?? '-').padStart(5)} ms (${w?.state ?? '-'})`
    );
  }
  lines.push('');

  for (const [kind, value] of [
    ['cold', coldMedian],
    ['warm', warmMedian],
  ]) {
    const ceiling = BUDGET[kind];
    const verdict = withinBudget(kind, value) ? 'ok' : 'over';
    const delta = value === null ? '' : ` (${value - ceiling > 0 ? '+' : ''}${value - ceiling} ms)`;
    lines.push(
      `${kind.padEnd(4)}  median ${String(value ?? '-').padStart(5)} ms   ` +
        `budget ${String(ceiling).padStart(3)} ms   ${verdict}${delta}`
    );
  }
  if (warm.every((run) => run.state === 'HOT')) {
    lines.push(
      'warm ran as HOT: a resume is the floor, not the recreated activity the budget names'
    );
  }
  process.stdout.write(`${lines.join('\n')}\n`);

  const missed = [
    !withinBudget('cold', coldMedian) ? 'cold' : null,
    !withinBudget('warm', warmMedian) ? 'warm' : null,
  ].filter(Boolean);
  if (missed.length === 0) return 0;
  const sentence = `${missed.join(' and ')} start over budget`;
  process.stderr.write(
    budget
      ? `${sentence}: fix it rather than cancelling the slice\n`
      : `${sentence} (--no-budget)\n`
  );
  return budget ? 1 : 0;
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
  if (options.help) {
    process.stdout.write(
      'Usage: npm run android:launch -- [--device <serial>] [--runs <n>] [--no-budget]\n'
    );
    return 0;
  }

  const adbPath = findAdb();
  if (!adbPath) {
    process.stderr.write(
      'adb not found: put platform-tools on PATH or set ANDROID_HOME/ANDROID_SDK_ROOT\n'
    );
    return 2;
  }

  try {
    const cold = [];
    const warm = [];
    for (let run = 0; run < options.runs; run += 1) {
      cold.push(coldRun(adbPath, options.device));
      warm.push(warmRun(adbPath, options.device));
    }
    return report(cold, warm, options);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
