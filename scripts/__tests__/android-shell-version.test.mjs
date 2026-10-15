import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  bumpShellVersion,
  capacitorDependencies,
  changedCapacitorDependencies,
  isShellPath,
  parseShellVersion,
  parseShellVersionName,
  shellVersionNameFor,
  shellVersionVerdict,
  versionNameVerdict,
  writeShellVersion,
  writeShellVersionName,
} from '../android-shell-version.mjs';

const REPO = process.cwd();
// A byte-order mark is easy to pick up from an editor or a script on Windows,
// and it makes `JSON.parse` fail — which, for this file, would silently take the
// update channel down. Both parsers strip it; so does this test.
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));

const properties = readFileSync(resolve(REPO, 'android/shell-version.properties'), 'utf8');
const manifest = readJson(resolve(REPO, 'public/android/latest.json'));

describe('the shell version counter', () => {
  it('reads the counter out of the properties file', () => {
    expect(parseShellVersion('shellVersionCode=7\n')).toBe(7);
    expect(parseShellVersion('# note\nshellVersionCode = 12\n')).toBe(12);
    expect(() => parseShellVersion('# nothing here\n')).toThrow(/shellVersionCode/);
  });

  it('bumps the counter, and writes the derived name beside it', () => {
    const before = '# a comment\nshellVersionCode=20002\n# another\n';
    const { text, from, to, versionName } = bumpShellVersion(before);

    expect(from).toBe(20002);
    expect(to).toBe(20003);
    expect(versionName).toBe('1.0.3');
    expect(text).toBe('# a comment\nshellVersionName=1.0.3\nshellVersionCode=20003\n# another\n');
    expect(parseShellVersion(text)).toBe(20003);
  });

  it('repairs the name line instead of adding a second one', () => {
    const before = 'shellVersionName=9.9.9\nshellVersionCode=20003\n';
    expect(bumpShellVersion(before).text).toBe('shellVersionName=1.0.4\nshellVersionCode=20004\n');
  });

  it('writes a specific code when asked to', () => {
    expect(writeShellVersion('shellVersionCode=1\n', 9)).toBe('shellVersionCode=9\n');
  });
});

describe('the shell version name', () => {
  it('is derived from the counter, and never typed', () => {
    // `1.<minor>.<patch>`, minor and patch from (counter - 20000): the number a
    // user reads and the number Android compares are the same fact twice.
    expect(shellVersionNameFor(20000)).toBe('1.0.0');
    expect(shellVersionNameFor(20001)).toBe('1.0.1');
    expect(shellVersionNameFor(20002)).toBe('1.0.2');
    expect(shellVersionNameFor(20003)).toBe('1.0.3');
    expect(shellVersionNameFor(20099)).toBe('1.0.99');
    // The hundreds carry into the minor, so it stays readable at scale.
    expect(shellVersionNameFor(20100)).toBe('1.1.0');
    expect(shellVersionNameFor(20101)).toBe('1.1.1');
    // The major never moves on its own: raising it means changing the base.
    expect(shellVersionNameFor(30000)).toBe('1.100.0');
  });

  it('refuses a counter below where the numbering starts', () => {
    expect(() => shellVersionNameFor(19100)).toThrow(/20000/);
    expect(() => shellVersionNameFor('20003')).toThrow(/20000/);
  });

  it('reads and writes the name line', () => {
    expect(parseShellVersionName('shellVersionName=1.0.3\nshellVersionCode=20003\n')).toBe('1.0.3');
    expect(() => parseShellVersionName('shellVersionCode=20003\n')).toThrow(/shellVersionName/);
    expect(writeShellVersionName('shellVersionCode=20003\n', '1.0.3')).toBe(
      'shellVersionName=1.0.3\nshellVersionCode=20003\n'
    );
    expect(writeShellVersionName('shellVersionName=1.0.2\nshellVersionCode=20003\n', '1.0.3')).toBe(
      'shellVersionName=1.0.3\nshellVersionCode=20003\n'
    );
  });

  it('judges the file against the counter, so a hand edit is caught', () => {
    expect(versionNameVerdict({ code: 20003, name: '1.0.3' })).toEqual({
      expected: '1.0.3',
      matches: true,
    });
    expect(versionNameVerdict({ code: 20003, name: '2.5.0' })).toEqual({
      expected: '1.0.3',
      matches: false,
    });
  });

  it('agrees with the file this repository ships', () => {
    // The check that catches a counter bumped by hand without its name.
    const code = parseShellVersion(properties);
    const name = parseShellVersionName(properties);
    expect(versionNameVerdict({ code, name })).toEqual({ expected: name, matches: true });
  });
});

