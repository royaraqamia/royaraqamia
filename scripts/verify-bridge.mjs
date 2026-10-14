#!/usr/bin/env node
/**
 * Checks, on a connected device, whether Capacitor actually injected its native
 * bridge into the live site. See docs/mobile/android-shell.md.
 *
 * This exists because the shell loads a *remote* document, and Capacitor only
 * registers the injected script for the configured app URL — and only when the
 * device's Android WebView is new enough to support injected document-start
 * scripts. On a device with an older WebView the site still renders but every
 * plugin call silently falls back to web behaviour, which is invisible until
 * something native is expected to work. Prints the WebView version with the
 * verdict so a "web" answer on an old WebView is not mistaken for a code bug.
 *
 * Usage: node scripts/verify-bridge.mjs [packageId]
 *        node scripts/verify-bridge.mjs --eval "<javascript>"   # inspect the running shell
 * Requires: a running app on a connected device/emulator, adb on ANDROID_HOME.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const args = process.argv.slice(2);
const evalIndex = args.indexOf('--eval');
const expression = evalIndex >= 0 ? args[evalIndex + 1] : null;
if (evalIndex >= 0 && !expression) {
  console.error('--eval needs an expression, e.g. --eval "document.title"');
  process.exit(1);
}
const PACKAGE_ID =
  args.find((arg, index) => !arg.startsWith('--') && index !== evalIndex + 1) ??
  'com.royaraqamia.app';
const DEVTOOLS_PORT = 9222;
const EXPECTED_ORIGIN = 'royaraqamia.com';

/**
 * Matches the DevTools target whose *host* is the expected origin or a subdomain of it.
 * Testing the raw URL as a string would also match an origin parked somewhere else in it
 * (`https://evil.example/?u=royaraqamia.com`), which would report on the wrong target.
 */
function isExpectedOrigin(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      (protocol === 'https:' || protocol === 'http:') &&
      (hostname === EXPECTED_ORIGIN || hostname.endsWith(`.${EXPECTED_ORIGIN}`))
    );
  } catch {
    return false;
  }
}

/**
 * Device-supplied text (target URLs, user agent, evaluated values) goes into the log
 * verbatim otherwise, and a value carrying a newline forges extra lines — the output here
 * is read by a human deciding whether the bridge is live. Collapse control characters so
 * one fact stays one line.
 */
function oneLine(value) {
  return (
    String(value)
      // Newlines, including the exotic ones, are what forges a log line.
      .replace(/[\r\n\u0085\u2028\u2029]+/g, ' ')
      // Remaining control characters (ANSI escapes and friends) have no place in a log line.
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
  );
}

const sdkHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
if (!sdkHome) {
  console.error('ANDROID_HOME (or ANDROID_SDK_ROOT) must point at the Android SDK.');
  process.exit(1);
}

const adb = join(sdkHome, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');

function adbCommand(args, { allowFailure = false } = {}) {
  const result = spawnSync(adb, args, { encoding: 'utf8' });
  if (result.status !== 0 && !allowFailure) {
    console.error(`adb ${args.join(' ')} failed: ${result.stderr?.trim() ?? result.error}`);
    process.exit(1);
  }
  return (result.stdout ?? '').trim();
}

const pid = adbCommand(['shell', 'pidof', PACKAGE_ID], { allowFailure: true });
if (!pid) {
  console.error(`${PACKAGE_ID} is not running. Launch it, then re-run.`);
  process.exit(1);
}

const socket = `webview_devtools_remote_${pid.split(/\s+/)[0]}`;
adbCommand(['forward', `tcp:${DEVTOOLS_PORT}`, `localabstract:${socket}`]);

async function withTarget() {
  const list = await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/list`).then((r) => r.json());
  const page = list.find((entry) => isExpectedOrigin(entry.url));
  if (!page) {
    console.error(
      `No WebView target on ${EXPECTED_ORIGIN}. Open the app to the site, then re-run.`
    );
    console.error(`Targets: ${list.map((e) => oneLine(e.url)).join(', ') || 'none'}`);
    process.exit(1);
  }
  return page;
}

function evaluate(page, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('DevTools evaluation timed out'));
    }, 10_000);

    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true },
        })
      );
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      resolve(message.result?.result?.value);
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('DevTools socket error'));
    });
  });
}

try {
  const page = await withTarget();

  // `--eval` inspects the running shell directly — the only practical way to ask
  // a WebView a question. Same plumbing, so it is not a second tool.
  if (expression) {
    const value = await evaluate(page, expression);
    console.log(oneLine(typeof value === 'string' ? value : JSON.stringify(value)));
  } else {
    const report = await evaluate(
      page,
      `JSON.stringify({
       native: window.Capacitor ? window.Capacitor.isNativePlatform() : false,
       platform: window.Capacitor ? window.Capacitor.getPlatform() : 'no-bridge',
       hasPlugins: Boolean(window.Capacitor && window.Capacitor.Plugins),
       ua: navigator.userAgent
     })`
    );

    const parsed = JSON.parse(report);
    const webViewVersion = /Chrome\/([\d.]+)/.exec(parsed.ua)?.[1] ?? 'unknown';
    console.log(`WebView:  ${oneLine(webViewVersion)}`);
    console.log(`Origin:   ${oneLine(page.url)}`);
    console.log(`Bridge:   ${parsed.native ? 'injected' : 'MISSING'}`);
    console.log(`Platform: ${oneLine(parsed.platform)}`);

    if (!parsed.native) {
      console.error(
        '\nThe native bridge is not injected, so Capacitor plugin calls fall back to the web' +
          '\nimplementation. Two causes are known:' +
          '\n  1. The document is on another origin. Both injection paths are scoped to the' +
          '\n     configured app URL (capacitor.config.ts server.url); another origin is proxied' +
          '\n     and never sees the bridge (see ionic-team/capacitor#7454).' +
          '\n  2. The document answered with a non-2xx status. On WebViews older than 86 the' +
          '\n     bridge only arrives because Capacitor injects it into the HTML it proxies, and' +
          '\n     that proxy reads the body with HttpURLConnection.getInputStream(), which throws' +
          '\n     on a 4xx/5xx. A 404 page therefore has no bridge on an old device.'
      );
      process.exitCode = 1;
    }
  }
} finally {
  adbCommand(['forward', '--remove', `tcp:${DEVTOOLS_PORT}`], { allowFailure: true });
}
