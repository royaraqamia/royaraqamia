#!/usr/bin/env node
/**
 * Walks issue #500's veto table on an attached device and writes the evidence.
 *
 * The table is behavioural — does the back gesture come home, does a deep link
 * land on the bundled route, does the OAuth return reach the app — and every one
 * of those is observable without eyes: the spike build leaves the WebView
 * inspectable (`webContentsDebuggingEnabled`), so the current document *and the
 * panel's buttons* are one `adb forward` away. The buttons are pressed over the
 * DevTools protocol (`Runtime.evaluate`), because `uiautomator` cannot see inside
 * a WebView and `adb shell am start` on a remote URL is a different path that
 * answers a different question.
 *
 * It does NOT decide the rows: it records where the app actually went after each
 * action, with a screenshot, so the device session is one command and the result
 * in the issue is a paste rather than a recollection. Scroll position, whether a
 * tab dismissed where it should, and the feel of the back gesture still need a
 * human — which is why the table says "paste the result", not "run the script".
 *
 * Usage:
 *   node scripts/verify-two-origin.mjs               # against the installed spike APK
 *   node scripts/verify-two-origin.mjs --serial <s>  # a specific device
 *
 * Prerequisites: the spike APK installed (`npm run spike:apk`) and one device
 * attached with `adb` on PATH. Evidence lands in `spike-evidence/` (git-ignored).
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'spike-evidence');
const PACKAGE = 'com.royaraqamia.app';
const DEVTOOLS_PORT = 9222;
const REMOTE = 'https://royaraqamia.com';
const BUNDLED = 'https://localhost';

const serialFlag = process.argv.indexOf('--serial');
const SERIAL = serialFlag > -1 ? process.argv[serialFlag + 1] : undefined;

function adb(...args) {
  const result = spawnSync('adb', SERIAL ? ['-s', SERIAL, ...args] : args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
}

const steps = [];

function record(row, action, detail) {
  steps.push({ row, action, ...detail });
  process.stdout.write(`${row}: ${action}\n  ${JSON.stringify(detail)}\n`);
}

function saveScreenshot(name) {
  const args = SERIAL
    ? ['-s', SERIAL, 'exec-out', 'screencap', '-p']
    : ['exec-out', 'screencap', '-p'];
  const result = spawnSync('adb', args);
  if (result.stdout) writeFileSync(join(OUT, `${name}.png`), result.stdout);
}

/** The app's inspectable page: its document URL and the socket to evaluate on. */
async function findPage() {
  const pid = adb('shell', 'pidof', PACKAGE).trim();
  if (!pid) return { pid: null, url: null, socket: null };

  adb('forward', `tcp:${DEVTOOLS_PORT}`, `localabstract:webview_devtools_remote_${pid}`);

  try {
    const response = await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/list`, {
      signal: AbortSignal.timeout(4000),
    });
    const pages = await response.json();
    const page = pages.find((entry) => entry.type === 'page');
    return { pid, url: page?.url ?? null, socket: page?.webSocketDebuggerUrl ?? null };
  } catch (error) {
    return { pid, url: null, socket: null, error: error.message };
  }
}

/** One `Runtime.evaluate` on the page; a fresh socket per call survives navigations. */
function evaluateOn(socket, expression, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(socket);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('DevTools evaluate timed out'));
    }, timeoutMs);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true },
        })
      );
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error('DevTools socket error'));
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (message.error) reject(new Error(message.error.message));
      else if (message.result?.exceptionDetails) {
        reject(new Error(message.result.exceptionDetails.text ?? 'evaluate threw'));
      } else resolve(message.result?.result?.value);
    };
  });
}

async function waitForUrl(predicate, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let page = await findPage();
  while (Date.now() < deadline) {
    if (page.url && predicate(page.url)) return page;
    await new Promise((done) => setTimeout(done, 500));
    page = await findPage();
  }
  return page;
}

/** Press a panel button by its accessible name, scrolling it into view first. */
async function pressPanel(label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const page = await findPage();
    if (page.socket) {
      const pressed = await evaluateOn(
        page.socket,
        `(() => {
          const wanted = ${JSON.stringify(label)};
          const button = [...document.querySelectorAll('button')].find((element) =>
            (element.textContent ?? '').includes(wanted)
          );
          if (!button) return false;
          button.scrollIntoView({ block: 'center' });
          button.click();
          return true;
        })()`
      ).catch(() => false);

      if (pressed) return true;
    }
    // The document can be up before React has mounted the panel; retry.
    await new Promise((done) => setTimeout(done, 1000));
  }
  return false;
}

/** Wait until the bundled React tree has mounted (the panel is the marker). */
async function waitForPanel(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const page = await findPage();
    if (page.socket) {
      const ready = await evaluateOn(
        page.socket,
        `Boolean(document.querySelector('[data-spike-panel]'))`
      ).catch(() => false);
      if (ready) return page;
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  return null;
}

mkdirSync(OUT, { recursive: true });

const devices = adb('devices').split('\n').slice(1).filter(Boolean);
if (devices.length === 0) {
  process.stderr.write('No device attached. `adb devices` is empty.\n');
  process.exit(1);
}

if (!adb('shell', 'pm', 'list', 'packages', PACKAGE).includes(PACKAGE)) {
  process.stderr.write(`${PACKAGE} is not installed. Run \`npm run spike:apk\` and install it.\n`);
  process.exit(1);
}

