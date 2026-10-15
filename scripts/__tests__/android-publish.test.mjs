import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assetNameFromUrl,
  checkApkAgainstTree,
  isTrustedSigner,
  listedFingerprints,
  MANIFEST_KEYS,
  manifestText,
  nextApkUrl,
  normalizeFingerprint,
  parseBadging,
  parseSignerFingerprints,
  publishVerdict,
  releaseTagFromUrl,
  sha256File,
  shellAssetName,
  stampManifest,
} from '../android-publish.mjs';

const REPO = process.cwd();
const assetlinks = readFileSync(resolve(REPO, 'public/.well-known/assetlinks.json'), 'utf8');
const committedManifest = readFileSync(resolve(REPO, 'public/android/latest.json'), 'utf8');

// Both of these are the real shapes, copied from aapt2 and apksigner output.
const BADGING = [
  "package: name='com.royaraqamia.app' versionCode='20001' versionName='1.92.0+shell.20001' platformBuildVersionName='16' platformBuildVersionCode='36' compileSdkVersion='36' compileSdkVersionCodename='16'",
  "sdkVersion:'24'",
  "targetSdkVersion:'36'",
  "application-label:'رؤية رقمية'",
].join('\n');

// The real digest, in the spelling apksigner prints it (lowercase, no colons).
const RELEASE_FINGERPRINT = listedFingerprints(assetlinks)[0];

const SIGNER_CERTS = [
  'Signer #1 certificate DN: CN=royar, OU=royaraqamia, O=royaraqamia, L=, ST=, C=SA',
  `Signer #1 certificate SHA-256 digest: ${RELEASE_FINGERPRINT.toLowerCase()}`,
  'Signer #1 certificate SHA-1 digest: 1a2b3c',
  'Signer #1 key algorithm: RSA',
].join('\n');

const GOOD_SHA = 'ab'.repeat(32);

describe('reading the built APK', () => {
  it('takes the package, the version code and the version name from badging', () => {
    expect(parseBadging(BADGING)).toEqual({
      packageName: 'com.royaraqamia.app',
      versionCode: 20001,
      versionName: '1.92.0+shell.20001',
    });
  });

  it('refuses badging without a package line, rather than guessing', () => {
    expect(() => parseBadging('sdkVersion:24')).toThrow(/package/);
  });

  it('refuses a version code it cannot read as a number', () => {
    expect(() => parseBadging("package: name='x' versionCode='0' versionName='1'")).toThrow(
      /versionCode/
    );
  });

  it('reads the signer fingerprints, and does not care how they are spelled', () => {
    expect(parseSignerFingerprints(SIGNER_CERTS)).toEqual([RELEASE_FINGERPRINT]);
    expect(
      parseSignerFingerprints(
        'Signer #1 certificate SHA-256 digest: D0:A8:C0:88' + ':00'.repeat(28)
      )
    ).toHaveLength(1);
  });

  it('finds no signer in an unsigned APK', () => {
    expect(parseSignerFingerprints('app-release.apk is not signed.')).toEqual([]);
  });

  it('normalises a fingerprint to one spelling', () => {
    expect(normalizeFingerprint('d0:a8:c0')).toBe('D0A8C0');
  });
});

describe('which keys may sign a published APK', () => {
  it('lists the fingerprints assetlinks.json trusts', () => {
    // The file App Links verification uses is also the list of keys Android will
    // accept as an update to the installed app, so it is the right list.
    expect(RELEASE_FINGERPRINT).toMatch(/^[0-9A-F]{64}$/);
    expect(listedFingerprints(assetlinks).length).toBeGreaterThanOrEqual(2);
  });

  it('matches a listed key whatever its case, and reports which one', () => {
    const listed = listedFingerprints(assetlinks);
    const lowercased = listed[0].toLowerCase();

    expect(isTrustedSigner(assetlinks, [lowercased])).toEqual([listed[0]]);
  });

  it('refuses a key nobody listed', () => {
    expect(isTrustedSigner(assetlinks, ['AB'.repeat(32)])).toEqual([]);
  });
});

