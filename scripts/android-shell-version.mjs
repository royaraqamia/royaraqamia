#!/usr/bin/env node
/**
 * The Android shell's version counter (ADR-0043), and the check that keeps it
 * honest.
 *
 * The shell loads the live site, so a web release changes nothing about the
 * installed app. `android/shell-version.properties` is therefore the shell's own
 * counter: it moves only when `android/**`, `capacitor.config.ts`, or a
 * Capacitor plugin dependency changes, and `public/android/latest.json` is
 * compared against it by the app.
 *
 * The reason this file exists rather than a line of Gradle: nothing about
 * building a web page can tell whether the APK changed, so the moment the
 * counter stops tracking the native side, the app starts announcing an APK that
 * does not exist (or worse, stays silent about one that does). `--check` is what
 * CI runs, and it fails a pull request that changed the shell without bumping.
 *
 *   node scripts/android-shell-version.mjs                # print it, and what it watches
 *   node scripts/android-shell-version.mjs --bump         # increment it
 *   node scripts/android-shell-version.mjs --check <ref>  # CI: compare against <ref>
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
 * Where the display numbering starts, mirroring the counter's own base.
 *
 * The name is *derived* from the counter rather than typed: `1.<minor>.<patch>`
 * where minor and patch come from the offset. Two reasons, and the second is the
 * one that matters. First, nobody can forget it. Second, two numbers that can
 * disagree eventually do — and the number users read in their app must describe
 * the APK they actually have, not a value someone edited in a file.
 *
 * The `1` never moves on its own. Raising it means deliberately changing this
 * base, which is a decision with a consequence: every installed shell keeps
 * working, but the name starts describing a different line of the same offset.
 *
 * It carries no semantic promise. A `1.0.3` may contain anything a `1.0.2` did
 * not; the counter is the only thing that decides whether an update exists.
 */
export const SHELL_VERSION_BASE = 20000;

export function shellVersionNameFor(code) {
  if (!Number.isInteger(code) || code < SHELL_VERSION_BASE) {
    throw new Error(
      `a shell version code is an integer >= ${SHELL_VERSION_BASE}, got ${JSON.stringify(code)}`
    );
  }
  const offset = code - SHELL_VERSION_BASE;
  return `1.${Math.floor(offset / 100)}.${offset % 100}`;
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

/**
 * Whether the file's name line still agrees with its counter. It is derived, so
 * a mismatch is a hand edit — and a hand edit here is exactly how the number in
 * the app and the number of the APK come apart.
 */
export function versionNameVerdict({ code, name }) {
  const expected = shellVersionNameFor(code);
  return { expected, matches: name === expected };
}

export function bumpShellVersion(text) {
  const from = parseShellVersion(text);
  const to = from + 1;
  const versionName = shellVersionNameFor(to);
  return {
    text: writeShellVersionName(writeShellVersion(text, to), versionName),
    from,
    to,
    versionName,
  };
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
 * Whether a pull request changed the shell without moving the counter. Reasons
 * are files and dependencies, so a failure can say what to look at.
 */
export function shellVersionVerdict({
  files,
  baseCode,
  headCode,
  basePackageJson,
  headPackageJson,
}) {
  const reasons = files.filter(isShellPath);
  for (const dependency of changedCapacitorDependencies(
    basePackageJson ?? '',
    headPackageJson ?? ''
  )) {
    reasons.push(`dependency ${dependency}`);
  }

  return {
    reasons,
    changesShell: reasons.length > 0,
    // Equal is not enough: two native changes without a bump would otherwise
    // look like none, and the counter must be strictly ahead of what shipped.
    needsBump: reasons.length > 0 && headCode <= baseCode,
  };
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

  if (argv.includes('--bump')) {
    const { text: next, from, to, versionName } = bumpShellVersion(text);
    writeFile(versionPath, next);
    log(`shellVersionCode ${from} -> ${to}, shellVersionName ${versionName}. (The name is`);
    log('derived from the counter, so it is written for you and never typed.)');
    log(`Build the APK, publish it, then point public/android/latest.json at versionCode ${to}.`);
    return 0;
  }

  const checkAt = argv.indexOf('--check');
  if (checkAt !== -1) {
    const base = argv[checkAt + 1];
    if (!base) {
      log('usage: node scripts/android-shell-version.mjs --check <ref>');
      return 1;
    }

    const files = runGit(['diff', '--name-only', base, 'HEAD'])
      .split('\n')
      .map((file) => file.trim())
      .filter(Boolean);
    // A counter that does not exist at the base was introduced by this change,
    // so there is nothing to be ahead of and any number counts as a bump.
    const baseVersionText = runGit(['show', `${base}:android/shell-version.properties`]);
    const verdict = shellVersionVerdict({
      files,
      baseCode: baseVersionText ? parseShellVersion(baseVersionText) : 0,
      headCode: parseShellVersion(text),
      basePackageJson: runGit(['show', `${base}:package.json`]),
      headPackageJson: readFile(packagePath, 'utf8'),
    });

    if (!verdict.needsBump) {
      // The name is derived from the counter, so a mismatch means one of the two
      // was hand-edited — and the number a user reads in the app would then be
      // describing a different APK than the one they have.
      const code = parseShellVersion(text);
      const name = parseShellVersionName(text);
      const nameCheck = versionNameVerdict({ code, name });
      if (!nameCheck.matches) {
        log(`shellVersionName is ${name}, but counter ${code} means ${nameCheck.expected}.`);
        log('It is derived, not typed. Write both lines with:');
        log('  npm run android:shell-version -- --bump');
        return 1;
      }

      log(
        verdict.changesShell
          ? `shellVersionCode ${code} is ahead of ${base}: the shell moved, and the app will announce it.`
          : 'No shell change; the counter has nothing to move for.'
      );
      return 0;
    }

    log('The shell changed without a new version code:');
    for (const reason of verdict.reasons) log(`  - ${reason}`);
    log('');
    log('An installed APK will not see this change, and the update check compares');
    log('shellVersionCode against public/android/latest.json. Bump it in this pull request:');
    log('  npm run android:shell-version -- --bump');
    return 1;
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
