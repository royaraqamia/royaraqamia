#!/usr/bin/env node
/**
 * The app's own first frame, measured on a device (#752).
 *
 * `docs/mobile/native-app.md` gives the shell two numbers: a cold start (process
 * dead to first drawn frame) inside 550 ms on the reference phone — 400 ms is
 * the target it keeps for hardware that can hold it — and a warm start (activity
 * recreated) inside 300 ms. Until this script existed neither was a number in a
 * run — the budgets were the web's, and the only launch evidence was a sentence
 * in a doc.
 *
 * The measurement is `am start -W`: its `TotalTime` is the launch through the
 * activity's first displayed frame, which for this app is the Compose frame
 * ([ShellActivity]) rather than a document. The splash is part of both numbers,
 * which is the point: the splash and that frame are one colour now, so what is
 * timed is the frame a person sees.
 *
 * A cold run is `am start -S`, which stops the process as part of the start: a
 * separate `am force-stop` first is not enough on Android 13, where starting the
 * launcher with its task still at the front answers "brought to the front", prints
 * no `TotalTime` and is not a launch at all. A warm run sends the app home and
 * brings it back with the process alive; what the platform then reports is either
 * `WARM` (activity recreated — the budget's own case, which a device with "Don't
 * keep activities" enabled in developer options produces) or `HOT` (the activity
 * resumed from the background, which is the floor rather than the case). The
 * script prints which it saw and never pretends a `COLD` run was a `WARM` one.
 *
 * A warm start can also come back as no launch at all. The activity keeps the
 * top-resumed state for a moment after the app leaves the screen, and on a slow
 * device that outlasts any fixed settle: `am start` then answers
 * `LaunchState: UNKNOWN` with no `TotalTime` and "its current task has been
 * brought to the front". That is not a measurement, so the start is re-issued
 * rather than recorded — a re-issued start that finally lands is a real warm
 * launch, while an UNKNOWN recorded as a number would read as an infinitely fast
 * one.
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
 * The budget is witnessed on the reference phone `docs/mobile/native-app.md` names
 * (`RMX3195`); the managed emulators (API 30 and 35) are where this runs when the
 * phone is not attached, and an emulator reports a number that is a comparison
 * rather than the figure a phase exit is signed off on. Say which device the run
 * used wherever the result is recorded.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The application id, pinned to `android/app/build.gradle` by the test beside this file. */
export const PACKAGE_ID = 'com.royaraqamia.app';
/** The launcher, pinned to the manifest's MAIN/LAUNCHER activity by the same test. */
export const LAUNCH_ACTIVITY = '.shell.ShellActivity';
/**
 * `docs/mobile/native-app.md`: cold start and warm start, in milliseconds.
 *
 * The cold number is what the reference phone (RMX3195) holds, not the 400 ms target the doc keeps
 * for hardware that can: measured with `ShellFrame` replaced by nothing, a cold launch still reports
 * 419 ms, so a budget under that floor is one no app work can meet.
 */
export const BUDGET = { cold: 550, warm: 300 };
/** How many runs the median is taken over by default. */
export const RUNS = 3;
/** How long the app is given to report that it stopped after the HOME key. */
export const HOME_TIMEOUT_MS = 3000;
/** How often that state is read, while the activity is still resumed. */
export const HOME_POLL_MS = 150;
/** How long the home transition is given after the activity stopped: the task is modal for a moment. */
export const HOME_SETTLE_MS = 700;
/** How long `am force-stop` is given to actually remove the process. */
export const PROCESS_DEATH_TIMEOUT_MS = 3000;
/**
 * How long a warm start waits before it is re-issued.
 *
 * The app can still hold the top-resumed state after it has left the screen, and
 * `am start` answers that with no `TotalTime` at all. Each re-issue is another
 * `am start -W`, so this is also how much of the transition the drill is willing
 * to sit through before calling the run unmeasurable.
 */
export const WARM_RETRY_MS = 700;
/** How many times a warm start is issued before the run is called unmeasurable. */
export const WARM_ATTEMPTS = 6;

/**
 * The options, from argv.
 *
 * `--runs` is bounded because each run costs the settle windows; `--no-budget`
 * turns a miss into a printed warning, for a run on an emulator.
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

/**
 * A device-side command whose exit status is an answer, not a failure.
 *
 * `pidof` exits 1 when nothing matches, which is exactly the "the process is
 * gone" this script is waiting for.
 */
