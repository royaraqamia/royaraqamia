#!/usr/bin/env node
/**
 * The Android shell's version, and the checks that keep it honest (ADR-0043,
 * ADR-0090).
 *
 * The shell loads the live site, so a web deploy changes nothing about the
 * installed app. `android/shell-version.properties` is therefore the shell's own
 * version: it moves only when `android/**`, `capacitor.config.ts`, or a Capacitor
 * plugin dependency changes, and `public/android/latest.json` is compared against
 * it by the app.
 *
 * **It moves at the release cut, never in a pull request.** A pull request used
 * to bump it, one APK per merge, and users were offered an update for every
 * commit, many of them invisible to them (ADR-0090). The weekly train now grades
 * everything that accumulated, computes one version, and writes this file as
 * part of the cut. `--check` is what CI runs on a pull request, and it fails two
 * things: a hand-edited counter, and a name that no longer matches the code.
 *
 * The name is semantic and the code is derived from it:
 *
 *   versionName  1.4.2                     major.minor.patch
 *   versionCode  20000 + (major-1)*10000 + minor*100 + patch
 *
 * so `1.0.21` is 20021 (the code this project already publishes) and any later
 * release is strictly higher — `1.1.0` is 20100, `2.0.0` is 30000. Android needs
 * a monotonic integer; a user reads the name. Deriving one from the other is what
 * stops them disagreeing, and grading the name from the batch is what makes
 * `1.1.0` mean something (scripts/android-release.mjs).
 *
 *   node scripts/android-shell-version.mjs                     # print it
 *   node scripts/android-shell-version.mjs --bump [--major|--minor|--patch]
 *   node scripts/android-shell-version.mjs --check <ref>       # CI, on a pull request
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHELL_VERSION_PATH = resolve(process.cwd(), 'android/shell-version.properties');
export const PACKAGE_PATH = resolve(process.cwd(), 'package.json');
export const MANIFEST_PATH = resolve(process.cwd(), 'public/android/latest.json');

/** A change under one of these means the installed APK is out of date. */
export const SHELL_PATHS = ['android/', 'capacitor.config.ts'];
/** Dependencies that reach native code the next time `cap sync` runs. */
const CAPACITOR_DEPENDENCY = /^@capacitor\/|^@capgo\//;

/**
 * The one line this file owns, matched with horizontal whitespace only: `\s`
 * would let a match run across lines and swallow the newline it replaces.
 */
const SHELL_VERSION_LINE = /^[ \t]*shellVersionCode[ \t]*=[ \t]*(\d+)[ \t]*$/m;
const SHELL_VERSION_NAME_LINE = /^[ \t]*shellVersionName[ \t]*=[ \t]*(\d+\.\d+\.\d+)[ \t]*$/m;

/**
 * Where the numbering starts, mirroring the counter the project already ships.
 *
 * It starts at 20000 on purpose. Until this file existed, versionCode was derived
 * from the site version (major * 10000 + minor * 100 + patch), so an installed
 * shell is at 19100 for 1.91.x and anything below that is a downgrade Android
 * refuses to install — which is how the first emulator drill with a counter of 1
 * ended: INSTALL_FAILED_VERSION_DOWNGRADE against the 1.88.4 build that was
 * already on the device. 20000 is above every code the old scheme could produce
 * for a 1.x release, and the two schemes never need to agree again.
 */
export const SHELL_VERSION_BASE = 20000;

/** Name components stay two digits so the code arithmetic stays injective. */
export const MAX_COMPONENT = 99;

export function shellVersionNameFor(code) {
  if (!Number.isInteger(code) || code < SHELL_VERSION_BASE) {
    throw new Error(
      `a shell version code is an integer >= ${SHELL_VERSION_BASE}, got ${JSON.stringify(code)}`
    );
  }
  const offset = code - SHELL_VERSION_BASE;
  const major = 1 + Math.floor(offset / 10000);
  const minor = Math.floor((offset % 10000) / 100);
  const patch = offset % 100;
  return `${major}.${minor}.${patch}`;
}