describe('stamping the manifest', () => {
  const previous = {
    versionCode: 20000,
    versionName: '1.92.0+shell.20000',
    apkUrl:
      'https://github.com/royaraqamia/royaraqamia/releases/download/shell/royaraqamia-shell.apk',
    sha256: 'cd'.repeat(32),
    sizeBytes: 10_700_000,
    minSupportedVersionCode: 20000,
    notes: '',
    releasedAt: '2026-10-14',
  };

  const stamped = () =>
    stampManifest({
      previous,
      versionCode: 20001,
      versionName: '1.92.0+shell.20001',
      apkUrl: previous.apkUrl,
      sha256: GOOD_SHA,
      sizeBytes: 10_800_000,
      minSupportedVersionCode: 20000,
    });

  it('carries exactly the keys the manifest has, in order', () => {
    expect(Object.keys(stamped())).toEqual(MANIFEST_KEYS);
  });

  it('carries forward what it was not told to change', () => {
    const manifest = stamped();

    expect(manifest.notes).toBe('');
    expect(manifest.releasedAt).toBe('2026-10-14');
    expect(manifest.apkUrl).toBe(previous.apkUrl);
  });

  it('takes the size and the hash from the APK, not from anyone’s typing', () => {
    const manifest = stamped();

    expect(manifest.sha256).toBe(GOOD_SHA);
    expect(manifest.sizeBytes).toBe(10_800_000);
  });

  it('refuses to publish backwards', () => {
    // A device on 20001 would be told nothing forever, because the check is
    // `published > installed`.
    expect(() =>
      stampManifest({
        previous,
        versionCode: 19999,
        versionName: 'x',
        apkUrl: previous.apkUrl,
        sha256: GOOD_SHA,
        sizeBytes: 1,
        minSupportedVersionCode: 0,
      })
    ).toThrow(/backwards/);
  });

  it('allows republishing the same version, since re-uploading is a real thing', () => {
    expect(
      stampManifest({
        previous,
        versionCode: 20000,
        versionName: 'x',
        apkUrl: previous.apkUrl,
        sha256: GOOD_SHA,
        sizeBytes: 1,
        minSupportedVersionCode: 20000,
      }).versionCode
    ).toBe(20000);
  });

  it('refuses an apkUrl that is not https', () => {
    expect(() =>
      stampManifest({
        previous,
        versionCode: 20001,
        versionName: 'x',
        apkUrl: 'http://10.0.2.2:3000/android/x.apk',
        sha256: GOOD_SHA,
        sizeBytes: 1,
        minSupportedVersionCode: 0,
      })
    ).toThrow(/https/);
  });

  it('refuses a hash that is not a hash', () => {
    expect(() =>
      stampManifest({
        previous,
        versionCode: 20001,
        versionName: 'x',
        apkUrl: previous.apkUrl,
        sha256: '',
        sizeBytes: 1,
        minSupportedVersionCode: 0,
      })
    ).toThrow(/sha256/);
  });

  it('refuses a size of nothing', () => {
    expect(() =>
      stampManifest({
        previous,
        versionCode: 20001,
        versionName: 'x',
        apkUrl: previous.apkUrl,
        sha256: GOOD_SHA,
        sizeBytes: 0,
        minSupportedVersionCode: 0,
      })
    ).toThrow(/sizeBytes/);
  });

  it('refuses a floor above the version being published', () => {
    // Every shell able to install this one would be told it is too old.
    expect(() =>
      stampManifest({
        previous,
        versionCode: 20001,
        versionName: 'x',
        apkUrl: previous.apkUrl,
        sha256: GOOD_SHA,
        sizeBytes: 1,
        minSupportedVersionCode: 20002,
      })
    ).toThrow(/minSupportedVersionCode/);
  });
});

describe('what this tree refuses to publish', () => {
  const badging = {
    packageName: 'com.royaraqamia.app',
    versionCode: 20001,
    versionName: '1.92.0+shell.20001',
  };
  const check = (overrides = {}) =>
    checkApkAgainstTree({
      badging,
      fingerprints: [RELEASE_FINGERPRINT],
      counter: 20001,
      assetlinksText: assetlinks,
      ...overrides,
    });

  it('accepts the APK this tree built, signed by a key Android already trusts', () => {
    expect(check()).toEqual([RELEASE_FINGERPRINT]);
  });

  it('refuses an APK for another package', () => {
    expect(() => check({ badging: { ...badging, packageName: 'com.example.test' } })).toThrow(
      /not com\.royaraqamia\.app/
    );
  });

  it('refuses a version code the counter disagrees with', () => {
    // The counter is what CI checks and what the app compares; an APK that
    // disagrees with it is a publish nobody can reason about.
    expect(() => check({ counter: 20002 })).toThrow(/shell-version\.properties/);
  });

  it('refuses a key assetlinks.json does not list', () => {
    expect(() => check({ fingerprints: ['AB'.repeat(32)] })).toThrow(/assetlinks/);
  });

  it('refuses an APK with no signer at all', () => {
    // What a release build without keystore.properties produces: apksigner prints
    // no certificate, and there is nothing Android would accept.
    expect(() => check({ fingerprints: [] })).toThrow(/assetlinks/);
  });
});

