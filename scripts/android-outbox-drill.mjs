#!/usr/bin/env node
/**
 * The Outbox drill (#650): a write queued with no radio, the process killed, the
 * radio restored, the app opened again — and the row has to be on the server.
 *
 * This is the one acceptance criterion of the ticket a browser and a JVM test
 * cannot reach. `docs/mobile/native-app.md`'s phase 1 asks for exactly it: "a
 * `native:drill` script that does what `scripts/shell-drill.mjs` does: kill the
 * process with a write queued, restore the radio, and assert the row lands on the
 * server". The device half is `OutboxDrillActivity` in `src/debug`, so a release
 * APK has neither the activity nor a way to seed a write.
 *
 * What it does, in order:
 *
 *   1. builds and installs the debug APK (from a clean checkout, one command);
 *   2. clears the app's data and signs in over the network;
 *   3. cuts the radio (Wi-Fi, mobile data, airplane mode);
 *   4. seeds a habit — the row and its intent commit while nothing can be sent;
 *   5. `am force-stop`s the process, which is what "the process dying" means;
 *   6. restores the radio and starts the app again;
 *   7. waits for the drain and reads the row back from the server's own snapshot;
 *   8. removes the drill's row again, so the account is left as it was found.
 *
 * The number the ticket is written in: the write must be drained within 5 s of
 * the radio returning (`docs/mobile/native-app.md`'s budgets, "Offline write,
 * radio back, drained"). `--no-budget` prints a miss instead of failing on it, for
 * a slow device or a slow network that is not the code's fault.
 *
 * Requirements: `npm ci`, the Android SDK (`ANDROID_HOME`/`ANDROID_SDK_ROOT`), a
 * connected device or emulator, and `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` for an
 * account the write may be made in. The debug build reads the project from
 * `android/supabase.properties`, which is committed.
 *
 * Usage:
 *   npm run android:outbox-drill
 *   npm run android:outbox-drill -- --device <serial>
 *   npm run android:outbox-drill -- --no-build --apk path/to/app-debug.apk
 *   npm run android:outbox-drill -- --no-budget --settle 3000
 *
 * Exit codes: 0 the row is on the server inside the budget, 1 it is not,
 * 2 adb, a credential or the device is missing.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PACKAGE_ID, findAdb } from './android-launch.mjs';

const ROOT = resolve(process.cwd());

/** Null under a bundler or a DOM test environment, where there is no file URL. */
const SCRIPT_PATH = import.meta.url.startsWith('file:') ? fileURLToPath(import.meta.url) : null;

/** `docs/mobile/native-app.md`: an offline write, radio back, drained. */
export const BUDGET_MS = 5000;

/** The application id plus the debug-only drill activity. */
export const DRILL_ACTIVITY = `${PACKAGE_ID}/.debug.OutboxDrillActivity`;

/** The one log tag the activity prints under, and this script reads. */
export const TAG = 'RoyOutbox';

/** Where `npm run android:apk` leaves the debug build. */
export const APK_PATH = 'android/app/build/outputs/apk/debug/app-debug.apk';

/** How long any single phase may take before the drill gives up. */
export const PHASE_TIMEOUT_MS = 60_000;

/** How long the radio is given to settle before the app is started again. */
export const DEFAULT_SETTLE_MS = 1500;

/** The three extras the activity reads, shared with its constants by name. */
export const EXTRA = {
  mode: 'roy.outbox.mode',
  email: 'roy.outbox.email',
  password: 'roy.outbox.password',
  name: 'roy.outbox.name',
  id: 'roy.outbox.id',
};