/**
 * The code a name owns. Every later release has a higher code by construction:
 * the components are positional, so `1.1.0` (20100) is above `1.0.99` (20099) and
 * below `2.0.0` (30000).
 */
export function shellVersionCodeFor(versionName) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(versionName));
  if (!match) {
    throw new Error(`a shell version is major.minor.patch, got ${JSON.stringify(versionName)}`);
  }
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (major < 1) throw new Error(`a shell version starts at 1.0.0, got ${versionName}`);
  for (const [label, value] of [
    ['minor', minor],
    ['patch', patch],
  ]) {
    if (value > MAX_COMPONENT) {
      throw new Error(
        `the ${label} component of ${versionName} is above ${MAX_COMPONENT}, which the version ` +
          'code cannot carry. Move up a component instead.'
      );
    }
  }
  return SHELL_VERSION_BASE + (major - 1) * 10000 + minor * 100 + patch;
}

/** The next release of the same line, one component up, the ones below reset. */
export function nextShellVersion(versionName, bump = 'patch') {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(versionName));
  if (!match)
    throw new Error(`a shell version is major.minor.patch, got ${JSON.stringify(versionName)}`);
  let [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (bump === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === 'minor') {
    minor += 1;
    patch = 0;
  } else if (bump === 'patch') {
    patch += 1;
  } else {
    throw new Error(`a bump is major, minor or patch, got ${JSON.stringify(bump)}`);
  }
  const name = `${major}.${minor}.${patch}`;
  return { name, code: shellVersionCodeFor(name), bump };
}

export function parseShellVersion(text) {
  const match = SHELL_VERSION_LINE.exec(text);
  if (!match) {
    throw new Error('android/shell-version.properties has no shellVersionCode=<number> line');
  }
  return Number(match[1]);
}

export function parseShellVersionName(text) {
  const match = SHELL_VERSION_NAME_LINE.exec(text);
  if (!match) {
    throw new Error(
      'android/shell-version.properties has no shellVersionName=<major.minor.patch> line'
    );
  }
  return match[1];
}

export function writeShellVersion(text, code) {
  return text.replace(SHELL_VERSION_LINE, `shellVersionCode=${code}`);
}

/** Written above the counter, because it is the line a person reads first. */
export function writeShellVersionName(text, name) {
  if (SHELL_VERSION_NAME_LINE.test(text)) {
    return text.replace(SHELL_VERSION_NAME_LINE, `shellVersionName=${name}`);
  }
  return text.replace(SHELL_VERSION_LINE, (line) => `shellVersionName=${name}\n${line}`);
}

/** Writes both lines from the name — the code is derived, exactly like CI reads it. */
export function writeShellVersionFor(text, versionName) {
  return writeShellVersionName(
    writeShellVersion(text, shellVersionCodeFor(versionName)),
    versionName
  );
}

/**
 * Whether the file's name line still agrees with its counter. The name is derived
 * from the code, so a mismatch is a hand edit — and a hand edit here is exactly
 * how the number in the app and the number of the APK come apart.
 */
export function versionNameVerdict({ code, name }) {
  const expected = shellVersionNameFor(code);
  return { expected, matches: name === expected };
}

/** The release tag the shell already has for a version: `android-1.0.21`. */
export function shellTagFor(versionName) {
  return `android-${versionName}`;
}

/** A shell release tag as a version name, or null for anything else. */
export function parseShellTag(tag) {
  const match = /^android-(\d+\.\d+\.\d+)$/.exec(String(tag ?? ''));
  return match ? match[1] : null;
}

export function isShellPath(file) {
  return SHELL_PATHS.some((prefix) => file === prefix || file.startsWith(prefix));
}

/** The Capacitor-family dependencies of a package.json, as `name@version`. */
export function capacitorDependencies(packageJsonText) {
  try {
    const parsed = JSON.parse(packageJsonText);
    const all = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
    return Object.entries(all)
      .filter(([name]) => CAPACITOR_DEPENDENCY.test(name))
      .map(([name, version]) => `${name}@${version}`)
      .sort();
  } catch {
    return [];
  }
}

