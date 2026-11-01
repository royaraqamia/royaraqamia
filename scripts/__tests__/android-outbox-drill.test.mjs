import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  BUDGET_MS,
  DEFAULT_SETTLE_MS,
  DRILL_ACTIVITY,
  EXTRA,
  TAG,
  parseArgs,
  parseCleaned,
  parseDrained,
  parseQueued,
  parseVerified,
  verdict,
} from '../android-outbox-drill.mjs';

/**
 * The Outbox drill is a device tool, so the run itself cannot happen in
 * `npm test`. What can: every decision it makes around the run, and the
 * constants it shares with the Kotlin activity it drives and the doc the budget
 * is written in — all of which would otherwise drift silently.
 */

const activity = readFileSync(
  'android/app/src/debug/kotlin/com/royaraqamia/app/debug/OutboxDrillActivity.kt',
  'utf8'
);
const debugManifest = readFileSync('android/app/src/debug/AndroidManifest.xml', 'utf8');
const mainManifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const nativeApp = readFileSync('docs/mobile/native-app.md', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

describe('reading the options', () => {
  it('builds by default, with the budget enforced', () => {
    expect(parseArgs([])).toEqual({
      device: null,
      build: true,
      apk: null,
      budget: true,
      settleMs: DEFAULT_SETTLE_MS,
      name: null,
      help: false,
    });
  });

  it('takes a device, an apk, a settle window and the budget switch', () => {
    expect(
      parseArgs(['--device', 'emulator-5554', '--apk', 'a.apk', '--settle', '3000', '--no-budget'])
    ).toEqual({
      device: 'emulator-5554',
      build: false,
      apk: 'a.apk',
      budget: false,
      settleMs: 3000,
      name: null,
      help: false,
    });
  });

  it('refuses a missing value, an unknown option and an impossible settle', () => {
    expect(() => parseArgs(['--device'])).toThrow(/needs a value/);
    expect(() => parseArgs(['--settle', '20000'])).toThrow(/0 to 15000/);
    expect(() => parseArgs(['--nope'])).toThrow(/unknown option/);
  });
});

describe('reading the activity', () => {
  it('reads the queued line', () => {
    expect(
      parseQueued(
        'I/RoyOutbox: queued 018f5c8e-7a2b-4c3d-9e4f-5a6b7c8d9e0f pending=1 identity=user:abc'
      )
    ).toEqual({ id: '018f5c8e-7a2b-4c3d-9e4f-5a6b7c8d9e0f', pending: 1, identity: 'user:abc' });
    expect(parseQueued('unrelated')).toBeNull();
  });

  it('reads the drain line', () => {
    expect(parseDrained('I/RoyOutbox: drained signed-in=true pending=0 failed=0')).toEqual({
      signedIn: true,
      pending: 0,
      failed: 0,
    });
    expect(parseDrained('I/RoyOutbox: drained signed-in=false pending=1 failed=0')).toEqual({
      signedIn: false,
      pending: 1,
      failed: 0,
    });
  });

  it('reads the read-back line', () => {
    expect(parseVerified('I/RoyOutbox: verified abc present=true')).toEqual({
      id: 'abc',
      present: true,
    });
  });

  it('reads the cleanup line', () => {
    expect(parseCleaned('I/RoyOutbox: cleaned abc pending=0 failed=0')).toEqual({
      id: 'abc',
      pending: 0,
      failed: 0,
    });
  });
});

describe('the verdict', () => {
  const queued = { id: 'abc', pending: 1, identity: 'user:someone' };
  const drained = { signedIn: true, pending: 0, failed: 0 };
  const verified = { id: 'abc', present: true };

  it('passes a write that drained inside the budget', () => {
    expect(verdict({ queued, drained, verified, elapsedMs: 1234 }).ok).toBe(true);
  });

  it('fails a drain over the budget, unless the budget is off', () => {
    expect(verdict({ queued, drained, verified, elapsedMs: BUDGET_MS + 1 }).ok).toBe(false);
    expect(verdict({ queued, drained, verified, elapsedMs: BUDGET_MS + 1, budget: false }).ok).toBe(
      true
    );
  });

  it('fails a row that never reached the server', () => {
    const result = verdict({
      queued,
      drained: { ...drained, pending: 1 },
      verified: { id: 'abc', present: false },
      elapsedMs: 100,
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toContain('1 write(s) still queued');
    expect(result.problems).toContain('the row is not on the server');
  });

  it('fails a write queued under a guest, and a session that did not survive', () => {
    const result = verdict({
      queued: { ...queued, identity: 'guest' },
      drained: { ...drained, signedIn: false },
      verified,
      elapsedMs: 100,
    });
    expect(result.problems.some((problem) => problem.includes('not an account'))).toBe(true);
    expect(result.problems).toContain('the session did not survive the kill');
  });

  it('fails a read-back of a different row', () => {
    expect(
      verdict({ queued, drained, verified: { id: 'other', present: true }, elapsedMs: 100 })
        .problems
    ).toContain('read back other, queued abc');
  });
});

describe('the constants the device and the docs share', () => {
  it('is the tag the activity prints under', () => {
    expect(activity).toContain(`const val TAG = "${TAG}"`);
  });

  it('names the extras the activity reads', () => {
    for (const [constant, value] of Object.entries(EXTRA)) {
      expect(activity, constant).toContain(`"${value}"`);
    }
  });

  it('drives an activity that exists in the debug build only', () => {
    const name = DRILL_ACTIVITY.split('/').pop();
    expect(debugManifest).toContain(`${name}"`);
    // A shipped APK must not carry a way to seed a write.
    expect(mainManifest).not.toContain(name);
  });

  it('is the budget the native plan states', () => {
    expect(nativeApp).toContain('Offline write');
    expect(nativeApp).toMatch(/5 s after the radio returns/);
  });

  it('is a package script', () => {
    expect(packageJson.scripts['android:outbox-drill']).toContain('android-outbox-drill.mjs');
  });
});
