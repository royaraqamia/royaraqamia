#!/usr/bin/env node
/**
 * The crash drill (#667): crash a debug build on purpose, then read the report
 * the app wrote about itself before it died.
 *
 * This is the one acceptance criterion of the ticket neither a browser nor a JVM
 * test can reach — "a deliberate crash from a debug build is reported with the
 * release version and version code". The throwing half is `CrashDrillActivity` in
 * `src/debug`, so a release APK contains neither the activity nor a way to ask
 * for a crash; the reading half is this script, over `adb`.
 *
 * What it does, in order:
 *
 *   1. builds and installs the debug APK (from a clean checkout, one command);
 *   2. clears the app's data, so the queue starts empty and what it finds is
 *      this drill's own report;
 *   3. starts the drill activity, which throws 1.2 s later — from a drawn frame,
 *      not from the launch path;
 *   4. waits for the process to be gone and the reporter's log line;
 *   5. reads the queue back with `run-as` and checks every report it finds names
 *      the release the APK was built with, and a contract generation.
 *
 * Requirements: `npm ci`, the Android SDK (`ANDROID_HOME`/`ANDROID_SDK_ROOT`), and
 * a connected device or emulator. Delivery to the server is *not* asserted here:
 * the queue is the app's own promise, and the worker that drains it has a JVM
 * test per answer (`FailureDeliveryTest`). Watch Sentry with the `app-failure`
 * fingerprint if you want the far end.
 *
 * Usage:
 *   npm run android:crash-drill
 *   npm run android:crash-drill -- --device <serial>
 *   npm run android:crash-drill -- --no-build --apk path/to/app-debug.apk
 *
 * Exit codes: 0 the report is queued and names the release, 1 it is not,
 * 2 adb or the device is missing.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PACKAGE_ID, findAdb } from './android-launch.mjs';

const ROOT = resolve(process.cwd());

/** Null under a bundler or a DOM test environment, where there is no file URL. */
const SCRIPT_PATH = import.meta.url.startsWith('file:') ? fileURLToPath(import.meta.url) : null;

/** The application id plus the debug-only drill activity. */
export const DRILL_ACTIVITY = `${PACKAGE_ID}/.debug.CrashDrillActivity`;

/** The activity's own extra, shared with `CrashDrillActivity` by name. */
export const EXTRA_MODE = 'roy.crash.mode';
export const MODE_CRASH = 'crash';

/** What the activity logs itself under, and what the reporter logs under. */
export const TAG = 'RoyCrashDrill';
export const REPORTER_TAG = 'RoyFailure';

/** The queue's directory inside the app's private storage, under `filesDir`. */
export const QUEUE_DIR = 'files/app-failures';

/** Where `npm run android:apk` leaves the debug build. */
export const APK_PATH = 'android/app/build/outputs/apk/debug/app-debug.apk';

/** How long the process is given to die and be read, in total. */
export const PHASE_TIMEOUT_MS = 60_000;

/** The contract's generation pattern; the app writes twelve hex characters. */
const CONTRACTS = /^[0-9a-f]{12}$/;

