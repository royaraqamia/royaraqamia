import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  activityState,
  answeredWithoutLaunch,
  BUDGET,
  LAUNCH_ACTIVITY,
  median,
  PACKAGE_ID,
  parseAmStart,
  parseArgs,
  startArgs,
  WARM_ATTEMPTS,
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

describe('reading the activity record', () => {
  // `dumpsys activity activities` on API 35, trimmed to the two records that
  // matter: the app's, and the launcher's behind it.
  const DUMP = [
    '  * Task{6ee242e #20 type=standard A=10209:com.royaraqamia.app U=0 visible=true}',
    '    * Hist  #0: ActivityRecord{ce026a9 u0 com.royaraqamia.app/.shell.ShellActivity t20}',
    '      packageName=com.royaraqamia.app processName=com.royaraqamia.app',
    '      state=RESUMED delayedResume=false finishing=false',
    '  * Task{8f1c0a4 #6 type=home A=1000:com.google.android.apps.nexuslauncher U=0}',
    '    * Hist  #0: ActivityRecord{686136d u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t6}',
    '      packageName=com.google.android.apps.nexuslauncher processName=com.google.android.apps.nexuslauncher',
    '      state=STOPPED delayedResume=false finishing=false',
  ].join('\n');

  it('finds the state the platform reports for the activity it is asked about', () => {
    expect(activityState(DUMP, `${PACKAGE_ID}/${LAUNCH_ACTIVITY}`)).toBe('RESUMED');
    expect(
      activityState(DUMP, 'com.google.android.apps.nexuslauncher/.NexusLauncherActivity')
    ).toBe('STOPPED');
    expect(activityState(DUMP, 'com.royaraqamia.app/.shell.OtherActivity')).toBeNull();
  });
});

describe('a warm start the platform did not make', () => {
  // `am start -W` on API 35, right after the app left the screen: the activity
  // still held the top-resumed state, so nothing was started and nothing timed.
  // The platform prints the absence two ways, and both were seen in one drill run.
  const NO_LAUNCH = [
    'Starting: Intent { cmp=com.royaraqamia.app/.shell.ShellActivity }',
    'Warning: Activity not started, its current task has been brought to the front',
    'Status: ok',
    'LaunchState: UNKNOWN (0)',
    'Activity: com.royaraqamia.app/.shell.ShellActivity',
    'WaitTime: 81',
    'Complete',
  ].join('\n');
  const NO_LAUNCH_TIMED_ZERO = NO_LAUNCH.replace('WaitTime: 81', 'TotalTime: 0\nWaitTime: 39');

  it('is an answer to wait out, not a number to record', () => {
    expect(answeredWithoutLaunch(parseAmStart(NO_LAUNCH))).toBe(true);
    // `TotalTime: 0` is the same non-launch with a number beside it, and recording
    // it would report an infinitely fast warm start.
    expect(answeredWithoutLaunch(parseAmStart(NO_LAUNCH_TIMED_ZERO))).toBe(true);
    expect(answeredWithoutLaunch(parseAmStart(COLD))).toBe(false);
    expect(answeredWithoutLaunch(parseAmStart(HOT))).toBe(false);
  });

  it('is re-issued a bounded number of times before the run is called unmeasurable', () => {
    // Enough attempts to outlast a slow device's home transition, few enough that
    // a device which never leaves the front fails the drill instead of hanging.
    expect(WARM_ATTEMPTS).toBeGreaterThan(1);
    expect(WARM_ATTEMPTS).toBeLessThanOrEqual(10);
  });

  it('is re-issued by the warm path only, because a cold run that was not a launch is not cold', () => {
    const source = readFileSync('scripts/android-launch.mjs', 'utf8');
    const warm = /function warmRun[\s\S]*?\n}/.exec(source)?.[0] ?? '';
    const cold = /function coldRun[\s\S]*?\n}/.exec(source)?.[0] ?? '';
    expect(warm).toContain('warmLaunch');
    expect(cold).not.toContain('warmLaunch');
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
