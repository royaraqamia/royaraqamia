import { describe, expect, it } from 'vitest';

import { MODE_CRASH, parseArgs, readShellVersion, verdict } from '../android-crash-drill.mjs';

const VERSION_FILE = 'shellVersionName=1.0.21\nshellVersionCode=20021\n';

function crashBody(overrides = {}) {
  return JSON.stringify({
    version: 1,
    kind: 'crash',
    reason: 'uncaught',
    signature: 'java.lang.IllegalStateException',
    shell: { name: '1.0.21', code: 20021 },
    contracts: '05eb4c086b1b',
    frames: ['com.royaraqamia.app.debug.CrashDrillActivity.onCreate(CrashDrillActivity.kt:38)'],
    ...overrides,
  });
}

describe('android-crash-drill', () => {
  it('parses the flags a drill run needs', () => {
    expect(parseArgs([])).toEqual({ device: null, build: true, apk: null, help: false });
    expect(parseArgs(['--device', 'emulator-5554', '--no-build'])).toEqual({
      device: 'emulator-5554',
      build: false,
      apk: null,
      help: false,
    });
    expect(parseArgs(['--apk', 'out/app-debug.apk']).build).toBe(false);
    expect(parseArgs(['--help']).help).toBe(true);
    expect(() => parseArgs(['--device'])).toThrow('--device needs a value');
    expect(() => parseArgs(['--purple'])).toThrow('unknown argument: --purple');
  });

  it('reads the release the APK was built with', () => {
    expect(readShellVersion(VERSION_FILE)).toEqual({ name: '1.0.21', code: 20021 });
    expect(() => readShellVersion('nothing here')).toThrow('names no shell version');
  });

  it('accepts a report that names the installed release and a contract generation', () => {
    const result = verdict([{ file: '1-crash.json', body: crashBody() }], {
      name: '1.0.21',
      code: 20021,
    });

    expect(result).toEqual({ ok: true, problems: [] });
  });

  it('refuses an empty queue, the wrong release, and a report with no generation', () => {
    const expected = { name: '1.0.21', code: 20021 };

    expect(verdict([], expected).ok).toBe(false);
    expect(
      verdict(
        [{ file: 'a.json', body: crashBody({ shell: { name: '1.0.20', code: 20020 } }) }],
        expected
      ).problems
    ).toEqual(['a.json names 1.0.20+20020, the build is 1.0.21+20021']);
    expect(
      verdict([{ file: 'b.json', body: crashBody({ contracts: 'HEAD' }) }], expected).problems
    ).toEqual(['b.json names no contract generation']);
    expect(verdict([{ file: 'c.json', body: 'not json' }], expected).problems).toEqual([
      'c.json is not JSON',
    ]);
  });

  it('refuses a report that is not the crash it asked for', () => {
    const result = verdict(
      [{ file: 'drain.json', body: crashBody({ kind: 'drain', reason: 'refused', pending: 1 }) }],
      { name: '1.0.21', code: 20021 }
    );

    expect(result.problems[0]).toBe('drain.json is drain/refused, not an uncaught crash');
  });

  it('names a mode the debug activity knows', () => {
    expect(MODE_CRASH).toBe('crash');
  });
});