function shell(adbPath, device, args) {
  const prefix = device ? ['-s', device] : [];
  const result = spawnSync(adbPath, [...prefix, 'shell', ...args], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

/** A synchronous pause: the runs are sequential, and nothing else needs the loop. */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * The `am start` arguments, with or without the stop-before-start.
 *
 * A cold run is a real stop: `am force-stop`, the process waited out, then the
 * launcher started from the home screen. `am start -S` looks equivalent and is
 * not — on Android 13 it raced and reported a `WARM` launch, which would have
 * been recorded as a cold number. A start while the activity is still resumed is
 * a no-op (`LaunchState: UNKNOWN`, no `TotalTime`), so both paths wait for the
 * home screen before starting.
 */
export function startArgs() {
  return ['shell', 'am', 'start', '-W', '-n', `${PACKAGE_ID}/${LAUNCH_ACTIVITY}`];
}

/** One launch, with the reading the platform printed and the raw answer beside it. */
function launch(adbPath, device) {
  const stdout = adb(adbPath, device, startArgs());
  return { ...parseAmStart(stdout), stdout };
}

/**
 * A start the platform answered without launching the activity.
 *
 * `am start -W` prints `LaunchState: UNKNOWN` when the task it was asked for is
 * still the front one: nothing was started, so there is nothing to time — and it
 * prints that as either no `TotalTime` at all or `TotalTime: 0`. A real launch is
 * the platform naming `COLD`, `WARM` or `HOT` and a positive number beside it, so
 * anything else is waited out rather than recorded: an UNKNOWN read as a number is
 * an infinitely fast launch.
 */
export function answeredWithoutLaunch(reading) {
  return reading.state === null || !(reading.totalTime > 0);
}

function coldRun(adbPath, device) {
  adb(adbPath, device, ['shell', 'am', 'force-stop', PACKAGE_ID]);
  waitUntilDead(adbPath, device);
  background(adbPath, device);
  const reading = launch(adbPath, device);
  if (answeredWithoutLaunch(reading)) {
    throw new Error(`am start did not launch the activity:\n${reading.stdout.trim()}`);
  }
  if (reading.state !== 'COLD') {
    throw new Error(
      `expected a COLD launch, the platform reported ${reading.state ?? 'no state'}: ` +
        'the process was not dead, so this run cannot be a cold start'
    );
  }
  return reading;
}

/**
 * A warm start, re-issued while the platform still answers that it did not launch.
 *
 * The cold path cannot do this: a cold run that came back as a launch it did not
 * make would be a different measurement, and its state guard already refuses it.
 */
function warmLaunch(adbPath, device) {
  let reading = launch(adbPath, device);
  for (let attempt = 1; attempt < WARM_ATTEMPTS && answeredWithoutLaunch(reading); attempt += 1) {
    sleep(WARM_RETRY_MS);
    reading = launch(adbPath, device);
  }
  if (answeredWithoutLaunch(reading)) {
    throw new Error(
      `am start did not launch the activity in ${WARM_ATTEMPTS} attempts, so it never left the ` +
        `top-resumed state:\n${reading.stdout.trim()}`
    );
  }
  return reading;
}

function warmRun(adbPath, device) {
  background(adbPath, device);
  const reading = warmLaunch(adbPath, device);
  if (reading.state === 'COLD') {
    throw new Error('a warm run came back COLD: the process died between runs');
  }
  return reading;
}

/** The process really is gone, not merely asked to stop. */
function waitUntilDead(adbPath, device) {
  const deadline = Date.now() + PROCESS_DEATH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const pid = shell(adbPath, device, ['pidof', PACKAGE_ID]).trim();
    if (pid === '') return;
    sleep(HOME_POLL_MS);
  }
  throw new Error(
    `${PACKAGE_ID} was still running ${PROCESS_DEATH_TIMEOUT_MS} ms after force-stop`
  );
}

/**
 * The state the platform reports for one activity record, in its own words.
 *
 * `dumpsys activity activities` prints an `ActivityRecord{...}` header per record
 * and a `state=` line inside it (`RESUMED`, `PAUSED`, `STOPPED`, …). Reading the
 * field rather than the presence of a line is what makes "the app is out of the
 * way" a fact: the platform's summary of what is on top is not the same question,
 * and a start while this still says `RESUMED` is answered as a task brought to the
 * front instead of a launch.
 */
export function activityState(dump, component) {
  let current = null;
  for (const line of dump.split('\n')) {
    const header = /ActivityRecord\{\S+ u\d+ ([^}]+)\}/.exec(line);
    if (header) {
      current = header[1].replace(/\s+t\d+$/, '').trim();
      continue;
    }
    if (current !== component) continue;
    const state = /^\s+state=(\w+)/.exec(line);
    if (state) return state[1];
  }
  return null;
}

/**
 * The app is out of the way before anything is started.
 *
 * Leaving the screen is not the same as being stopped: the activity keeps the
 * top-resumed state for a moment, and `am start` inside that window is answered
 * as a task brought to the front rather than as a launch — `LaunchState: UNKNOWN`
 * and no `TotalTime`. The platform's own `state=` on the activity record is what
 * says the transition is over, so that is what is waited for, and the settle after
 * it covers the task still being modal for a moment.
 */
function background(adbPath, device) {
  adb(adbPath, device, ['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  const deadline = Date.now() + HOME_TIMEOUT_MS;
  while (Date.now() < deadline) {
    sleep(HOME_POLL_MS);
    const dump = adb(adbPath, device, ['shell', 'dumpsys activity activities']);
    const state = activityState(dump, `${PACKAGE_ID}/${LAUNCH_ACTIVITY}`);
    if (state === null || state === 'STOPPED' || state === 'DESTROYED') {
      sleep(HOME_SETTLE_MS);
      return;
    }
  }
  throw new Error(`the app did not stop after the HOME key: ${HOME_TIMEOUT_MS} ms`);
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