export function parseArgs(argv) {
  const options = { device: null, build: true, apk: null, help: false };
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
    if (['--device', '--apk'].includes(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('-')) throw new Error(`${arg} needs a value`);
      index += 1;
      if (arg === '--device') options.device = value;
      if (arg === '--apk') {
        options.apk = value;
        options.build = false;
      }
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

/** The release `android/shell-version.properties` names, as the APK reports it. */
export function readShellVersion(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^(shellVersion(?:Name|Code))\s*=\s*(\S+)\s*$/.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }
  const name = values.shellVersionName;
  const code = Number(values.shellVersionCode);
  if (!name || !Number.isInteger(code)) {
    throw new Error('android/shell-version.properties names no shell version');
  }
  return { name, code };
}

/**
 * Whether what the queue holds is a report this drill can believe: the crash it
 * asked for, from the release that was installed.
 */
export function verdict(reports, expected) {
  const problems = [];
  if (reports.length === 0) problems.push('the queue is empty: the crash was not reported');

  for (const report of reports) {
    let body;
    try {
      body = JSON.parse(report.body);
    } catch {
      problems.push(`${report.file} is not JSON`);
      continue;
    }
    if (body.kind !== 'crash' || body.reason !== 'uncaught') {
      problems.push(`${report.file} is ${body.kind}/${body.reason}, not an uncaught crash`);
    }
    if (body.shell?.name !== expected.name || body.shell?.code !== expected.code) {
      problems.push(
        `${report.file} names ${body.shell?.name}+${body.shell?.code}, ` +
          `the build is ${expected.name}+${expected.code}`
      );
    }
    if (!CONTRACTS.test(body.contracts ?? '')) {
      problems.push(`${report.file} names no contract generation`);
    }
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
      'Usage: npm run android:crash-drill -- [--device <serial>] [--no-build] [--apk <path>]\n'
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

  const expected = readShellVersion(
    readFileSync(join(ROOT, 'android', 'shell-version.properties'), 'utf8')
  );

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

  const alive = () => adb(['shell', 'pidof', PACKAGE_ID], { allowFailure: true }).trim() !== '';

  try {
    if (options.build) {
      const apk = join(ROOT, APK_PATH);
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
      adb(['install', '-r', '-d', apk], { timeout: 5 * 60_000 });
      process.stdout.write(`  ${'build'.padEnd(18)} ${APK_PATH}\n`);
    } else {
      process.stdout.write(`  ${'build'.padEnd(18)} skipped (--no-build)\n`);
    }

    // A fresh queue is what makes "the report it finds is this drill's own" true.
    adb(['shell', 'pm', 'clear', PACKAGE_ID], { allowFailure: true });
    adb(['logcat', '-c'], { allowFailure: true });

    const started = adb(
      ['shell', 'am', 'start', '-W', '-n', DRILL_ACTIVITY, '--es', EXTRA_MODE, MODE_CRASH],
      { allowFailure: true, timeout: PHASE_TIMEOUT_MS }
    );
    if (!/Status: ok/.test(started))
      throw new Error(`the drill activity did not start:\n${started}`);

    const deadline = Date.now() + PHASE_TIMEOUT_MS;
    let reports = [];
    while (Date.now() < deadline) {
      sleep(500);
      if (alive()) continue;
      const listing = adb(['shell', 'run-as', PACKAGE_ID, 'ls', QUEUE_DIR], {
        allowFailure: true,
      });
      const files = listing
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.endsWith('.json'));
      if (files.length === 0) continue;
      reports = files.map((file) => ({
        file,
        body: adb(['shell', 'run-as', PACKAGE_ID, 'cat', `${QUEUE_DIR}/${file}`], {
          allowFailure: true,
        }),
      }));
      break;
    }

    if (reports.length === 0) {
      const log = adb(['logcat', '-d', '-s', `${TAG}:I`, `${REPORTER_TAG}:W`], {
        allowFailure: true,
      });
      throw new Error(
        `no report was queued within ${PHASE_TIMEOUT_MS} ms. logcat said:\n${log.trim()}`
      );
    }

    const result = verdict(reports, expected);
    for (const report of reports) {
      const body = JSON.parse(report.body);
      process.stdout.write(
        `  ${'report'.padEnd(18)} ${report.file}: ${body.kind}/${body.reason} ` +
          `${body.shell.name}+${body.shell.code} contracts@${body.contracts}\n`
      );
    }
    process.stdout.write(`  ${'release'.padEnd(18)} ${expected.name}+${expected.code}\n`);

    if (!result.ok) {
      process.stderr.write(`${result.problems.join('\n')}\n`);
      return 1;
    }
    process.stdout.write(`  ${'verdict'.padEnd(18)} the app reported its own crash\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (SCRIPT_PATH && process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  process.exitCode = main(process.argv.slice(2));
}
