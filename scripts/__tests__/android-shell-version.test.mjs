import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  capacitorDependencies,
  changedCapacitorDependencies,
  isShellPath,
  nextShellVersion,
  parseShellTag,
  parseShellVersion,
  parseShellVersionName,
  shellChangeVerdict,
  shellTagFor,
  shellVersionCodeFor,
  shellVersionNameFor,
  versionNameVerdict,
  writeShellVersion,
  writeShellVersionFor,
  writeShellVersionName,
} from '../android-shell-version.mjs';

const REPO = process.cwd();
// A byte-order mark is easy to pick up from an editor or a script on Windows,
// and it makes `JSON.parse` fail — which, for this file, would silently take the
// update channel down. Both parsers strip it; so does this test.
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));

const properties = readFileSync(resolve(REPO, 'android/shell-version.properties'), 'utf8');
const manifest = readJson(resolve(REPO, 'public/android/latest.json'));

describe('the shell version', () => {
  it('reads the version out of the properties file', () => {
    expect(parseShellVersion('shellVersionCode=7\n')).toBe(7);
    expect(parseShellVersion('# note\nshellVersionCode = 12\n')).toBe(12);
    expect(() => parseShellVersion('# nothing here\n')).toThrow(/shellVersionCode/);
  });

  it('writes a name and its derived code together', () => {
    const before = '# a comment\nshellVersionCode=20002\n# another\n';
    const text = writeShellVersionFor(before, '1.1.0');

    expect(text).toBe('# a comment\nshellVersionName=1.1.0\nshellVersionCode=20100\n# another\n');
    expect(parseShellVersionName(text)).toBe('1.1.0');
    expect(parseShellVersion(text)).toBe(20100);
  });

  it('repairs the name line instead of adding a second one', () => {
    const before = 'shellVersionName=9.9.9\nshellVersionCode=20003\n';
    expect(writeShellVersionFor(before, '1.0.4')).toBe(
      'shellVersionName=1.0.4\nshellVersionCode=20004\n'
    );
  });

  it('writes a specific code when asked to', () => {
    expect(writeShellVersion('shellVersionCode=1\n', 9)).toBe('shellVersionCode=9\n');
    expect(writeShellVersionName('shellVersionCode=20003\n', '1.0.3')).toBe(
      'shellVersionName=1.0.3\nshellVersionCode=20003\n'
    );
  });

  it('derives the code from the name, injectively', () => {
    // The same arithmetic in both directions: 1.0.21 is 20021 (the code this
    // project already publishes), 1.1.0 is 20100, 2.0.0 is 30000.
    expect(shellVersionCodeFor('1.0.0')).toBe(20000);
    expect(shellVersionCodeFor('1.0.21')).toBe(20021);
    expect(shellVersionCodeFor('1.1.0')).toBe(20100);
    expect(shellVersionCodeFor('1.10.0')).toBe(21000);
    expect(shellVersionCodeFor('2.0.0')).toBe(30000);

    for (const name of ['1.0.0', '1.0.21', '1.1.0', '1.10.0', '2.0.0', '3.4.5']) {
      expect(shellVersionNameFor(shellVersionCodeFor(name))).toBe(name);
    }
  });

  it('stays monotonic as the version moves up a component', () => {
    expect(nextShellVersion('1.0.21', 'patch')).toEqual({
      name: '1.0.22',
      code: 20022,
      bump: 'patch',
    });
    expect(nextShellVersion('1.0.21', 'minor')).toEqual({
      name: '1.1.0',
      code: 20100,
      bump: 'minor',
    });
    expect(nextShellVersion('1.9.99', 'major')).toEqual({
      name: '2.0.0',
      code: 30000,
      bump: 'major',
    });
    expect(shellVersionCodeFor('1.1.0')).toBeGreaterThan(shellVersionCodeFor('1.0.99'));
    expect(shellVersionCodeFor('2.0.0')).toBeGreaterThan(shellVersionCodeFor('1.99.99'));
  });

  it('refuses a counter below where the numbering starts', () => {
    expect(() => shellVersionNameFor(19100)).toThrow(/20000/);
    expect(() => shellVersionNameFor('20003')).toThrow(/20000/);
  });

  it('refuses a name the code cannot carry', () => {
    // Two digits per component is what makes the code injective; a hundred
    // patches would be the next minor, not 1.0.100.
    expect(() => shellVersionCodeFor('1.0.100')).toThrow(/patch/);
    expect(() => shellVersionCodeFor('1.100.0')).toThrow(/minor/);
    expect(() => shellVersionCodeFor('0.9.0')).toThrow(/1.0.0/);
    expect(() => shellVersionCodeFor('one')).toThrow(/major.minor.patch/);
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

  it('names a release tag, and reads it back', () => {
    expect(shellTagFor('1.1.0')).toBe('android-1.1.0');
    expect(parseShellTag('android-1.1.0')).toBe('1.1.0');
    expect(parseShellTag('web-1.1.0')).toBeNull();
    expect(parseShellTag('android-1.1')).toBeNull();
  });
});

describe('what counts as a shell change', () => {
  it('covers the native tree and the Capacitor config', () => {
    expect(isShellPath('android/app/build.gradle')).toBe(true);
    expect(isShellPath('android/')).toBe(true);
    expect(isShellPath('capacitor.config.ts')).toBe(true);
  });

  it('covers Kotlin, Compose, the generated theme and the generated contracts', () => {
    // `versionCode` carries every screen since ADR-0088, so an app-only screen
    // change is as much a release as a Gradle or manifest change (#503).
    expect(
      isShellPath('android/app/src/main/kotlin/com/royaraqamia/app/theme/ThemeColors.kt')
    ).toBe(true);
    expect(
      isShellPath(
        'android/app/src/main/kotlin/com/royaraqamia/app/contracts/generated/PlansContracts.kt'
      )
    ).toBe(true);
    expect(isShellPath('android/app/src/main/java/com/royaraqamia/app/ShellUpdate.java')).toBe(
      true
    );
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

  it('says which files or dependencies made it a shell change', () => {
    const verdict = shellChangeVerdict({
      files: ['android/app/src/main/AndroidManifest.xml', 'frontend/ui/shared/update-prompt.tsx'],
    });

    expect(verdict.changesShell).toBe(true);
    expect(verdict.reasons).toEqual(['android/app/src/main/AndroidManifest.xml']);
  });

  it('says nothing about a web-only change', () => {
    const verdict = shellChangeVerdict({
      files: ['frontend/ui/shared/update-prompt.tsx', 'README.md'],
    });

    expect(verdict.changesShell).toBe(false);
    expect(verdict.reasons).toEqual([]);
  });

  it('names a new Capacitor plugin as the reason', () => {
    const verdict = shellChangeVerdict({
      files: ['package.json'],
      basePackageJson: JSON.stringify({ dependencies: {} }),
      headPackageJson: JSON.stringify({ dependencies: { '@capacitor/browser': '8.0.0' } }),
    });

    expect(verdict.changesShell).toBe(true);
    expect(verdict.reasons).toEqual(['dependency @capacitor/browser@8.0.0']);
  });
});

describe('generated Android files', () => {
  it('never carry a path from the machine that generated them', () => {
    // `cap sync` rewrites this file, and in a worktree whose `node_modules` is a
    // junction it writes absolute paths — which a local build then leaves in the
    // tree for `git add -A` to pick up. That is what this guard is for: the `Shell
    // Version` check caught it (it saw `android/**` change), and this says *why*
    // the file may not look like that.
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
    expect(Number.isInteger(manifest.rollout)).toBe(true);
    expect(manifest.rollout).toBeGreaterThanOrEqual(0);
    expect(manifest.rollout).toBeLessThanOrEqual(100);
  });

  it('never names an APK newer than the shell in the tree', () => {
    // The counter is what was built; the manifest is what was published. An APK
    // the repository cannot build would be an update nobody can install.
    expect(manifest.versionCode).toBeLessThanOrEqual(parseShellVersion(properties));
  });

  it('names itself the way the build names the APK', () => {
    // `versionName` is the shell's own version, derived from the same code the
    // update check compares, so the two can never disagree.
    expect(manifest.versionName).toBe(shellVersionNameFor(manifest.versionCode));
  });
});
