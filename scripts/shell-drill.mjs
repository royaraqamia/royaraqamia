#!/usr/bin/env node
/**
 * The Android shell's background-drain drill, as one script instead of four
 * throwaway ones. See docs/mobile/android-shell.md ("The drain drill").
 *
 * What it proves is the thing no browser test can: a write queued by the app
 * with the radio off is still delivered after the app's process is gone, by the
 * WorkManager job that loads `/sync-flush.html` in a headless WebView. The steps
 * are the ones that were rediscovered by hand each time, in this order:
 *
 * 1. Boot an emulator (headless by default) and wait for it to finish booting.
 * 2. Serve the site locally and point the shell at `http://localhost:<port>`,
 *    then `adb reverse tcp:<port> tcp:<port>`.
 * 3. Install the debug APK and drive the WebView over raw CDP — `Runtime.enable`
 *    first, always, or evaluation lands in the initial empty context.
 * 4. Sign in through the page, queue a HabitFlow habit with the radio off,
 *    background and `am kill` the app, restore the radio, and wait for the
 *    worker's `RoySyncFlush: drained (failed=0)` line.
 * 5. Always tear the emulator and the dev server down (unless `--keep`).
 *
 * Three constraints are baked in rather than left to be rediscovered:
 *
 * - **Turnstile is unconfigured for the login.** The script starts the dev
 *   server with `TURNSTILE_SECRET_KEY` empty *in that process only*, exactly as
 *   `.github/workflows/e2e-offline.yml` leaves it. It never touches a deployed
 *   environment, and a server the script did not start is only reported on.
 * - **`am kill`, never `am force-stop`.** Force-stop cancels scheduled work, so
 *   it would destroy the very job the drill is about.
 * - **`localhost` + `adb reverse`, never `10.0.2.2`.** The site's CSP sends
 *   `upgrade-insecure-requests`, which upgrades every subresource of a cleartext
 *   document to https; `localhost` is a trustworthy origin and is exempt, the
 *   emulator's host alias is not.
 *
 * The one step this environment cannot do is documented where it fails: the
 * `Pixel_API_30` image carries WebView 83.0.4103.106, below the shell's floor of
 * 111, so Capacitor loads `unavailable.html` and the site never hydrates. The
 * script measures the WebView before asking it to sign in, and stops with the
 * two paths that actually work (a real device, or the Chromium stand-in
 * `e2e/sync-flush.spec.ts`) rather than replaying the dead end.
 *
 * Usage:
 *   npm run android:drill                  # Pixel_API_30, app at localhost:3000
 *   npm run android:drill -- --device <serial>   # a real device, already booted
 *   npm run android:drill -- --keep        # leave the emulator/server up to inspect
 *   npm run android:drill -- --skip-build  # reuse an APK built against this origin
 *   npm run android:drill -- --matrix      # then the force-stop, doze and mid-flush cases
 *
 * `--matrix` is the phone-only half of the device matrix (issue #387): the three
 * cases that can be scripted are run after the drain, each with its own queued
 * write, and their observations are printed as a markdown table to paste into
 * docs/mobile/android-shell.md. The cases that need credentials or a person (the
 * FCM wake, low storage, a worker swap, several tabs) stay manual; the doc table
 * says so rather than implying a run that never happened.
 *
 * Credentials come from `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` (the offline
 * suite's account), loaded from `.env` by the npm script.
 *
 * Exit codes: 0 drained (and no matrix case failed), 1 failed, 2 the environment
 * cannot run the page half.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const PACKAGE_ID = 'com.royaraqamia.app';
export const MAIN_ACTIVITY = `${PACKAGE_ID}/.MainActivity`;
/** The AVD the emulator drills were measured on; `--device` replaces it. */
export const DEFAULT_AVD = 'Pixel_API_30';
export const DEFAULT_PORT = 3000;
export const DEFAULT_TIMEOUT_MS = 300_000;
/**
 * The shell's own floor, from `capacitor.config.ts` (`android.minWebViewVersion`).
 * Pinned by `scripts/__tests__/shell-drill.test.mjs` so the two cannot drift.
 */
export const WEBVIEW_FLOOR = 111;
/** Where the app's WebView DevTools socket is forwarded, as in verify-bridge.mjs. */
export const DEVTOOLS_PORT = 9222;
/** The worker's log tag (`SyncFlushWorker.LOG_TAG`). */
export const DRILL_LOG_TAG = 'RoySyncFlush';
/** The success line the drill waits for (`SyncFlushResult.done`). */
export const DRAIN_SUCCESS = /drained \(failed=\d+\)/;
/**
 * The matrix's scripted cases, in the order they run. The titles and expected
 * observations are the doc table's own words, so a run pastes in without editing.
 */
