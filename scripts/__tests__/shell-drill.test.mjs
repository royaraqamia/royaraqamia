import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  isDrainSuccess,
  main,
  OUTBOX_COUNT_EXPRESSION,
  parseArgs,
  WEBVIEW_FLOOR,
  webViewMajor,
} from '../shell-drill.mjs';

/**
 * The drill is a device tool, so most of it cannot run in `npm test` — but the
 * decisions it makes are the ones that were rediscovered by hand each time, and
 * the constants it shares with the shell can drift silently. Both are pinned
 * here, and the parts of the file that would be wrong in a dangerous way (a
 * force-stop, a production origin, a configured Turnstile) are read as text.
 */

const source = readFileSync('scripts/shell-drill.mjs', 'utf8');
const capacitor = readFileSync('capacitor.config.ts', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const docs = readFileSync('docs/mobile/android-shell.md', 'utf8');

// The real API 30 image's UA, as `verify-bridge.mjs` prints it.
const API_30_UA =
  'Mozilla/5.0 (Linux; Android 11; sdk_gphone_x86 Build/RSR1.201013.001; wv) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Version/4.0 Chrome/83.0.4103.106 Mobile Safari/537.36';

describe('reading the options', () => {
  it('defaults to the AVD the drill was measured on, at the documented port', () => {
    expect(parseArgs([])).toMatchObject({
      avd: 'Pixel_API_30',
      device: null,
      port: 3000,
      keep: false,
      skipBuild: false,
      help: false,
    });
  });

  it('takes a device, a port and a timeout', () => {
    expect(
      parseArgs(['--device', 'emulator-5554', '--port', '3010', '--timeout', '60'])
    ).toMatchObject({ device: 'emulator-5554', port: 3010, timeoutMs: 60_000 });
  });

  it('refuses a value that is missing or not a port', () => {
    expect(() => parseArgs(['--port'])).toThrow(/needs a value/);
    expect(() => parseArgs(['--port', 'http'])).toThrow(/TCP port/);
    expect(() => parseArgs(['--nope'])).toThrow(/unknown option/);
  });
});

describe('deciding when the drill can run', () => {
  it('reads the WebView major out of a user agent', () => {
    expect(webViewMajor(API_30_UA)).toBe(83);
    expect(webViewMajor('… Chrome/120.0.6099.230 …')).toBe(120);
    expect(webViewMajor('node')).toBeNull();
  });

  it('uses the floor capacitor.config.ts gives the shell', () => {
    const declared = /minWebViewVersion:\s*(\d+)/.exec(capacitor)?.[1];
    expect(declared).toBeDefined();
    expect(WEBVIEW_FLOOR).toBe(Number(declared));
  });

  it('tells a clean report from the worker asking to come back', () => {
    expect(
      isDrainSuccess('08-20 12:00:00.000  1234  1250 I RoySyncFlush: drained (failed=0)')
    ).toBe(true);
    expect(
      isDrainSuccess(
        'I RoySyncFlush: queued another attempt: the page reported nothing (the drain page did not report within 60000ms)'
      )
    ).toBe(false);
    expect(isDrainSuccess('[sync-flush] {"pending":0,"failed":0,"error":null}')).toBe(false);
  });

  it('counts the Outbox the drain uses, without inventing a database name', () => {
    // The Local Store's name carries the account identity, so the drill asks the
    // origin for every database and looks for the store the drain reads.
    expect(OUTBOX_COUNT_EXPRESSION).toContain('indexedDB.databases()');
    expect(OUTBOX_COUNT_EXPRESSION).toContain("objectStoreNames.contains('outbox')");
  });

  it('keeps the dev server log in memory, not in a predictable temp file', () => {
    // CodeQL's `js/insecure-temporary-file` flags a fixed name under os.tmpdir();
    // the output is buffered and printed on failure instead.
    expect(source).not.toMatch(/\btmpdir\s*\(/);
    expect(source).not.toMatch(/\bopenSync\s*\(/);
    expect(source).toContain("stdio: ['ignore', 'pipe', 'pipe']");
  });

  it('prints usage without touching the SDK', async () => {
    const lines = [];
    const code = await main({ argv: ['--help'], env: {}, log: (line) => lines.push(line) });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('node scripts/shell-drill.mjs');
  });
});

describe('the constraints that cost a drill each when missed', () => {
  it('kills with am kill, never a force-stop that would cancel the work', () => {
    expect(source).toMatch(/'am',\s*'kill'/);
    // The prose above may name the wrong command; the invoked one must not be it.
    expect(source).not.toMatch(/'am',\s*'force-stop'/);
  });

  it('builds the shell against localhost and reaches it through adb reverse', () => {
    // The site's CSP upgrades subresources, so the emulator's host alias cannot
    // serve the app's own scripts; `localhost` is the exempt, trustworthy origin.
    expect(source).toContain('http://localhost:${options.port}');
    expect(source).toContain('CAPACITOR_SERVER_URL: origin');
    expect(source).toMatch(/'reverse',\s*`tcp:/);
  });

  it('unconfigures Turnstile in the dev server it starts, and only there', () => {
    expect(source).toContain("TURNSTILE_SECRET_KEY: ''");
    expect(source).toContain('never in a deployment');
  });
});

describe('staying wired to the shell it drills', () => {
  it('waits for the worker tag the Java class logs under', () => {
    const worker = readFileSync(
      'android/app/src/main/java/com/royaraqamia/app/SyncFlushWorker.java',
      'utf8'
    );
    expect(worker).toContain('LOG_TAG = "RoySyncFlush"');
    expect(source).toContain("DRILL_LOG_TAG = 'RoySyncFlush'");
  });

  it('launches the activity the manifest declares', () => {
    const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
    expect(manifest).toContain('android:name=".MainActivity"');
    expect(source).toContain('.MainActivity');
  });

  it('is the npm script the doc names, with .env for the credentials', () => {
    const script = packageJson.scripts['android:drill'];
    expect(script).toContain('scripts/shell-drill.mjs');
    expect(script).toContain('--env-file-if-exists=.env');
  });

  it('is where the doc says to look', () => {
    expect(docs).toContain('scripts/shell-drill.mjs');
    expect(docs).toContain('npm run android:drill');
    // The dead end the script stops on, and why.
    expect(docs).toContain('83.0.4103.106');
    expect(docs).toContain('`unavailable.html`');
  });
});