/** The options, from argv. */
export function parseArgs(argv) {
  const options = {
    device: null,
    build: true,
    apk: null,
    budget: true,
    settleMs: DEFAULT_SETTLE_MS,
    name: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--no-build') {
      options.build = false;
      continue;
    }
    if (arg === '--no-budget') {
      options.budget = false;
      continue;
    }
    if (['--device', '--apk', '--settle', '--name'].includes(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('-')) throw new Error(`${arg} needs a value`);
      index += 1;
      if (arg === '--device') options.device = value;
      if (arg === '--apk') {
        options.apk = value;
        options.build = false;
      }
      if (arg === '--name') options.name = value;
      if (arg === '--settle') {
        const settle = Number(value);
        if (!Number.isInteger(settle) || settle < 0 || settle > 15_000) {
          throw new Error('--settle takes a whole number of milliseconds from 0 to 15000');
        }
        options.settleMs = settle;
      }
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

/** `queued <id> pending=<n> identity=<namespace>` as the activity printed it. */
export function parseQueued(line) {
  const match = /queued (\S+) pending=(\d+) identity=(\S+)/.exec(line);
  if (!match) return null;
  return { id: match[1], pending: Number(match[2]), identity: match[3] };
}

/** `drained signed-in=<bool> pending=<n> failed=<n>` after the relaunch. */
export function parseDrained(line) {
  const match = /drained signed-in=(true|false) pending=(\d+) failed=(\d+)/.exec(line);
  if (!match) return null;
  return {
    signedIn: match[1] === 'true',
    pending: Number(match[2]),
    failed: Number(match[3]),
  };
}

/** `verified <id> present=<bool>`, read back from the server's snapshot. */
export function parseVerified(line) {
  const match = /verified (\S+) present=(true|false)/.exec(line);
  if (!match) return null;
  return { id: match[1], present: match[2] === 'true' };
}

/** `cleaned <id> pending=<n> failed=<n>`: the drill's own row, removed again. */
export function parseCleaned(line) {
  const match = /cleaned (\S+) pending=(\d+) failed=(\d+)/.exec(line);
  if (!match) return null;
  return { id: match[1], pending: Number(match[2]), failed: Number(match[3]) };
}

/**
 * What the run asserts, separated from the device so it can be tested: the row
 * is on the server, nothing is left queued or failed, the queue drained under an
 * account (never a guest's), and the drain fits the budget.
 */
export function verdict({ queued, drained, verified, elapsedMs, budget = true }) {
  const problems = [];
  if (!queued) problems.push('the write was never queued');
  else if (queued.pending < 1) problems.push('the write was not pending after it was made');
  else if (!queued.identity.startsWith('user:')) {
    problems.push(`the write was queued under ${queued.identity}, not an account`);
  }
  if (!drained) problems.push('the app never reported a drain after the relaunch');
  else {
    if (!drained.signedIn) problems.push('the session did not survive the kill');
    if (drained.pending > 0) problems.push(`${drained.pending} write(s) still queued`);
    if (drained.failed > 0) problems.push(`${drained.failed} write(s) failed permanently`);
  }
  if (!verified) problems.push('the server snapshot was never read back');
  else if (!verified.present) problems.push('the row is not on the server');
  else if (queued && verified.id !== queued.id) {
    problems.push(`read back ${verified.id}, queued ${queued.id}`);
  }
  if (elapsedMs === null || elapsedMs === undefined) problems.push('the drain was never timed');
  else if (budget && elapsedMs > BUDGET_MS) {
    problems.push(`the drain took ${elapsedMs} ms, over the ${BUDGET_MS} ms budget`);
  }
  return { ok: problems.length === 0, problems };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(
      'Usage: npm run android:outbox-drill -- [--device <serial>] [--no-build] [--apk <path>]\n' +
        '                                       [--no-budget] [--settle <ms>] [--name <habit>]\n'
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

  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    process.stderr.write(
      'E2E_TEST_EMAIL and E2E_TEST_PASSWORD are required: the drain needs an account\n'
    );
    return 2;
  }

  const device = options.device;
  const adb = (args, { allowFailure = false, timeout = 30_000 } = {}) => {
    const result = spawnSync(adbPath, [...(device ? ['-s', device] : []), ...args], {
      encoding: 'utf8',
      timeout,
    });
    if (result.error) throw result.error;
    if (!allowFailure && result.status !== 0) {
      throw new Error(
        `adb ${args.join(' ')} exited ${result.status}: ${(result.stderr ?? '').trim()}`
      );
    }
    return `${result.stdout ?? ''}${result.stderr ?? ''}`;
  };

  const logcat = () => adb(['logcat', '-d', '-s', `${TAG}:I`], { allowFailure: true });
  const clearLog = () => adb(['logcat', '-c'], { allowFailure: true });

  /** Wait for one of the activity's lines, or say which one never came. */
  const waitFor = (parse, what, timeoutMs = PHASE_TIMEOUT_MS) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const line of logcat().split(/\r?\n/)) {
        const parsed = parse(line);
        if (parsed) return parsed;
      }
      sleep(200);
    }
    throw new Error(
      `timed out after ${timeoutMs} ms waiting for ${what}. logcat said:\n${logcat().trim()}`
    );
  };

  const startDrill = (mode, extras = {}) => {
    const pairs = Object.entries({ [EXTRA.mode]: mode, ...extras }).flatMap(([key, value]) => [
      '--es',
      key,
      String(value),
    ]);
    const output = adb(['shell', 'am', 'start', '-W', '-n', DRILL_ACTIVITY, ...pairs], {
      allowFailure: true,
      timeout: PHASE_TIMEOUT_MS,
    });
    if (!/Status: ok/.test(output)) throw new Error(`the drill activity did not start:\n${output}`);
  };

  const setRadio = (on) => {
    adb(['shell', 'cmd', 'connectivity', 'airplane-mode', on ? 'disable' : 'enable'], {
      allowFailure: true,
    });
    adb(['shell', 'svc', 'wifi', on ? 'enable' : 'disable'], { allowFailure: true });
    adb(['shell', 'svc', 'data', on ? 'enable' : 'disable'], { allowFailure: true });
  };

  const rows = [];
  const record = (step, result) => {
    rows.push([step, result]);
    process.stdout.write(`  ${step.padEnd(18)} ${result}\n`);
  };

  try {
    // 1. The build the drill runs. `android:apk` is the repo's own path (it
    //    runs `cap sync` first, which is what makes a clean checkout build).
    const apk = options.apk ? resolve(ROOT, options.apk) : join(ROOT, APK_PATH);
    if (options.build) {
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const built = spawnSync(npm, ['run', 'android:apk'], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 30 * 60_000,
      });
      if (built.status !== 0) {
        throw new Error(
          `android:apk failed:\n${`${built.stdout ?? ''}${built.stderr ?? ''}`.trim()}`
        );
      }
      record('build', 'app-debug.apk');
    } else {
      record('build', 'skipped (--no-build)');
    }
    if (!existsSync(apk)) throw new Error(`${apk} does not exist: build it or pass --apk`);

    const installed = adb(['install', '-r', apk], { timeout: 180_000 });
    if (!/Success/i.test(installed)) throw new Error(`adb install said: ${installed.trim()}`);
    record('install', 'ok');

    // 2. A clean device and an online sign-in: the drill owns this account's
    //    queue, so a leftover intent would make the timing a lie.
    adb(['shell', 'pm', 'clear', PACKAGE_ID], { allowFailure: true });
    setRadio(true);
    sleep(options.settleMs);
    clearLog();
    startDrill('signin', { [EXTRA.email]: email, [EXTRA.password]: password });
    const signIn = waitFor(
      (line) => (/signed-in (true|false)\S*/.exec(line) ?? [])[0] ?? null,
      'the sign-in to answer'
    );
    if (!signIn.startsWith('signed-in true')) throw new Error(`sign-in did not succeed: ${signIn}`);
    record('sign-in', 'ok');

    // 3. No radio, then the write. This is the state the ticket exists for.
    setRadio(false);
    sleep(options.settleMs);
    clearLog();
    const name = options.name ?? `drill-${Date.now()}`;
    startDrill('seed', { [EXTRA.name]: name });
    const queued = waitFor(parseQueued, 'the write to be queued');
    record('radio off', 'queued offline');
    record('queued', `${queued.id} pending=${queued.pending} under ${queued.identity}`);

    // 4. The process dies. A force-stop is the honest case: nothing in the app
    //    gets to run afterwards, so only what is on disk survives.
    adb(['shell', 'am', 'force-stop', PACKAGE_ID]);
    const deadline = Date.now() + 3_000;
    while (
      Date.now() < deadline &&
      adb(['shell', 'pidof', PACKAGE_ID], { allowFailure: true }).trim()
    ) {
      sleep(100);
    }
    record('kill', 'force-stopped');

    // 5. The radio returns; the app is started again and has to deliver.
    setRadio(true);
    sleep(options.settleMs);
    clearLog();
    const radioOnAt = Date.now();
    startDrill('verify', { [EXTRA.id]: queued.id });

    const drained = waitFor(parseDrained, 'the drain after the relaunch');
    const elapsedMs = Date.now() - radioOnAt;
    record(
      'drained',
      `${elapsedMs} ms (budget ${BUDGET_MS} ms) pending=${drained.pending} failed=${drained.failed}`
    );

    const verified = waitFor(parseVerified, 'the server snapshot to be read back');
    record('verified', `${verified.id} present=${verified.present}`);

    // The drill's own row is removed again, so a run leaves the account as it
    // found it. A cleanup that misses is reported, never a reason to fail: the
    // claim under test is the write, not the delete.
    let cleaned = null;
    try {
      cleaned = waitFor(parseCleaned, 'the drill to clean up after itself', 15_000);
    } catch {
      cleaned = null;
    }
    record(
      'cleaned',
      cleaned
        ? `${cleaned.id} pending=${cleaned.pending} failed=${cleaned.failed}`
        : 'not observed (the row may still be on the account)'
    );

    const result = verdict({ queued, drained, verified, elapsedMs, budget: options.budget });
    for (const problem of result.problems) process.stderr.write(`  x ${problem}\n`);
    if (result.ok) {
      process.stdout.write(
        `\n  the write survived the process and reached the server in ${elapsedMs} ms\n`
      );
      return 0;
    }
    process.stderr.write(
      options.budget
        ? '\n  the write did not arrive as promised: fix it rather than cancelling the slice\n'
        : '\n  the write did not arrive as promised (--no-budget keeps the exit code honest)\n'
    );
    return 1;
  } catch (error) {
    process.stderr.write(`  x ${error.message}\n`);
    if (rows.length > 0) {
      process.stderr.write(
        `\n  the drill stopped after: ${rows.map(([step]) => step).join(' -> ')}\n`
      );
    }
    return 1;
  }
}

if (SCRIPT_PATH && process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  process.exit(main(process.argv.slice(2)));
}
