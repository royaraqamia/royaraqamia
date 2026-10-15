import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  APK_ORIGIN,
  apkUrlFor,
  checkApkAgainstTree,
  isTrustedSigner,
  listedFingerprints,
  MANIFEST_KEYS,
  manifestText,
  normalizeFingerprint,
  parseBadging,
  parseSignerFingerprints,
  publishVerdict,
  sha256File,
  shellAssetName,
  shellReleaseTag,
  shellReleaseTitle,
  stampManifest,
  STORAGE_BUCKET,
} from '../android-publish.mjs';
import { shellVersionNameFor } from '../android-shell-version.mjs';

const REPO = process.cwd();
const assetlinks = readFileSync(resolve(REPO, 'public/.well-known/assetlinks.json'), 'utf8');
const committedManifest = readFileSync(resolve(REPO, 'public/android/latest.json'), 'utf8');

// Both of these are the real shapes, copied from aapt2 and apksigner output.
const BADGING = [
  "package: name='com.royaraqamia.app' versionCode='20001' versionName='1.0.1' platformBuildVersionName='16' platformBuildVersionCode='36' compileSdkVersion='36' compileSdkVersionCodename='16'",
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
      versionName: '1.0.1',
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
    versionName: '1.0.0',
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
      versionName: '1.0.1',
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
    versionName: '1.0.1',
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

  it('refuses an APK whose name disagrees with the counter', () => {
    // The name is what a user reads in Android's app info and in the app footer,
    // and it is derived from the same counter — so an APK carrying a different one
    // was built from a tree that is not this one.
    expect(() => check({ badging: { ...badging, versionName: '1.0.2' } })).toThrow(/versionName/);
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

  it('accepts the URL a publish writes as a manifest apkUrl', () => {
    // These two have to agree: `stampManifest` refuses anything that is not https,
    // and `apkUrlFor` is the only URL a publish ever writes.
    expect(
      stampManifest({
        previous: { versionCode: 20003 },
        versionCode: 20004,
        versionName: '1.0.4',
        apkUrl: apkUrlFor('1.0.4'),
        sha256: GOOD_SHA,
        sizeBytes: 1,
        minSupportedVersionCode: 20000,
      }).apkUrl
    ).toBe('https://royaraqamia.com/android/royaraqamia-1.0.4.apk');
  });

  it('hashes a file the way the manifest spells a hash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'android-publish-'));
    const file = join(dir, 'app.apk');
    writeFileSync(file, 'not really an apk');

    expect(sha256File(file)).toBe(createHash('sha256').update('not really an apk').digest('hex'));
  });
});

describe('where the next publish goes', () => {
  it('names the asset and the release after the version', () => {
    expect(shellAssetName('1.0.3')).toBe('royaraqamia-1.0.3.apk');
    expect(shellReleaseTag('1.0.3')).toBe('android-1.0.3');
    expect(shellReleaseTitle('1.0.3')).toBe('android-1.0.3');
    expect(() => shellAssetName('20003')).toThrow(/major\.minor\.patch/);
    expect(() => shellAssetName('1.0')).toThrow(/major\.minor\.patch/);
    expect(() => shellReleaseTag('v1.0.3')).toThrow(/major\.minor\.patch/);
  });

  it('serves it from our own origin, so no device depends on GitHub', () => {
    const url = apkUrlFor('1.0.4');

    expect(url).toBe(`${APK_ORIGIN}/royaraqamia-1.0.4.apk`);
    expect(new URL(url).origin).toBe('https://royaraqamia.com');
    expect(url).not.toContain('github');
    // The object in the bucket carries the same name as the file, which is what
    // makes one upload cover the site, the archive and the device.
    expect(new URL(url).pathname.split('/').pop()).toBe(shellAssetName('1.0.4'));
  });

  it('puts the version in the URL from one source, however the last one was published', () => {
    // ADR-0047 moved the host from GitHub's release assets to our own origin, and
    // the next publish moves with it without anyone passing --url: the URL is a
    // function of the version, not of the URL that came before it.
    const published = JSON.parse(readFileSync(resolve(REPO, 'public/android/latest.json'), 'utf8'));
    const next = shellVersionNameFor(published.versionCode + 1);

    expect(apkUrlFor(next)).toBe(`https://royaraqamia.com/android/royaraqamia-${next}.apk`);
    expect(STORAGE_BUCKET).toBe('android');
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
