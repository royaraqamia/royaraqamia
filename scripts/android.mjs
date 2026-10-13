#!/usr/bin/env node
/**
 * Builds the Android shell. See docs/mobile/android-shell.md.
 *
 * AGP 8.13 runs on JDK 17–21, while this machine's JAVA_HOME points at JDK 25,
 * so the JDK is resolved explicitly here rather than inherited — the build would
 * otherwise fail on an environment detail nobody thinks about. Set
 * `ANDROID_JDK_HOME` to override the search.
 *
 * Usage: node scripts/android.mjs <apk|release|aab|clean>
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_JDK_MAJOR = 21;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID_DIR = join(ROOT, 'android');

const TASKS = {
  apk: {
    gradle: ['assembleDebug'],
    artifact: 'app/build/outputs/apk/debug/app-debug.apk',
    label: 'debug APK (install with `adb install -r`)',
  },
  release: {
    gradle: ['assembleRelease'],
    artifact: 'app/build/outputs/apk/release/app-release.apk',
    label: 'signed release APK',
  },
  aab: {
    gradle: ['bundleRelease'],
    artifact: 'app/build/outputs/bundle/release/app-release.aab',
    label: 'signed App Bundle (Play upload)',
  },
  clean: { gradle: ['clean'], artifact: null, label: 'clean' },
};

const task = TASKS[process.argv[2]];
if (!task) {
  process.stderr.write(`Usage: node scripts/android.mjs <${Object.keys(TASKS).join('|')}>\n`);
  process.exit(1);
}

function javaMajor(home) {
  if (!home) return null;
  const binary = join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (!existsSync(binary)) return null;
  const probe = spawnSync(binary, ['-version'], { encoding: 'utf8' });
  const output = `${probe.stdout ?? ''}${probe.stderr ?? ''}`;
  const match = /version "(?:1\.)?(\d+)/.exec(output);
  return match ? Number(match[1]) : null;
}

function candidateHomes() {
  const homes = [process.env.ANDROID_JDK_HOME, process.env.JAVA_HOME];
  const roots = [
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Java',
    'C:\\Program Files\\Microsoft',
    '/usr/lib/jvm',
    '/Library/Java/JavaVirtualMachines',
  ];
  for (const base of roots) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      homes.push(join(base, entry));
    }
  }
  return homes.filter(Boolean);
}

const jdkHome = candidateHomes().find((home) => javaMajor(home) === REQUIRED_JDK_MAJOR);

if (!jdkHome) {
  process.stderr.write(
    `No JDK ${REQUIRED_JDK_MAJOR} found. The Android Gradle Plugin does not run on newer JDKs.\n` +
      `Install one (winget install Microsoft.OpenJDK.${REQUIRED_JDK_MAJOR}) or point ANDROID_JDK_HOME at it.\n`
  );
  process.exit(1);
}

const sdkHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
if (!sdkHome) {
  process.stderr.write('ANDROID_HOME (or ANDROID_SDK_ROOT) must point at the Android SDK.\n');
  process.exit(1);
}

const gradle = join(ANDROID_DIR, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const gradleArgs = [...task.gradle, '--console=plain'];

// Windows ships Gradle as a `.bat`, and Node will not spawn a batch file
// directly (it refuses for security), so the wrapper goes through the shell.
// A silent exit-1 with no Gradle output is what that looks like from here.
const isWindows = process.platform === 'win32';
const result = spawnSync(
  isWindows ? `"${gradle}" ${gradleArgs.join(' ')}` : gradle,
  isWindows ? [] : gradleArgs,
  {
    cwd: ANDROID_DIR,
    stdio: 'inherit',
    shell: isWindows,
    env: { ...process.env, JAVA_HOME: jdkHome, ANDROID_HOME: sdkHome },
  }
);

if (result.error) {
  process.stderr.write(`Failed to run Gradle: ${result.error.message}\n`);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!task.artifact) {
  process.stdout.write(`\nAndroid ${task.label} finished.\n`);
  process.exit(0);
}

const artifact = join(ANDROID_DIR, task.artifact);
if (!existsSync(artifact)) {
  process.stderr.write(`\nGradle succeeded but ${task.artifact} is missing.\n`);
  process.exit(1);
}

const megabytes = (statSync(artifact).size / (1024 * 1024)).toFixed(1);
process.stdout.write(`\n${task.label}: ${artifact} (${megabytes} MB)\n`);