const versionLine = adb('shell', 'dumpsys', 'package', PACKAGE)
  .split('\n')
  .find((line) => line.includes('versionCode'))
  ?.trim();

record('setup', 'attached device', {
  devices: devices.join(' | '),
  sdk: adb('shell', 'getprop', 'ro.build.version.sdk'),
  model: adb('shell', 'getprop', 'ro.product.model'),
  version: versionLine ?? null,
});

// 1. Cold launch: the bundled document, not the site.
adb('shell', 'am', 'force-stop', PACKAGE);
const coldStart = Date.now();
adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
const launched = await waitForPanel();
const coldMs = Date.now() - coldStart;
record('local launch', 'cold launch → panel mounted', {
  url: launched?.url ?? (await findPage()).url,
  bundled: launched?.url?.startsWith(BUNDLED) ?? false,
  msToPanel: coldMs,
});
saveScreenshot('01-bundled-launch');

// 2. The panel's own crossing, same WebView (the default mechanism), then back.
const openedWebView = await pressPanel('فتح /community');
const crossed = await waitForUrl((url) => url.startsWith(REMOTE));
record('local → remote (same WebView)', 'panel → فتح /community', {
  tapped: openedWebView,
  url: crossed.url,
  reachedRemote: crossed.url?.startsWith(REMOTE) ?? false,
});
saveScreenshot('02-community-webview');

adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
const back = await waitForUrl((url) => url.startsWith(BUNDLED), 15000);
record('remote → local (back gesture)', 'KEYCODE_BACK', {
  url: back.url,
  backHome: back.url?.startsWith(BUNDLED) ?? false,
  appAlive: Boolean(adb('shell', 'pidof', PACKAGE).trim()),
});
saveScreenshot('03-back-to-bundled');

// 3. The panel's other mechanism, verified as the activity Android ran. A fresh
//    process first: the WebView restores the last document across an activity
//    restart, and a restored remote document has no panel to press.
adb('shell', 'am', 'force-stop', PACKAGE);
adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
const restarted = await waitForPanel();
record('restart', 'force-stop + launch', { url: restarted?.url ?? null });

const switched = await pressPanel('Custom Tab');
// `handleMechanism` persists the choice before it re-renders, so the next press
// must wait for that round trip or it opens with the previous mechanism.
await new Promise((done) => setTimeout(done, 1500));
const openedTab = await pressPanel('فتح /community');
await new Promise((done) => setTimeout(done, 4000));
const activities = adb('shell', 'dumpsys', 'activity', 'activities');
const tabPage = await findPage();
record('local → remote (Custom Tab)', 'panel → Custom Tab → فتح /community', {
  switchedMechanism: switched,
  opened: openedTab,
  customTabActivity: /customtab/i.test(activities),
  webViewUrlWhileTabOpen: tabPage.url,
});
saveScreenshot('04-custom-tab');

adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
await new Promise((done) => setTimeout(done, 2000));
const afterTabBack = await findPage();
record('remote → local (Custom Tab dismissed)', 'KEYCODE_BACK', {
  url: afterTabBack.url,
  backOnBundledRoute: afterTabBack.url?.startsWith(BUNDLED) ?? false,
});
saveScreenshot('05-tab-dismissed');

// 4. Deep links, through the intent filter (autoVerify plus the manifest's shapes).
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `${REMOTE}/habitflow`);
const deepLocal = await waitForUrl((url) => url.startsWith(BUNDLED) || url.startsWith(REMOTE));
record('deep link → local route', `${REMOTE}/habitflow`, {
  url: deepLocal.url,
  landedBundled: deepLocal.url?.startsWith(BUNDLED) ?? false,
});
saveScreenshot('06-deep-link-local');

adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `${REMOTE}/community`);
const deepRemote = await waitForUrl((url) => url.startsWith(REMOTE));
record('deep link → remote route', `${REMOTE}/community`, {
  url: deepRemote.url,
  reachedRemote: deepRemote.url?.startsWith(REMOTE) ?? false,
});
saveScreenshot('07-deep-link-remote');

// 5. The OAuth return trip: the scheme the manifest declares, not the issue's.
adb(
  'shell',
  'am',
  'start',
  '-a',
  'android.intent.action.VIEW',
  '-d',
  'royar://auth/callback?code=spike'
);
const oauth = await waitForUrl((url) => url.includes('/auth/callback'), 25000);
record('OAuth return', 'royar://auth/callback?code=spike', {
  url: oauth.url,
  reachedApp: Boolean(adb('shell', 'pidof', PACKAGE).trim()),
  mappedOntoHttpsCallback: oauth.url?.includes('/auth/callback') ?? false,
});
saveScreenshot('08-oauth-return');

const report = { generatedAt: new Date().toISOString(), remote: REMOTE, steps };
writeFileSync(join(OUT, 'veto-table.json'), `${JSON.stringify(report, null, 2)}\n`);

process.stdout.write(
  `\nEvidence written to ${OUT}\\ (veto-table.json + screenshots).\n` +
    'The rows still need a human to judge them; this records where the app actually went.\n'
);
