import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  bumpShellVersion,
  capacitorDependencies,
  changedCapacitorDependencies,
  isShellPath,
  parseShellVersion,
  shellVersionVerdict,
  writeShellVersion,
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

  it('bumps the counter without disturbing anything else', () => {
    const before = '# a comment\nshellVersionCode=3\n# another\n';
    const { text, from, to } = bumpShellVersion(before);

    expect(from).toBe(3);
    expect(to).toBe(4);
    expect(text).toBe('# a comment\nshellVersionCode=4\n# another\n');
    expect(parseShellVersion(text)).toBe(4);
  });

  it('writes a specific code when asked to', () => {
    expect(writeShellVersion('shellVersionCode=1\n', 9)).toBe('shellVersionCode=9\n');
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
    expect(manifest.versionName).toMatch(new RegExp(`\\+shell\\.${manifest.versionCode}$`));
  });
});