export const MATRIX_CASES = [
  {
    id: 'force-stop',
    title: 'Force-stop',
    expected: 'nothing until launch',
  },
  {
    id: 'doze',
    title: 'Doze',
    expected: 'deferred while idle, drains after release',
  },
  {
    id: 'mid-flush',
    title: 'Process death mid-flush',
    expected: 'one habit, no duplicate',
  },
];
/** How long force-stop is observed doing nothing before the app is launched. */
export const FORCE_STOP_WINDOW_MS = 60_000;
/** How long doze is observed holding the job before the device is released. */
export const DOZE_WINDOW_MS = 60_000;
const APK = join(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk');
const PACKAGED_CONFIG = join(ROOT, 'android/app/src/main/assets/capacitor.config.json');
const TURNSTILE_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

/** A failure a reader can act on; `code` is what the process exits with. */
class DrillError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

/**
 * A reason the *environment* cannot run the drill, not a defect in the shell.
 * Exit 2 keeps it distinguishable from a failed drain in a script that wraps this.
 */
class EnvironmentError extends DrillError {
  constructor(message) {
    super(message, 2);
  }
}

export function parseArgs(argv = []) {
  const options = {
    avd: DEFAULT_AVD,
    device: null,
    port: DEFAULT_PORT,
    keep: false,
    skipBuild: false,
    matrix: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new DrillError(`${arg} needs a value`);
      }
      index += 1;
      return next;
    };

    switch (arg) {
      case '--avd':
        options.avd = value();
        break;
      case '--device':
        options.device = value();
        break;
      case '--port':
        options.port = Number(value());
        if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) {
          throw new DrillError('--port must be a TCP port');
        }
        break;
      case '--timeout': {
        const seconds = Number(value());
        if (!Number.isFinite(seconds) || seconds < 30) {
          throw new DrillError('--timeout must be at least 30 seconds');
        }
        options.timeoutMs = seconds * 1_000;
        break;
      }
      case '--keep':
        options.keep = true;
        break;
      case '--skip-build':
        options.skipBuild = true;
        break;
      case '--matrix':
        options.matrix = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new DrillError(`unknown option ${arg} (try --help)`);
    }
  }

  return options;
}

/** `Chrome/<major>` from a WebView user agent, or null when it carries none. */
export function webViewMajor(userAgent) {
  const match = /Chrome\/(\d+)/.exec(String(userAgent ?? ''));
  return match ? Number(match[1]) : null;
}

/** Whether a logcat line is the worker's clean report, not its "come back" one. */
export function isDrainSuccess(line) {
  return DRAIN_SUCCESS.test(String(line ?? ''));
}

/**
 * A markdown table cell: one line, and pipes escaped so the row cannot split.
 * Backslashes are escaped first, or a `\|` in the input would emit `\\|` and
 * read as an escaped backslash followed by a live pipe.
 */
function cell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|');
}

/**
 * The matrix's observations as the table docs/mobile/android-shell.md holds. The
 * status is part of the cell rather than a column because a reader wants "pass —
 * what it showed" in one place, and a skipped case must not look like a pass.
 */
export function formatMatrixTable(results) {
  const lines = ['| Case | Expected | Observed |', '| --- | --- | --- |'];
  for (const result of results) {
    lines.push(
      `| ${cell(result.title)} | ${cell(result.expected)} | ${cell(
        `${result.status} — ${result.observation}`
      )} |`
    );
  }
  return lines.join('\n');
}

export function usage() {
  return [
    'Usage: node scripts/shell-drill.mjs [options]',
    '',
    '  --avd <name>       AVD to boot when --device is absent (default: Pixel_API_30)',
    '  --device <serial>  use a device/emulator that is already connected',
    '  --port <n>         port of the local dev server (default: 3000)',
    '  --timeout <s>      how long to wait for the worker line (default: 300)',
    '  --skip-build       reuse the debug APK if it was built against this origin',
    '  --matrix           after the drain, run the force-stop, doze and mid-flush cases',
    '  --keep             leave the emulator and the dev server running',
    '  --help             this text',
  ].join('\n');
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function isWindows() {
  return process.platform === 'win32';
}

function sdkTool(sdkHome, folder, name) {
  return join(sdkHome, folder, isWindows() ? `${name}.exe` : name);
}

/** Kills a spawned tree — `next dev` and Gradle both outlive their parent. */
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (isWindows()) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

/**
 * `npm run <script>` on Windows goes through `cmd.exe`: Node refuses to spawn a
 * `.cmd` without a shell, and `shell: true` with an argument array is deprecated
 * for injection reasons. Every argument here is a constant, so the shell is safe.
 */
function npmSpawn(script, options) {
  const args = ['run', script];
  return isWindows()
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'npm', ...args], options)
    : spawn('npm', args, options);
}

function npmSpawnSync(script, options) {
  const args = ['run', script];
  return isWindows()
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm', ...args], options)
    : spawnSync('npm', args, options);
}

/** The last few buffered lines of a child's output, for a failure message. */
function lastLines(lines, count = 40) {
  return lines.slice(-count).join('\n');
}

