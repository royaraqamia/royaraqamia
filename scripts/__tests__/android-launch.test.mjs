import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  BUDGET,
  LAUNCH_ACTIVITY,
  median,
  PACKAGE_ID,
  parseAmStart,
  parseArgs,
  startArgs,
  withinBudget,
} from '../android-launch.mjs';

/**
 * The launch drill is a device tool, so the measuring itself cannot run in
 * `npm test`. What can run is every decision it makes around the measurement —
 * and the constants it shares with the build, which would otherwise drift
 * silently: the application id, the launcher the platform starts, and the two
 * numbers the budget is written in.
 */

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const buildGradle = readFileSync('android/app/build.gradle', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const nativeApp = readFileSync('docs/mobile/native-app.md', 'utf8');

// `am start -W` on API 35, cold and warm, as the device printed them.
const COLD = [
  'Starting: Intent { cmp=com.royaraqamia.app/.shell.ShellActivity }',
  'Status: ok',
  'LaunchState: COLD',
  'Activity: com.royaraqamia.app/.shell.ShellActivity',
  'TotalTime: 412',
  'WaitTime: 431',
].join('\n');
const HOT = COLD.replace('LaunchState: COLD', 'LaunchState: HOT').replace(
  'TotalTime: 412',
  'TotalTime: 96'
);

describe('reading the options', () => {
  it('defaults to three runs on the default device, with the budget enforced', () => {
    expect(parseArgs([])).toEqual({ device: null, runs: 3, budget: true, help: false });
  });

  it('takes a device, a run count and the budget switch', () => {
    expect(parseArgs(['--device', 'emulator-5554', '--runs', '5', '--no-budget'])).toEqual({
      device: 'emulator-5554',
      runs: 5,
      budget: false,
      help: false,
    });
  });

  it('refuses a value that is missing, not a run count, or unknown', () => {
    expect(() => parseArgs(['--device'])).toThrow(/needs a value/);
    expect(() => parseArgs(['--runs', '0'])).toThrow(/1 to 20/);
    expect(() => parseArgs(['--runs', 'three'])).toThrow(/1 to 20/);
    expect(() => parseArgs(['--nope'])).toThrow(/unknown option/);
  });
});

describe('launching', () => {
  it('starts the launcher without a stop flag, because a stop inside the start raced', () => {
    // Android 13 answered `am start -S` with a WARM launch on a device that had
    // the process dead a moment earlier: the stop and the start do not wait for
    // each other. The cold path force-stops and waits instead.
    expect(startArgs()).toEqual([
      'shell',
      'am',
      'start',
      '-W',
      '-n',
      `${PACKAGE_ID}/${LAUNCH_ACTIVITY}`,
    ]);
  });

  it('force-stops and waits for the process to be gone before a cold run', () => {
    const source = readFileSync('scripts/android-launch.mjs', 'utf8');
    expect(source).toMatch(/function coldRun[\s\S]*?force-stop[\s\S]*?waitUntilDead/);
    expect(source).not.toContain("'-S'");
  });
});

describe('reading am start', () => {
  it('keeps the platform own state and the number the budget is written in', () => {
    expect(parseAmStart(COLD)).toEqual({ state: 'COLD', totalTime: 412, waitTime: 431 });
    expect(parseAmStart(HOT)).toEqual({ state: 'HOT', totalTime: 96, waitTime: 431 });
  });

  it('reports no time rather than a guess when the start did not happen', () => {
    const error = 'Error: Activity not started, unable to resolve Intent';
    expect(parseAmStart(error)).toEqual({ state: null, totalTime: null, waitTime: null });
  });
});

describe('summarising the runs', () => {
  it('takes the middle value, not the fastest', () => {
    expect(median([412, 380, 401])).toBe(401);
    expect(median([96, 120])).toBe(96);
    expect(median([])).toBeNull();
  });

  it('compares a median against the kind of start it belongs to', () => {
    expect(withinBudget('cold', BUDGET.cold)).toBe(true);
    expect(withinBudget('cold', BUDGET.cold + 1)).toBe(false);
    expect(withinBudget('warm', BUDGET.warm)).toBe(true);
    expect(withinBudget('warm', null)).toBe(false);
  });
});

describe('what the drill and the tree agree on', () => {
  it('measures this application id', () => {
    const declared = /applicationId\s+"([^"]+)"/.exec(buildGradle)?.[1];
    expect(declared).toBe(PACKAGE_ID);
  });

  it('starts the activity the manifest makes the launcher', () => {
    const launchers = [...manifest.matchAll(/<activity[\s\S]*?<\/activity>/g)]
      .map((match) => match[0])
      .filter((block) => block.includes('android.intent.category.LAUNCHER'));
    expect(launchers).toHaveLength(1);
    expect(launchers[0]).toContain(`android:name="${LAUNCH_ACTIVITY}"`);
  });

  it('uses the two numbers the budget is written in', () => {
    const cold = /Cold start[^|]*\|\s*(\d+) ms/.exec(nativeApp)?.[1];
    const warm = /Warm start[^|]*\|\s*(\d+) ms/.exec(nativeApp)?.[1];
    expect(Number(cold)).toBe(BUDGET.cold);
    expect(Number(warm)).toBe(BUDGET.warm);
  });

  it('is the script npm run android:launch runs', () => {
    expect(packageJson.scripts['android:launch']).toBe('node scripts/android-launch.mjs');
  });
});