describe('the file that gets served', () => {
  it('writes the manifest the way the committed one is written', () => {
    // Same bytes means a publish is one line of diff, and no reformatting noise.
    expect(manifestText(JSON.parse(committedManifest))).toBe(committedManifest);
  });

  it('takes the asset name from the URL, which is why uploading needs the file named that', () => {
    expect(assetNameFromUrl('https://example.com/a/b/royaraqamia-shell.apk')).toBe(
      'royaraqamia-shell.apk'
    );
    expect(() => assetNameFromUrl('https://example.com/a/b/shell.apk.zip')).toThrow(/\.apk/);
  });

  it('takes the release tag from the URL the manifest publishes', () => {
    // Printed as the `gh release upload <tag>` that finishes a publish. It read
    // `download` until this was run against a real manifest.
    expect(
      releaseTagFromUrl(
        'https://github.com/royaraqamia/royaraqamia/releases/download/shell/royaraqamia-shell.apk'
      )
    ).toBe('shell');
    expect(() => releaseTagFromUrl('https://example.com/shell.apk')).toThrow(/release/);
  });

  it('hashes a file the way the manifest spells a hash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'android-publish-'));
    const file = join(dir, 'app.apk');
    writeFileSync(file, 'not really an apk');

    expect(sha256File(file)).toBe(createHash('sha256').update('not really an apk').digest('hex'));
  });
});

describe('where the next publish goes', () => {
  const LEGACY =
    'https://github.com/royaraqamia/royaraqamia/releases/download/shell/royaraqamia-shell.apk';

  it('names the asset after the version code', () => {
    expect(shellAssetName(20002)).toBe('royaraqamia-shell-20002.apk');
    expect(() => shellAssetName(0)).toThrow(/positive integer/);
    expect(() => shellAssetName('20002')).toThrow(/positive integer/);
  });

  it('keeps the host, the repository and the tag, and moves the asset name on', () => {
    expect(nextApkUrl(LEGACY, 20002)).toBe(
      'https://github.com/royaraqamia/royaraqamia/releases/download/shell/royaraqamia-shell-20002.apk'
    );
    // And once a versioned URL is published, the next one replaces only its name.
    expect(nextApkUrl(nextApkUrl(LEGACY, 20002), 20003)).toBe(
      'https://github.com/royaraqamia/royaraqamia/releases/download/shell/royaraqamia-shell-20003.apk'
    );
  });

  it('produces a URL whose last segment is the file that has to be uploaded', () => {
    // The invariant the staging step depends on: rename the file, break the channel.
    const url = nextApkUrl(LEGACY, 20002);
    expect(assetNameFromUrl(url)).toBe(shellAssetName(20002));
    expect(releaseTagFromUrl(url)).toBe('shell');
  });

  it('derives from the manifest the repository actually publishes', () => {
    const published = JSON.parse(readFileSync(resolve(REPO, 'public/android/latest.json'), 'utf8'));
    expect(nextApkUrl(published.apkUrl, published.versionCode + 1)).toBe(
      `https://github.com/royaraqamia/royaraqamia/releases/download/shell/royaraqamia-shell-${published.versionCode + 1}.apk`
    );
  });

  it('refuses to guess when the published URL is not a release URL it understands', () => {
    expect(() => nextApkUrl('', 20002)).toThrow(/pass --url/);
    expect(() => nextApkUrl(null, 20002)).toThrow(/pass --url/);
    expect(() => nextApkUrl('https://example.test/shell.apk', 20002)).toThrow(/pass --url/);
    expect(() =>
      nextApkUrl('https://github.com/royaraqamia/royaraqamia/releases/tag/shell', 20002)
    ).toThrow(/pass --url/);
  });
});

describe('whether there is anything to publish', () => {
  const published = { versionCode: 20001 };

  it('publishes when the counter is ahead of the manifest', () => {
    expect(publishVerdict({ counter: 20002, published })).toEqual({
      publish: true,
      reason: 'publishing 20002 over the published 20001',
    });
  });

  it('does nothing when the manifest already names this counter', () => {
    // The state right after a successful publish, and after any re-run of the
    // release workflow: not an error, just nothing to do.
    const verdict = publishVerdict({ counter: 20001, published });
    expect(verdict.publish).toBe(false);
    expect(verdict.reason).toMatch(/already published/);
  });

  it('does nothing when the manifest is ahead of this tree', () => {
    const verdict = publishVerdict({ counter: 20000, published });
    expect(verdict.publish).toBe(false);
    expect(verdict.reason).toMatch(/ahead of this tree/);
  });

  it('refuses a counter it cannot read, rather than guessing', () => {
    expect(() => publishVerdict({ counter: 0, published })).toThrow(/no usable counter/);
    expect(() => publishVerdict({ counter: '20002', published })).toThrow(/no usable counter/);
  });
});
