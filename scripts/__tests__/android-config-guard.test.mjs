import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { assertWebViewDebuggingOff, webViewDebuggingEnabled } from '../android-config-guard.mjs';

const REPO = process.cwd();
const scripts = JSON.parse(readFileSync(resolve(REPO, 'package.json'), 'utf8')).scripts;

function generated(config, { bom = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'android-config-'));
  const path = join(dir, 'capacitor.config.json');
  const text = typeof config === 'string' ? config : JSON.stringify(config);
  writeFileSync(path, `${bom ? '\uFEFF' : ''}${text}`);
  return path;
}

describe('reading the generated Capacitor config', () => {
  it('calls an explicit true enabled', () => {
    expect(webViewDebuggingEnabled({ android: { webContentsDebuggingEnabled: true } })).toBe(true);
  });

  it('calls false off', () => {
    expect(webViewDebuggingEnabled({ android: { webContentsDebuggingEnabled: false } })).toBe(
      false
    );
  });

  it('treats no setting as off, because that is Capacitor default', () => {
    expect(webViewDebuggingEnabled({ android: {} })).toBe(false);
    expect(webViewDebuggingEnabled({})).toBe(false);
    expect(webViewDebuggingEnabled(null)).toBe(false);
  });

  it('refuses a value it cannot read as off, rather than guessing it is safe', () => {
    expect(webViewDebuggingEnabled({ android: { webContentsDebuggingEnabled: 'true' } })).toBe(
      true
    );
    expect(webViewDebuggingEnabled({ android: { webContentsDebuggingEnabled: 1 } })).toBe(true);
  });
});

describe('refusing a release build whose WebView is inspectable', () => {
  it('approves a config with debugging off and returns it', () => {
    const path = generated({ android: { webContentsDebuggingEnabled: false } });
    expect(assertWebViewDebuggingOff({ path })).toEqual({
      android: { webContentsDebuggingEnabled: false },
    });
  });

  it('tolerates the BOM Capacitor or an editor may leave in front', () => {
    const path = generated({ android: { webContentsDebuggingEnabled: false } }, { bom: true });
    expect(() => assertWebViewDebuggingOff({ path })).not.toThrow();
  });

  it('refuses a config that enables debugging, and names the file and the setting', () => {
    const path = generated({ android: { webContentsDebuggingEnabled: true } });
    expect(() => assertWebViewDebuggingOff({ path })).toThrow(/webContentsDebuggingEnabled/);
    expect(() => assertWebViewDebuggingOff({ path })).toThrow(/chrome:\/\/inspect/);
    expect(() => assertWebViewDebuggingOff({ path })).toThrow(path);
  });

  it('refuses a missing config instead of assuming the sync ran', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'android-config-')), 'capacitor.config.json');
    expect(() => assertWebViewDebuggingOff({ path })).toThrow(/android:sync/);
  });

  it('refuses a config it cannot parse', () => {
    const path = generated('{ not json');
    expect(() => assertWebViewDebuggingOff({ path })).toThrow(/not readable JSON/);
  });
});

describe('the release paths sync with production', () => {
  it.each(['android:release', 'android:aab', 'android:publish'])(
    '%s forces NODE_ENV=production',
    (name) => {
      expect(scripts[name]).toMatch(/cross-env NODE_ENV=production/);
    }
  );

  it('leaves the debug build alone, so chrome://inspect still works there', () => {
    expect(scripts['android:apk']).not.toMatch(/NODE_ENV/);
  });
});