/** Dependencies whose version changed between two package.json revisions. */
export function changedCapacitorDependencies(baseText, headText) {
  const base = new Set(capacitorDependencies(baseText));
  const head = new Set(capacitorDependencies(headText));
  return [
    ...[...head].filter((dependency) => !base.has(dependency)),
    ...[...base].filter((dependency) => !head.has(dependency)),
  ];
}

/**
 * Whether a change touched the shell at all: the files and dependencies that
 * decide it, so a failure or a release plan can say what to look at.
 *
 * This is the one definition of "a new APK exists". Both the pull-request check
 * and the weekly train read it, so a release cannot be begged by a web change and
 * a native change cannot be forgotten by one.
 */
export function shellChangeVerdict({ files, basePackageJson, headPackageJson }) {
  const reasons = files.filter(isShellPath);
  for (const dependency of changedCapacitorDependencies(
    basePackageJson ?? '',
    headPackageJson ?? ''
  )) {
    reasons.push(`dependency ${dependency}`);
  }
  return { reasons, changesShell: reasons.length > 0 };
}

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

export function main({
  argv = process.argv.slice(2),
  log = console.log,
  runGit = git,
  versionPath = SHELL_VERSION_PATH,
  packagePath = PACKAGE_PATH,
  readFile = readFileSync,
  writeFile = writeFileSync,
} = {}) {
  const text = readFile(versionPath, 'utf8');

  const bumpAt = argv.indexOf('--bump');
  if (bumpAt !== -1) {
    const requested =
      ['--major', '--minor', '--patch'].find((flag) => argv.includes(flag)) ?? 'patch';
    const from = parseShellVersionName(text);
    const next = nextShellVersion(from, requested.slice(2));
    writeFile(versionPath, writeShellVersionFor(text, next.name));
    log(`shellVersionName ${from} -> ${next.name}, shellVersionCode ${next.code}.`);
    log('');
    log('A release cuts this itself; the line above is for a manual or emergency publish. Build');
    log('the APK, publish it, then land public/android/latest.json and the release notes.');
    return 0;
  }

  const checkAt = argv.indexOf('--check');
  if (checkAt !== -1) {
    const base = argv[checkAt + 1];
    if (!base) {
      log('usage: node scripts/android-shell-version.mjs --check <ref>');
      return 1;
    }

    const code = parseShellVersion(text);
    const name = parseShellVersionName(text);
    const nameCheck = versionNameVerdict({ code, name });
    if (!nameCheck.matches) {
      log(`shellVersionName is ${name}, but counter ${code} means ${nameCheck.expected}.`);
      log('Both lines are written from one name. Repair them with:');
      log('  node scripts/android-shell-version.mjs --bump');
      return 1;
    }

    // The counter is a release artifact, not a pull-request one. A branch that
    // moves it would publish a version the train never graded, and the next cut
    // would grade the same commits again. A comment edit is not a move: the
    // values are what the app and the manifest compare.
    const baseText = runGit(['show', `${base}:android/shell-version.properties`]);
    const moved =
      baseText.length > 0 &&
      (parseShellVersion(baseText) !== code || parseShellVersionName(baseText) !== name);
    if (moved) {
      log('android/shell-version.properties is moved by the release cut, not by a pull request.');
      log('Revert it here: the weekly train grades everything that accumulated and writes it.');
      log('If this change needs to ship now, dispatch the release workflow after merging.');
      return 1;
    }

    log(
      `shellVersionName=${name}, shellVersionCode=${code}: consistent. It moves at the release cut.`
    );
    return 0;
  }

  log(`shellVersionName=${parseShellVersionName(text)}   # derived from the counter`);
  log(`shellVersionCode=${parseShellVersion(text)}`);
  log('');
  log('It moves when one of these changes:');
  for (const path of SHELL_PATHS) log(`  - ${path}`);
  log(`  - a dependency matching ${CAPACITOR_DEPENDENCY}`);
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