describe('what counts as a shell change', () => {
  it('covers the native tree and the Capacitor config', () => {
    expect(isShellPath('android/app/build.gradle')).toBe(true);
    expect(isShellPath('android/')).toBe(true);
    expect(isShellPath('capacitor.config.ts')).toBe(true);
  });

  it('does not cover the web app', () => {
    expect(isShellPath('frontend/ui/shared/update-prompt.tsx')).toBe(false);
    expect(isShellPath('public/android/latest.json')).toBe(false);
    expect(isShellPath('app/layout.tsx')).toBe(false);
  });

  it('watches Capacitor plugins, because `cap sync` moves them into the APK', () => {
    const before = JSON.stringify({ dependencies: { next: '1', '@capacitor/app': '8.0.0' } });
    const after = JSON.stringify({ dependencies: { next: '1', '@capacitor/app': '8.1.0' } });
    // Same Capacitor plugins; only the web framework moved.
    const webOnly = JSON.stringify({
      dependencies: { next: '16.2.0', '@capacitor/app': '8.0.0' },
    });

    expect(capacitorDependencies(before)).toEqual(['@capacitor/app@8.0.0']);
    expect(changedCapacitorDependencies(before, after)).toEqual([
      '@capacitor/app@8.1.0',
      '@capacitor/app@8.0.0',
    ]);
    expect(changedCapacitorDependencies(before, webOnly)).toEqual([]);
  });

  it('counts the @capgo plugins too', () => {
    const base = JSON.stringify({ dependencies: { '@capgo/capacitor-native-biometric': '1.0.0' } });
    const head = JSON.stringify({ dependencies: { '@capgo/capacitor-native-biometric': '2.0.0' } });

    expect(changedCapacitorDependencies(base, head)).toHaveLength(2);
  });

  it('refuses a shell change with no bump', () => {
    const verdict = shellVersionVerdict({
      files: ['android/app/src/main/AndroidManifest.xml', 'frontend/ui/shared/update-prompt.tsx'],
      baseCode: 1,
      headCode: 1,
    });

    expect(verdict.needsBump).toBe(true);
    expect(verdict.reasons).toEqual(['android/app/src/main/AndroidManifest.xml']);
  });

  it('accepts a shell change that moved the counter', () => {
    const verdict = shellVersionVerdict({
      files: ['android/app/build.gradle', 'android/shell-version.properties'],
      baseCode: 1,
      headCode: 2,
    });

    expect(verdict.needsBump).toBe(false);
    expect(verdict.changesShell).toBe(true);
  });

  it('says nothing about a web-only change', () => {
    const verdict = shellVersionVerdict({
      files: ['frontend/ui/shared/update-prompt.tsx', 'README.md'],
      baseCode: 1,
      headCode: 1,
    });

    expect(verdict.needsBump).toBe(false);
    expect(verdict.changesShell).toBe(false);
  });

  it('refuses a new Capacitor plugin with no bump', () => {
    const verdict = shellVersionVerdict({
      files: ['package.json'],
      baseCode: 4,
      headCode: 4,
      basePackageJson: JSON.stringify({ dependencies: {} }),
      headPackageJson: JSON.stringify({ dependencies: { '@capacitor/browser': '8.0.0' } }),
    });

    expect(verdict.needsBump).toBe(true);
    expect(verdict.reasons).toEqual(['dependency @capacitor/browser@8.0.0']);
  });

  it('treats a brand new counter as a bump', () => {
    // The file did not exist at the base, so baseCode 0 is the only honest
    // reading: any number is ahead of "there was no counter".
    const verdict = shellVersionVerdict({
      files: ['android/shell-version.properties'],
      baseCode: 0,
      headCode: 1,
    });

    expect(verdict.needsBump).toBe(false);
  });
});

describe('generated Android files', () => {
  it('never carry a path from the machine that generated them', () => {
    // `cap sync` rewrites this file, and in a worktree whose `node_modules` is a
    // junction it writes absolute paths — which a local build then leaves in the
    // tree for `git add -A` to pick up. That is what this guard is for: the `Shell
    // Version` check caught it (it saw `android/**` change with no counter bump),
    // and this says *why* the file may not look like that.
    const settings = readFileSync(resolve(REPO, 'android/capacitor.settings.gradle'), 'utf8');

    expect(settings).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(settings).not.toMatch(/\/(Users|home)\//);
    expect(settings).toMatch(/new File\('\.\.\//);
  });
});

describe('the published manifest', () => {
  it('describes an APK with a version and a download', () => {
    expect(Number.isInteger(manifest.versionCode)).toBe(true);
    expect(manifest.versionCode).toBeGreaterThan(0);
    expect(manifest.apkUrl).toMatch(/^https:\/\//);
    expect(typeof manifest.minSupportedVersionCode).toBe('number');
    expect(Number.isInteger(manifest.minSupportedVersionCode)).toBe(true);
  });

  it('never names an APK newer than the shell in the tree', () => {
    // The counter is what was built; the manifest is what was published. An APK
    // the repository cannot build would be an update nobody can install.
    expect(manifest.versionCode).toBeLessThanOrEqual(parseShellVersion(properties));
  });

  it('names itself the way the build names the APK', () => {
    // `versionName` is the shell's own version, derived from the same counter the
    // update check compares (ADR-0046), so the two can never disagree. This used
    // to assert the old spelling (`1.94.2+shell.20003`), which the web version at
    // build time put there — and which stopped being true the moment a release
    // published a manifest under the new naming. It passed then only because the
    // manifest had not been republished yet.
    expect(manifest.versionName).toBe(shellVersionNameFor(manifest.versionCode));
  });
});