/** Retries `poll` until it returns something truthy or the deadline passes. */
async function waitFor(label, poll, { timeoutMs, intervalMs = 1_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = 'no attempt';
  while (Date.now() < deadline) {
    try {
      const value = await poll();
      if (value) return value;
      last = 'not yet';
    } catch (error) {
      last = error.message;
    }
    await sleep(intervalMs);
  }
  throw new DrillError(
    `${label} did not happen within ${Math.round(timeoutMs / 1_000)}s (${last})`
  );
}

/**
 * A CDP session on one WebView target. Raw WebSocket rather than a library: the
 * only thing the drill needs is `Runtime.evaluate`, and `verify-bridge.mjs`
 * already showed the plumbing is not worth a dependency.
 */
async function connectDevTools(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;

  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', () => rejectOpen(new Error('DevTools socket error')), {
      once: true,
    });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message ?? 'DevTools error'));
    else entry.resolve(message.result);
  });

  function send(method, params = {}, timeoutMs = 20_000) {
    return new Promise((resolveSend, rejectSend) => {
      const id = nextId;
      nextId += 1;
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectSend(new Error(`${method} timed out`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolveSend(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          rejectSend(error);
        },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  // The one ordering rule that costs an hour when missed: evaluation before
  // `Runtime.enable` can land in the initial empty context and return undefined
  // for an expression that is true in the page.
  await send('Runtime.enable');

  return {
    async evaluate(expression, { timeoutMs } = {}) {
      const result = await send(
        'Runtime.evaluate',
        {
          expression,
          returnByValue: true,
          awaitPromise: true,
        },
        timeoutMs
      );
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
        );
      }
      return result.result?.value;
    },
    close() {
      socket.close();
    },
  };
}

/**
 * Counts every `outbox` entry in every IndexedDB database the origin owns. The
 * Local Store's name carries the product and the account identity, which the
 * drill does not know, so it asks the origin rather than spelling a database
 * name that would change with the identity scheme.
 */
export const OUTBOX_COUNT_EXPRESSION = `(async () => {
  if (!indexedDB.databases) return -1;
  const databases = await indexedDB.databases();
  let total = 0;
  for (const info of databases) {
    if (!info.name) continue;
    const db = await new Promise((resolve) => {
      const request = indexedDB.open(info.name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    if (!db) continue;
    if (db.objectStoreNames.contains('outbox')) {
      total += await new Promise((resolve) => {
        const request = db.transaction('outbox', 'readonly').objectStore('outbox').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      });
    }
    db.close();
  }
  return total;
})()`;

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  log = console.log,
} = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    log(usage());
    return 0;
  }

  const sdkHome = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  if (!sdkHome) {
    throw new DrillError('ANDROID_HOME (or ANDROID_SDK_ROOT) must point at the Android SDK.');
  }
  const adbPath = sdkTool(sdkHome, 'platform-tools', 'adb');
  if (!existsSync(adbPath)) {
    throw new DrillError(`adb is missing from ${sdkHome}. Install platform-tools.`);
  }

  const email = env.DRILL_EMAIL ?? env.E2E_TEST_EMAIL;
  const password = env.DRILL_PASSWORD ?? env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new DrillError(
      'The drill signs in for real: set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in .env (the\n' +
        "offline suite's account), or DRILL_EMAIL / DRILL_PASSWORD for another one."
    );
  }

  const origin = `http://localhost:${options.port}`;

  const state = {
    emulator: null,
    device: null,
    bootOwned: false,
    server: null,
    /** The dev server's last lines, kept in memory: no temp file to expose. */
    serverLog: [],
    reverse: false,
    forward: false,
    page: null,
    /** Set by `setRadio(false)`; teardown puts the radio back even on a failure. */
    radioOff: false,
    /** Set while doze is forced; teardown releases the device. */
    dozing: false,
  };

  function adb(args, { allowFailure = false, timeout = 30_000 } = {}) {
    const full = state.device ? ['-s', state.device, ...args] : args;
    const result = spawnSync(adbPath, full, { encoding: 'utf8', timeout });
    if (result.error || (result.status !== 0 && !allowFailure)) {
      const detail = result.error?.message ?? (result.stderr ?? '').trim();
      throw new DrillError(`adb ${args.join(' ')} failed: ${detail}`);
    }
    return (result.stdout ?? '').trim();
  }

  /** The exit status, for a command whose refusal has to be told from its effect. */
  function adbStatus(args) {
    const full = state.device ? ['-s', state.device, ...args] : args;
    return spawnSync(adbPath, full, { encoding: 'utf8', timeout: 30_000 }).status ?? 1;
  }

  async function teardown() {
    try {
      state.page?.close();
    } catch {
      // The target is gone with the process; closing it is best-effort.
    }
    // A case that failed must not leave the phone without a radio or stuck idle.
    await restoreDevice();
    if (state.forward && state.device) {
      adb(['forward', '--remove', `tcp:${DEVTOOLS_PORT}`], { allowFailure: true });
      state.forward = false;
    }
    if (state.reverse && state.device) {
      adb(['reverse', '--remove', `tcp:${options.port}`], { allowFailure: true });
      state.reverse = false;
    }
    if (options.keep) {
      if (state.emulator || state.device) log(`\n[drill] keeping the device up: ${state.device}`);
      if (state.server)
        log(`[drill] keeping the dev server up (pid ${state.server.pid}) at ${origin}`);
      return;
    }
    if (state.bootOwned && state.device) {
      adb(['emu', 'kill'], { allowFailure: true });
    }
    killTree(state.emulator);
    killTree(state.server);
  }

  async function ensureServer() {
    const reachable = await fetch(origin, { signal: AbortSignal.timeout(2_000) })
      .then(() => true)
      .catch(() => false);

    if (reachable) {
      log(`[drill] using the server already listening on ${origin}`);
      log('[drill] it must have Turnstile unconfigured, or the login step will say so');
      return;
    }

    state.server = npmSpawn('dev', {
      cwd: ROOT,
      // Turnstile is unconfigured for this process and this process alone, the
      // same arrangement `e2e-offline.yml` makes: `backend/config/turnstile.ts`
      // skips verification when the secret is absent, which is what lets the
      // drill log in with a dummy token. `.env` is already loaded in the parent;
      // Next will not overwrite an existing key, including an empty one.
      env: { ...env, TURNSTILE_SECRET_KEY: '' },
      // Buffered in memory rather than written to a predictable file in the OS
      // temp directory, which CodeQL flags (`js/insecure-temporary-file`) and
      // which a `--keep` run would leave behind.
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const capture = (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.trim()) state.serverLog.push(line);
      }
      if (state.serverLog.length > 200) {
        state.serverLog.splice(0, state.serverLog.length - 200);
      }
    };
    state.server.stdout?.on('data', capture);
    state.server.stderr?.on('data', capture);

    log(`[drill] starting the dev server at ${origin}`);
    log('[drill] Turnstile is unconfigured in that process only — never in a deployment');

    try {
      await waitFor(
        `the dev server on ${origin}`,
        async () => {
          if (state.server?.exitCode !== null) {
            throw new Error(
              `npm run dev exited with ${state.server?.exitCode}\n${lastLines(state.serverLog)}`
            );
          }
          return fetch(origin, { signal: AbortSignal.timeout(2_000) })
            .then(() => true)
            .catch(() => false);
        },
        { timeoutMs: 180_000, intervalMs: 2_000 }
      );
    } catch (error) {
      throw new DrillError(`${error.message}\n\n${lastLines(state.serverLog)}`);
    }
  }

  /** The app's pid, or an empty string when the process is gone. */
  function pidOf() {
    return adb(['shell', 'pidof', PACKAGE_ID], { allowFailure: true }).split(/\s+/)[0] || '';
  }

  function listDevices() {
    const output = spawnSync(adbPath, ['devices'], { encoding: 'utf8' }).stdout ?? '';
    return output
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length === 2 && parts[1] === 'device')
      .map((parts) => parts[0]);
  }

  async function ensureDevice() {
    const before = new Set(listDevices());

    if (options.device) {
      if (!listDevices().includes(options.device)) {
        throw new DrillError(
          `${options.device} is not connected ("adb devices" does not list it). Connect it, or\n` +
            'drop --device and let the drill boot the AVD.'
        );
      }
      state.device = options.device;
      log(`[drill] using the device ${state.device}`);
      return;
    }

    const existing = listDevices().find((serial) => serial.startsWith('emulator-'));
    if (existing) {
      state.device = existing;
      log(`[drill] using the emulator already running: ${existing}`);
      return;
    }

    const emulatorPath = sdkTool(sdkHome, 'emulator', 'emulator');
    if (!existsSync(emulatorPath)) {
      throw new DrillError(`The emulator is missing from ${sdkHome}.`);
    }

    log(`[drill] booting ${options.avd} headless (a cold boot takes a minute or two)`);
    state.emulator = spawn(
      emulatorPath,
      [
        '-avd',
        options.avd,
        '-no-window',
        '-no-audio',
        '-no-boot-anim',
        '-no-snapshot',
        '-gpu',
        'swiftshader_indirect',
      ],
      { stdio: 'ignore' }
    );
    state.bootOwned = true;

    state.device = await waitFor(
      'the emulator to appear in adb',
      async () => {
        const serial = listDevices().find((candidate) => !before.has(candidate));
        if (!serial) return null;
        const booted = spawnSync(
          adbPath,
          ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'],
          {
            encoding: 'utf8',
          }
        );
        return (booted.stdout ?? '').trim() === '1' ? serial : null;
      },
      { timeoutMs: 300_000, intervalMs: 3_000 }
    );
    log(`[drill] ${state.device} finished booting`);
  }

  async function ensureInstalled() {
    const config = existsSync(PACKAGED_CONFIG)
      ? JSON.parse(readFileSync(PACKAGED_CONFIG, 'utf8').replace(/^\uFEFF/, ''))
      : null;
    const packagedUrl = config?.server?.url;
    const matches = packagedUrl === origin;
    const fresh =
      matches && existsSync(APK) && statSync(APK).mtimeMs >= statSync(PACKAGED_CONFIG).mtimeMs;

    if (options.skipBuild) {
      if (!fresh) {
        throw new DrillError(
          `--skip-build needs an APK built after ${origin} was written into the packaged\n` +
            `config, and ${APK} is not that. Drop the flag and let the drill build it.`
        );
      }
    } else {
      log(`[drill] building the debug APK against ${origin}`);
      const result = npmSpawnSync('android:apk', {
        cwd: ROOT,
        // The shell is a remote-URL WebView: how it is built *is* where it points.
        // Reusing a production APK would drill the live site instead of this tree.
        env: { ...env, CAPACITOR_SERVER_URL: origin },
        stdio: 'inherit',
      });
      if (result.status !== 0) {
        throw new DrillError(`npm run android:apk failed (${result.status ?? result.error})`);
      }
    }

    if (!existsSync(APK)) throw new DrillError(`the debug APK is missing: ${APK}`);
    log('[drill] installing the debug APK');
    const installed = adb(['install', '-r', APK], { timeout: 180_000 });
    if (!/Success/i.test(installed)) throw new DrillError(`adb install said: ${installed}`);
  }

  async function openShell() {
    // A matrix case reattaches after the process its page belonged to is gone.
    try {
      state.page?.close();
    } catch {
      // The socket died with the process; closing it is best-effort.
    }
    state.page = null;

    adb(['shell', 'am', 'start', '-W', '-n', MAIN_ACTIVITY], { timeout: 60_000 });
    const pid = await waitFor('the shell process', () => pidOf() || null, {
      timeoutMs: 60_000,
      intervalMs: 1_000,
    });
    adb(['forward', '--remove', `tcp:${DEVTOOLS_PORT}`], { allowFailure: true });
    adb(['forward', `tcp:${DEVTOOLS_PORT}`, `localabstract:webview_devtools_remote_${pid}`]);
    state.forward = true;

    const target = await waitFor(
      'the shell WebView target',
      async () => {
        const list = await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/list`)
          .then((response) => response.json())
          .catch(() => []);
        // The worker's headless WebView shares this process (and so this
        // DevTools socket) while a drain runs, and its page is the drain page
        // on the same origin — attaching to it would sign in and queue in the
        // wrong WebView. Everything else on this origin is the app's own page:
        // a later matrix case reattaches with the shell on `/habitflow`, not `/`.
        return (
          list.find((entry) => {
            try {
              const url = new URL(entry.url);
              return (
                entry.type === 'page' &&
                url.origin === origin &&
                url.pathname !== '/sync-flush.html'
              );
            } catch {
              return false;
            }
          }) ?? null
        );
      },
      { timeoutMs: 120_000, intervalMs: 2_000 }
    );

    state.page = await connectDevTools(target.webSocketDebuggerUrl);

    // The target's `url` is where the WebView is *navigating to*; until the
    // document commits, evaluation runs in the initial `about:blank` context.
    // A relative fetch there has no base URL — `signIn` failed with "Failed to
    // parse URL from /auth/api/login" on a cold first load — and the user agent
    // measured from it says nothing about the site. Wait for the commit.
    const href = await waitFor(
      'the shell document to load',
      async () => {
        const value = await state.page.evaluate('location.href').catch(() => null);
        return typeof value === 'string' && value.startsWith(origin) ? value : null;
      },
      { timeoutMs: 180_000, intervalMs: 2_000 }
    );

    log(`[drill] attached to ${href}`);
    return state.page;
  }

  async function measureWebView(page) {
    const userAgent = await waitFor(
      'a user agent from the WebView',
      () => page.evaluate('navigator.userAgent'),
      {
        timeoutMs: 30_000,
        intervalMs: 1_000,
      }
    );
    const major = webViewMajor(userAgent);
    log(`[drill] WebView ${major ?? 'unknown'} (${userAgent})`);
    if (major === null || major < WEBVIEW_FLOOR) {
      throw new EnvironmentError(
        `The shell's WebView is ${major ?? 'unknown'}, below its floor of ${WEBVIEW_FLOOR}.\n` +
          'Capacitor therefore loads `unavailable.html` instead of the site: there is no React,\n' +
          'so there is nothing to sign in with and nothing to queue a write from.\n\n' +
          'The full drill needs one of these:\n' +
          '  - a real device (or an AVD whose System WebView is 111+): `--device <serial>`\n' +
          '  - the same drain in a browser: SYNC_FLUSH_E2E=1 npx playwright test e2e/sync-flush.spec.ts\n\n' +
          'What this image can still measure is the worker half; docs/mobile/android-shell.md\n' +
          '("The drain drill") records why, and what was measured here.'
      );
    }
  }

  async function signIn(page) {
    const expression = `(async () => {
      const response = await fetch('/auth/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: ${JSON.stringify(email)},
          password: ${JSON.stringify(password)},
          redirectTo: null,
          turnstileToken: ${JSON.stringify(TURNSTILE_TOKEN)}
        })
      });
      const body = await response.text();
      return JSON.stringify({ ok: response.ok, status: response.status, body: body.slice(0, 400) });
    })()`;

    // The first request to a route in a dev server the drill just started
    // compiles it (Turbopack): a cold `/auth/api/login` can outlast the 20s a
    // CDP command gets by default, and that timeout says "timed out", not
    // "refused" — which is a different diagnosis.
    const raw = await page.evaluate(expression, { timeoutMs: 180_000 });
    const result = JSON.parse(raw);
    if (!result.ok) {
      throw new DrillError(
        `the login was refused (${result.status}): ${result.body}\n\n` +
          'A 4xx here is usually Turnstile being configured on the server the drill is using.\n' +
          'The drill only unsets it on a dev server it starts itself; stop the one on this port.'
      );
    }
    log(`[drill] signed in as ${email}`);
  }

  /**
   * The page has to load while the network is still there: this is a remote-URL
   * shell, and a cold visit to HabitFlow with the radio already off would be an
   * offline navigation with no cache behind it. So the order is open, radio off,
   * write — the same order `e2e/spendtrack-offline.spec.ts` uses.
   */
  async function openHabitflow(page) {
    await page.evaluate("location.href = '/habitflow'");
    await waitFor(
      'the HabitFlow dashboard',
      async () =>
        Boolean(await page.evaluate("Boolean(document.querySelector('#btn-create-habit'))")),
      { timeoutMs: 120_000, intervalMs: 2_000 }
    );

    const before = Number(await page.evaluate(OUTBOX_COUNT_EXPRESSION));
    if (before < 0) throw new DrillError('this WebView has no indexedDB.databases()');
    log(`[drill] Outbox before the write: ${before} intent(s)`);
    if (before > 0) {
      log('[drill] the account already owed work; the drill compares before and after');
    }
    return before;
  }

  /**
   * The dialog is opened while the network is still there, and stays open until
   * the write. Its chunk and its React handlers have to arrive over the wire, and
   * a first click can land before hydration has attached them — so the click is
   * retried until the form exists rather than trusted once.
   */
  async function openAddHabitDialog(page) {
    await waitFor(
      'the add-habit dialog',
      async () => {
        await page.evaluate(
          "(() => { const button = document.querySelector('#btn-create-habit'); if (button) button.click(); })()"
        );
        return Boolean(
          await page.evaluate("Boolean(document.querySelector('#input-add-habit-name'))")
        );
      },
      { timeoutMs: 60_000, intervalMs: 1_000 }
    );
  }

  async function queueWrite(page, name, before) {
    // React tracks the input's value on the DOM node, so assigning `value`
    // directly is swallowed; the prototype setter plus an `input` event is what
    // a real keystroke looks like to the component.
    const filled = await page.evaluate(`(() => {
      const input = document.querySelector('#input-add-habit-name');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(name)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return input.value;
    })()`);
    if (filled !== name)
      throw new DrillError(`the habit name did not land in the input: ${filled}`);

    await page.evaluate("document.querySelector('#btn-submit-add-habit').click()");

    await waitFor(
      'the habit to render from the Local Store',
      async () =>
        Boolean(await page.evaluate(`document.body.innerText.includes(${JSON.stringify(name)})`)),
      { timeoutMs: 60_000, intervalMs: 1_000 }
    );

    const pending = await waitFor(
      'the write to reach the Outbox',
      async () => {
        const count = Number(await page.evaluate(OUTBOX_COUNT_EXPRESSION));
        return count > before ? count : 0;
      },
      { timeoutMs: 60_000, intervalMs: 1_000 }
    );
    log(`[drill] Outbox after the write: ${pending} intent(s) — "${name}" is queued`);
    return pending;
  }

  function setRadio(enabled) {
    const value = enabled ? 'enable' : 'disable';
    adb(['shell', 'svc', 'wifi', value], { allowFailure: true });
    adb(['shell', 'svc', 'data', value], { allowFailure: true });
    state.radioOff = !enabled;
  }

  /** Put back whatever a case (or a failure inside one) left changed. */
  async function restoreDevice() {
    if (state.radioOff && state.device) {
      log('[drill] restoring the radio');
      setRadio(true);
    }
    if (state.dozing && state.device) {
      log('[drill] releasing doze');
      adb(['shell', 'dumpsys', 'deviceidle', 'unforce'], { allowFailure: true });
      adb(['shell', 'dumpsys', 'battery', 'reset'], { allowFailure: true });
      state.dozing = false;
    }
  }

  /** `mState=IDLE` (or its maintenance window) once the device really is idle. */
  function deviceIdleState() {
    const dump = adb(['shell', 'dumpsys', 'deviceidle'], { allowFailure: true });
    return /mState=(IDLE|IDLE_MAINTENANCE)\b/.exec(dump)?.[0] ?? null;
  }

  /**
   * Force the device into doze. It has to be unplugged for the platform to accept
   * it, and an OEM that ignores `force-idle` is reported as an environment limit
   * rather than as a pass: the case exists to watch the deferral happen.
   */
  async function enterDoze() {
    adb(['shell', 'dumpsys', 'battery', 'unplug'], { allowFailure: true });
    state.dozing = true;
    await waitFor(
      'the device to enter doze',
      () => {
        adb(['shell', 'dumpsys', 'deviceidle', 'force-idle'], { allowFailure: true });
        return deviceIdleState();
      },
      { timeoutMs: 30_000, intervalMs: 2_000 }
    ).catch(() => {
      throw new EnvironmentError(
        'the device never reported mState=IDLE: this build/OEM ignores `dumpsys deviceidle force-idle`,\n' +
          'so the deferral cannot be observed here. Record that, and run this case on another phone.'
      );
    });
    return deviceIdleState();
  }

  async function releaseDoze() {
    adb(['shell', 'dumpsys', 'deviceidle', 'unforce'], { allowFailure: true });
    adb(['shell', 'dumpsys', 'battery', 'reset'], { allowFailure: true });
    state.dozing = false;
  }

  /** Background and force-stop: the one kill that cancels scheduled work. */
  async function forceStopApp() {
    adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
    await sleep(1_500);
    adb(['shell', 'am', 'force-stop', PACKAGE_ID]);
    await waitFor('the shell process to be gone after force-stop', () => pidOf() === '', {
      timeoutMs: 30_000,
      intervalMs: 1_000,
    });
    log('[drill] force-stopped: its WorkManager jobs are cancelled until the next launch');
  }

  /**
   * The first worker line inside `timeoutMs`, or null. Any line counts, not just a
   * clean drain: a case asserting "the job was deferred" is disproved by a retry
   * line as much as by a success line.
   */
  async function sawWorkerLineWithin(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const dump = adb(['logcat', '-d', '-s', `${DRILL_LOG_TAG}:I`], { allowFailure: true });
      const line = dump.split(/\r?\n/).find((entry) => entry.includes(DRILL_LOG_TAG));
      if (line) return line.trim();
      await sleep(2_000);
    }
    return null;
  }

  async function waitUntilOffline(page) {
    await waitFor(
      'navigator.onLine to go false after the radio was turned off',
      async () => (await page.evaluate('navigator.onLine')) === false,
      { timeoutMs: 45_000, intervalMs: 1_000 }
    );
  }

  async function killApp() {
    // Background it first: `am kill` only kills processes Android considers
    // killable, and a foreground activity is not one of them. The kill is retried
    // because the process has to reach the cached state first.
    adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
    await sleep(1_500);
    await waitFor(
      'the shell process to be gone',
      () => {
        adb(['shell', 'am', 'kill', PACKAGE_ID], { allowFailure: true });
        return pidOf() === '';
      },
      { timeoutMs: 30_000, intervalMs: 1_000 }
    );
    log('[drill] the app process is gone; its WorkManager job is not');
  }

  function jobschedulerState() {
    const dump = adb(['shell', 'dumpsys', 'jobscheduler'], { allowFailure: true });
    return dump
      .split(/\r?\n/)
      .filter((line) => line.includes(PACKAGE_ID))
      .slice(0, 20)
      .join('\n');
  }

  async function waitForDrain() {
    const seen = new Set();
    try {
      return await waitFor(
        `the worker's "${DRAIN_SUCCESS.source}" line`,
        async () => {
          const dump = adb(['logcat', '-d', '-s', `${DRILL_LOG_TAG}:I`], { allowFailure: true });
          for (const line of dump.split(/\r?\n/)) {
            if (!line.includes(DRILL_LOG_TAG) || seen.has(line)) continue;
            seen.add(line);
            log(`  logcat  ${line.trim()}`);
          }
          return dump.split(/\r?\n/).find((line) => isDrainSuccess(line)) ?? null;
        },
        { timeoutMs: options.timeoutMs, intervalMs: 3_000 }
      );
    } catch (error) {
      const jobs = jobschedulerState();
      throw new DrillError(
        `${error.message}\n\n` +
          `The worker never ran, or ran and did not report. WorkManager's only constraint is\n` +
          `NETWORK_CONNECTED, and this emulator never reaches the platform's VALIDATED state on a\n` +
          `flaky network: the jobs sit at "Unsatisfied constraints: CONNECTIVITY". That is\n` +
          `environmental, not a shell defect (docs/mobile/android-shell.md, "The drain drill").\n\n` +
          `jobscheduler for ${PACKAGE_ID}:\n${jobs || '  (no jobs found)'}\n\n` +
          `dev server log (last 40 lines):\n${
            state.server
              ? lastLines(state.serverLog) || '(the dev server printed nothing)'
              : '(not started by the drill)'
          }`
      );
    }
  }

  /** The drill reads server truth through a second session, on the host. */
  async function hostSession() {
    const login = await fetch(`${origin}/auth/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        redirectTo: null,
        turnstileToken: TURNSTILE_TOKEN,
      }),
    });
    if (!login.ok) throw new DrillError(`the host login failed with ${login.status}`);
    return login.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');
  }

  /** Every habit on the server with this exact name, without deleting it. */
  async function serverMatches(cookie, name) {
    const response = await fetch(`${origin}/habitflow/api/habits`, { headers: { cookie } });
    if (!response.ok) throw new DrillError(`GET /habitflow/api/habits said ${response.status}`);
    const body = await response.json();
    return (body.habits ?? []).filter((entry) => entry.name === name);
  }

  /** Best-effort cleanup: a drill leaves nothing on the shared test account. */
  async function deleteHabits(cookie, habits) {
    for (const habit of habits) {
      await fetch(`${origin}/habitflow/api/habits?id=${encodeURIComponent(habit.id)}`, {
        method: 'DELETE',
        headers: { cookie, 'content-type': 'application/json' },
        body: '{}',
      }).catch(() => undefined);
    }
  }

  /**
   * The delivered row, and the cleanup in the same call: a drill that leaves a
   * `Drill-…` habit on the shared test account would accumulate one per run. The
   * session is passed in because polling a login would spend the rate limit
   * (five attempts per email per minute) on the wait itself.
   */
  async function serverHabit(cookie, name) {
    const [habit] = await serverMatches(cookie, name);
    if (habit) await deleteHabits(cookie, [habit]);
    return habit ?? null;
  }

  /**
   * The write half every case starts from: the page is online so its chunk and
   * handlers arrive, the radio goes off, and one habit is saved into the Outbox.
   */
  async function queueOfflineWrite(page, label) {
    const before = await openHabitflow(page);
    await openAddHabitDialog(page);
    setRadio(false);
    await waitUntilOffline(page);
    const name = `Drill-${label}-${Date.now()}`;
    await queueWrite(page, name, before);
    return name;
  }

  /** A fresh page handle for the next case; a launch also flushes what is left. */
  async function reopen() {
    log('[drill] reopening the shell for the next case');
    const page = await openShell();
    await openHabitflow(page);
    return page;
  }

  /**
   * Force-stop is the documented limit: Android cancels the scheduled work and
   * blocks FCM until the next launch. The case watches that nothing arrives in
   * the window, then that the launch delivers — the last part is what turns
   * "expected" into observed.
   */
  async function caseForceStop(cookie) {
    const page = await reopen();
    const name = await queueOfflineWrite(page, 'force-stop');
    try {
      await forceStopApp();
      adb(['logcat', '-c'], { allowFailure: true });
      setRadio(true);

      const early = await sawWorkerLineWithin(FORCE_STOP_WINDOW_MS);
      const beforeLaunch = await serverMatches(cookie, name);
      if (early || beforeLaunch.length > 0) {
        throw new DrillError(
          `something drained before the launch: ${
            early ?? `${beforeLaunch.length} habit(s) on the server`
          }`
        );
      }

      log('[drill] launching after the force-stop: the queue should flush on open');
      const relaunched = await openShell();
      await openHabitflow(relaunched);
      const delivered = await waitFor(
        `"${name}" on the server after the launch`,
        () => serverMatches(cookie, name),
        { timeoutMs: options.timeoutMs, intervalMs: 2_000 }
      );
      if (delivered.length !== 1) {
        throw new DrillError(`${delivered.length} copies of "${name}" on the server, expected one`);
      }
      return `nothing for ${FORCE_STOP_WINDOW_MS / 1_000}s; the launch delivered exactly one`;
    } finally {
      await deleteHabits(cookie, await serverMatches(cookie, name).catch(() => []));
    }
  }

  /**
   * Doze defers the `CONNECTED` job by design, which is also why the 15-minute
   * floor exists: the wake and the page signal both stop working there. The case
   * proves the deferral (no worker line while idle) and the release, not a
   * wall-clock 15 minutes: that interval is a WorkManager constant, not something
   * a short run can measure honestly.
   */
  async function caseDoze(cookie) {
    const page = await reopen();
    const name = await queueOfflineWrite(page, 'doze');
    try {
      await killApp();
      adb(['logcat', '-c'], { allowFailure: true });

      const idle = await enterDoze();
      log(`[drill] device is idle (${idle}); restoring the radio with the job constrained`);
      setRadio(true);

      const early = await sawWorkerLineWithin(DOZE_WINDOW_MS);
      if (early) throw new DrillError(`the worker ran while the device was idle: ${early}`);

      await releaseDoze();
      const delivered = await waitFor(
        `"${name}" on the server after the release`,
        () => serverMatches(cookie, name),
        { timeoutMs: options.timeoutMs, intervalMs: 2_000 }
      );
      if (delivered.length !== 1) {
        throw new DrillError(
          `${delivered.length} copies of "${name}" on the server after the release, expected one`
        );
      }
      return `idle (${idle}), nothing for ${DOZE_WINDOW_MS / 1_000}s, the release delivered exactly one`;
    } finally {
      await deleteHabits(cookie, await serverMatches(cookie, name).catch(() => []));
    }
  }

  /**
   * The worker's flush is one HTTP replay from a page; killing the process in the
   * middle of it is the only way to see whether the retry duplicates a write. The
   * case does not need the kill to land before the POST: if it lands after, the
   * retry must still find exactly one habit, which is the same assertion.
   */
  async function caseMidFlush(cookie) {
    const page = await reopen();
    const name = await queueOfflineWrite(page, 'mid-flush');
    try {
      await killApp();
      adb(['logcat', '-c'], { allowFailure: true });
      setRadio(true);

      let pid;
      try {
        pid = await waitFor('the worker to start a process for the drain', () => pidOf() || null, {
          timeoutMs: 120_000,
          intervalMs: 500,
        });
      } catch {
        throw new EnvironmentError(
          'the drain never started within 120s, so there was no flush to interrupt. Check\n' +
            '`adb shell dumpsys jobscheduler` for the package: a CONNECTED constraint left\n' +
            'unsatisfied is the emulator limit, not this case.'
        );
      }

      const before = adb(['logcat', '-d', '-s', `${DRILL_LOG_TAG}:I`], { allowFailure: true });
      const already = before.split(/\r?\n/).find((line) => isDrainSuccess(line)) ?? null;

      // `run-as` is the app's uid, which may signal its own process; the debug
      // build the drill installs is what makes it available. The status is read
      // rather than inferred from the pid: a process that had already finished
      // and exited is not a SIGKILL, and must not be recorded as one.
      const status = adbStatus(['shell', 'run-as', PACKAGE_ID, 'kill', '-9', pid]);
      await sleep(1_000);
      if (status !== 0) {
        throw new EnvironmentError(
          pidOf() === pid
            ? `run-as could not signal pid ${pid} (exit ${status}): this build does not allow the kill.`
            : `pid ${pid} had already exited before the kill: the drain finished before it could be interrupted.`
        );
      }
      log(
        `[drill] killed pid ${pid} with SIGKILL${
          already ? ' after a drain line had already landed' : ''
        }`
      );

      const relaunched = await openShell();
      await openHabitflow(relaunched);
      const delivered = await waitFor(
        `"${name}" on the server after the interrupted flush`,
        () => serverMatches(cookie, name),
        { timeoutMs: options.timeoutMs, intervalMs: 2_000 }
      );
      if (delivered.length !== 1) {
        throw new DrillError(
          `${delivered.length} copies of "${name}" on the server after the retry, expected one`
        );
      }
      return `killed pid ${pid} mid-flush${
        already ? ' (a drain line had landed first)' : ''
      }; the retry delivered exactly one`;
    } finally {
      await deleteHabits(cookie, await serverMatches(cookie, name).catch(() => []));
    }
  }

  /** Each scripted case, its own write, and the table a reader can paste. */
  async function runMatrix(cookie) {
    const runners = {
      'force-stop': () => caseForceStop(cookie),
      doze: () => caseDoze(cookie),
      'mid-flush': () => caseMidFlush(cookie),
    };
    const results = [];

    for (const definition of MATRIX_CASES) {
      log(`\n[matrix] ${definition.title} — expected: ${definition.expected}`);
      let status = 'pass';
      let observation;
      try {
        observation = await runners[definition.id]();
      } catch (error) {
        // A case the device refuses is not a product failure; it is an unobserved
        // claim, and it must not read as a pass in the table.
        status = error instanceof EnvironmentError ? 'skipped' : 'fail';
        observation = error.message;
      } finally {
        await restoreDevice();
      }
      results.push({ ...definition, status, observation });
      log(`[matrix] ${status.toUpperCase()} ${definition.title}: ${observation}`);
    }

    log('\n[matrix] results — paste these rows into docs/mobile/android-shell.md:\n');
    log(formatMatrixTable(results));
    return results;
  }

  try {
    await ensureServer();
    await ensureDevice();

    adb(['reverse', `tcp:${options.port}`, `tcp:${options.port}`]);
    state.reverse = true;
    log(
      `[drill] adb reverse tcp:${options.port} — the CSP makes 10.0.2.2 unusable for our scripts`
    );

    await ensureInstalled();
    const page = await openShell();
    await measureWebView(page);

    await signIn(page);
    const name = await queueOfflineWrite(page, 'base');

    log('[drill] backgrounding and killing the app (am kill, not force-stop)');
    await killApp();

    // Clear before the radio returns: the drain can fire the moment the network
    // is back, and `logcat -c` after that would erase the line being waited for.
    adb(['logcat', '-c'], { allowFailure: true });

    log('[drill] restoring the radio and waiting for the worker');
    setRadio(true);
    await waitForDrain();

    const cookie = await hostSession();
    const habit = await waitFor(`"${name}" on the server`, async () => serverHabit(cookie, name), {
      timeoutMs: 60_000,
      intervalMs: 2_000,
    });
    log(`[drill] PASS — "${habit.name}" was queued offline and delivered by the worker`);

    // Keep the page handle for teardown only; the process it belonged to is gone.
    if (!options.matrix) return 0;

    const results = await runMatrix(cookie);
    if (results.some((result) => result.status === 'fail')) {
      throw new DrillError(
        'the matrix recorded a failing case; the observation is in the table above'
      );
    }
    return 0;
  } finally {
    await teardown();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`\n[drill] ${error.message}`);
      process.exitCode = error instanceof DrillError ? error.code : 1;
    });
}
