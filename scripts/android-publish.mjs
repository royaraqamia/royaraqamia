#!/usr/bin/env node
/**
 * Publishes a shell APK (ADR-0043, ADR-0044).
 *
 * `public/android/latest.json` is what every installed shell compares itself
 * with, so the manifest and the APK have to agree on three things that are easy
 * to get wrong by hand: the version code, the file's size, and its SHA-256. This
 * reads all three out of the built APK instead of asking anyone to type them,
 * and refuses to publish an APK that this tree did not mean to publish:
 *
 * - **It must be signed**, or the download would install nothing.
 * - **It must be signed by a key `public/.well-known/assetlinks.json` lists**, or
 *   the install would fail on every device that already has the app — and a
 *   wrong key is unrecoverable for that device, since Android requires the same
 *   signature forever.
 * - **Its version code must match `android/shell-version.properties`**, or the
 *   counter CI checks and the APK users get would disagree.
 *
 * Usage:
 *   npm run android:publish                 # build the signed APK, then stamp the manifest
 *   npm run android:publish -- --apk <path> # stamp from an APK already built
 *   npm run android:publish -- --min 20005  # also raise the floor shells must meet
 *   npm run android:publish -- --notes "…"  # what the dialog's body should say
 *   npm run android:publish -- --dry-run    # say everything, change nothing
 *   npm run android:publish -- --json       # one JSON line on stdout; the rest on stderr
 *   npm run android:publish -- --verdict    # just: is there anything to publish? (JSON, no build)
 *
 * The asset name comes from the version code — `royaraqamia-shell-20002.apk` — so
 * every publish is a new, immutable file and the URL in the manifest names exactly
 * the bytes it hashed. The release tag stays `shell`: a channel everything is
 * attached to, not a per-version release.
 *
 * Two callers use this. `.github/workflows/shell-release.yml` runs it on a push to
 * main that touches the shell, with `--json`, and does the upload, the re-download
 * check and the manifest commit itself; the keystore comes from repository secrets
 * there. Run by hand it is the same publish, printing the `gh` and `git` commands
 * for you to run — with `--dry-run` to see all of it and touch nothing.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MANIFEST_PATH, parseShellVersion, SHELL_VERSION_PATH } from './android-shell-version.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETLINKS_PATH = join(ROOT, 'public/.well-known/assetlinks.json');
const BUILT_APK = join(ROOT, 'android/app/build/outputs/apk/release/app-release.apk');
const STAGING_DIR = join(ROOT, 'android/app/build/outputs/apk/release');

/** The keys the manifest carries, in the order it carries them. */
export const MANIFEST_KEYS = [
  'versionCode',
  'versionName',
  'apkUrl',
  'sha256',
  'sizeBytes',
  'minSupportedVersionCode',
  'notes',
  'releasedAt',
];

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** The `package:` line of `aapt2 dump badging`. */
export function parseBadging(text) {
  const line = text.split(/\r?\n/).find((candidate) => candidate.startsWith('package: '));
  if (!line) throw new Error('aapt2 printed no `package:` line');
  const quoted = (key) => new RegExp(`${key}='([^']*)'`).exec(line)?.[1];
  const versionCode = Number(quoted('versionCode'));
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    throw new Error(`aapt2 reported no usable versionCode: ${line}`);
  }
  return {
    packageName: quoted('name') ?? '',
    versionCode,
    versionName: quoted('versionName') ?? '',
  };
}

/** Fingerprints in one shape, so two spellings of the same key compare equal. */
export function normalizeFingerprint(value) {
  return value.replace(/:/g, '').toUpperCase();
}

export function parseSignerFingerprints(text) {
  return [
    ...text.matchAll(/(?:certificate|Signer)[^\n]*SHA-256 digest:\s*([0-9a-fA-F:]{64,95})/g),
  ].map((match) => normalizeFingerprint(match[1]));
}

export function listedFingerprints(assetlinksText) {
  return [...assetlinksText.matchAll(/[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){31}/g)].map((match) =>
    normalizeFingerprint(match[0])
  );
}

/**
 * Whether Android would accept an APK signed by one of these keys as an update
 * to the installed app: `assetlinks.json` lists exactly the signing keys this
 * project uses, because App Links verification depends on them.
 */
export function isTrustedSigner(assetlinksText, fingerprints) {
  const listed = listedFingerprints(assetlinksText);
  return fingerprints
    .map(normalizeFingerprint)
    .filter((fingerprint) => listed.includes(fingerprint));
}

/**
 * The manifest, from the APK and the manifest that is already published.
 *
 * `minSupportedVersionCode` is the floor below which a shell is told its update
 * cannot wait; it is carried forward unless raised deliberately, because
 * lowering it is how a device would be told to stop caring.
 */
export function stampManifest({
  previous,
  versionCode,
  versionName,
  apkUrl,
  sha256,
  sizeBytes,
  notes,
  releasedAt,
  minSupportedVersionCode,
}) {
  if (!/^https:\/\/\S+$/.test(apkUrl ?? '')) {
    throw new Error(`apkUrl must be an https URL, got ${JSON.stringify(apkUrl)}`);
  }
  if (!/^[0-9a-f]{64}$/.test(String(sha256))) {
    throw new Error(`sha256 must be 64 hex characters, got ${JSON.stringify(sha256)}`);
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error(`sizeBytes must be a positive integer, got ${JSON.stringify(sizeBytes)}`);
  }
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    throw new Error(`versionCode must be a positive integer, got ${JSON.stringify(versionCode)}`);
  }

  const previousCode = Number(previous?.versionCode ?? 0);
  if (versionCode < previousCode) {
    throw new Error(
      `the published version cannot go backwards (${previousCode} -> ${versionCode}).\n` +
        'A device on a higher build would be told nothing, forever. Publish a higher one instead.'
    );
  }
  if (minSupportedVersionCode > versionCode) {
    throw new Error(
      `minSupportedVersionCode ${minSupportedVersionCode} is above the published ${versionCode}:\n` +
        'every shell that could install this would be told it is too old.'
    );
  }

  return {
    versionCode,
    versionName,
    apkUrl,
    sha256,
    sizeBytes,
    minSupportedVersionCode,
    notes: notes ?? previous?.notes ?? '',
    releasedAt: releasedAt ?? previous?.releasedAt ?? '',
  };
}

/** The asset name the published URL ends in — the file has to carry it exactly. */
export function assetNameFromUrl(apkUrl) {
  const name = basename(new URL(apkUrl).pathname);
  if (!name.toLowerCase().endsWith('.apk')) {
    throw new Error(`the published URL does not end in an .apk name: ${apkUrl}`);
  }
  return name;
}

/**
 * The release tag in a published URL — the segment before the asset name, which
 * is `shell` for `/releases/download/shell/royaraqamia-shell.apk`. Printed as
 * part of the `gh release upload` that finishes a publish, so it has to be the
 * tag and not, say, `download`.
 */
export function releaseTagFromUrl(apkUrl) {
  const segments = new URL(apkUrl).pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new Error(`the published URL names no release: ${apkUrl}`);
  }
  return segments[segments.length - 2];
}

/**
 * What the published asset is called for a version: `royaraqamia-shell-20002.apk`.
 *
 * One file per version code, and the manifest points at that exact file. The
 * alternative — one name that each publish overwrites — means a device that read
 * a manifest can download bytes that no longer match the hash in it. They would be
 * refused, so it fails safe, but "sometimes the update just does not work" is not
 * a failure mode a release channel should have. Per-version files also mean an
 * older manifest keeps working forever.
 */
export function shellAssetName(versionCode) {
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    throw new Error(`a version code is a positive integer, got ${JSON.stringify(versionCode)}`);
  }
  return `royaraqamia-shell-${versionCode}.apk`;
}

/**
 * The URL the next publish should name, derived from the one that is published
 * now: same host, same repository, same release tag, and the asset name for the
 * new version code.
 *
 * Derived rather than typed, because the two things that matter about it — that it
 * ends in the asset's name, and that it is where the file will be uploaded — are
 * the kind of detail a person gets wrong exactly once, silently. The old name is
 * ignored on purpose: `royaraqamia-shell.apk` was the first spelling, and a
 * manifest that still carries it has to move to the per-version name too.
 */
export function nextApkUrl(previousUrl, versionCode) {
  let url;
  try {
    url = new URL(previousUrl);
  } catch {
    throw new Error(
      `the manifest has no usable apkUrl to derive the next one from (${JSON.stringify(previousUrl)}); pass --url`
    );
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const downloadAt = segments.indexOf('download');
  if (url.hostname !== 'github.com' || downloadAt !== 3 || segments.length < downloadAt + 2) {
    throw new Error(
      `cannot derive the next asset URL from ${previousUrl} (expected a GitHub release URL); pass --url`
    );
  }

  const [owner, repo] = segments;
  const tag = segments[downloadAt + 1];
  return `https://github.com/${owner}/${repo}/releases/download/${tag}/${shellAssetName(versionCode)}`;
}

/**
 * Whether a publish is a thing that should happen at all.
 *
 * The automatic release runs on every push to main that touches the shell, and
 * most of those have nothing to say: a web release does not move the counter, and
 * a re-run of a workflow is not a second release. The counter is the signal — it
 * moves only when the shell changed — so the comparison against what is published
 * is what decides, in one tested place rather than in a shell `if`.
 */
export function publishVerdict({ counter, published }) {
  if (!Number.isInteger(counter) || counter <= 0) {
    throw new Error(
      `android/shell-version.properties has no usable counter (${JSON.stringify(counter)})`
    );
  }
  const publishedCode = Number(published?.versionCode ?? 0);

  if (publishedCode === counter) {
    return {
      publish: false,
      reason: `shell ${counter} is already published; a new APK needs the counter to move`,
    };
  }
  if (publishedCode > counter) {
    return {
      publish: false,
      reason:
        `the manifest publishes ${publishedCode}, ahead of this tree's ${counter}: nothing to publish ` +
        '(a publish that went backwards is refused anyway)',
    };
  }
  return {
    publish: true,
    reason: `publishing ${counter} over the published ${publishedCode}`,
  };
}

/** The one package this manifest may ever point at. */
export const PACKAGE_NAME = 'com.royaraqamia.app';

/**
 * Whether the APK is the one this tree means to publish, as a thrown reason when
 * it is not, and the signing keys that passed.
 *
 * These are the three ways a publish goes wrong without anyone noticing: an APK
 * built from another package, an APK whose version code disagrees with the counter
 * CI checks, and an APK signed with a key that is not the one Android has for the
 * installed app — which is unrecoverable for any device that has it, because the
 * signature can never change.
 */
export function checkApkAgainstTree({ badging, fingerprints, counter, assetlinksText }) {
  if (badging.packageName !== PACKAGE_NAME) {
    throw new Error(`that APK is ${badging.packageName}, not ${PACKAGE_NAME}`);
  }
  if (badging.versionCode !== counter) {
    throw new Error(
      `the APK says versionCode ${badging.versionCode}, android/shell-version.properties says ${counter}.\n` +
        'Rebuild after bumping the counter (npm run android:shell-version -- --bump).'
    );
  }

  const trusted = isTrustedSigner(assetlinksText, fingerprints);
  if (trusted.length === 0) {
    throw new Error(
      `no signing key matches public/.well-known/assetlinks.json:\n  APK: ${fingerprints.join('\n       ') || '(unsigned)'}\n` +
        'Android requires the same key as the installed app; a device that has the app could not\n' +
        'install this, and its App Links would stop verifying. Check which keystore was used.'
    );
  }
  return trusted;
}

function sdkTool(name) {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('ANDROID_HOME (or ANDROID_SDK_ROOT) must point at the Android SDK');
  const buildTools = join(sdk, 'build-tools');
  const versions = readdirSync(buildTools).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  for (const version of versions.reverse()) {
    for (const candidate of [`${name}.bat`, `${name}.exe`, name]) {
      const tool = join(buildTools, version, candidate);
      if (existsSync(tool)) return tool;
    }
  }
  throw new Error(`${name} is not in ${buildTools}`);
}

function runTool(tool, args) {
  const isWindows = process.platform === 'win32';
  const quoted = [tool, ...args].map((part) => `"${part}"`).join(' ');
  const result = spawnSync(isWindows ? quoted : tool, isWindows ? [] : args, {
    encoding: 'utf8',
    shell: isWindows,
  });
  if (result.error) throw new Error(`${basename(tool)} failed to run: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `${basename(tool)} ${args.join(' ')} exited ${result.status}:\n${result.stdout ?? ''}${result.stderr ?? ''}`
    );
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function inspect(apkPath) {
  const badging = parseBadging(runTool(sdkTool('aapt2'), ['dump', 'badging', apkPath]));
  const fingerprints = parseSignerFingerprints(
    runTool(sdkTool('apksigner'), ['verify', '--print-certs', apkPath])
  );
  if (fingerprints.length === 0) {
    throw new Error(
      `the APK is unsigned: ${apkPath}\n` +
        'That is what a release build without keystore.properties looks like. Publishing it would\n' +
        'hand users a file Android refuses to install.'
    );
  }
  return { badging, fingerprints };
}

export function manifestText(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function main({ argv = process.argv.slice(2), log = console.log } = {}) {
  const dryRun = argv.includes('--dry-run');
  const json = argv.includes('--json');
  // With --json the human text goes to stderr, so a caller can read stdout as a
  // single JSON line without filtering anything out of it.
  const note = json ? (...parts) => console.error(...parts) : log;
  const valueOf = (flag) => {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
  };

  const previous = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8').replace(/^\uFEFF/, ''));
  const counter = parseShellVersion(readFileSync(SHELL_VERSION_PATH, 'utf8'));

  // The cheapest question first, and the only one a push that changed nothing
  // native needs answered: is there a publish here at all? No build, no keystore.
  if (argv.includes('--verdict')) {
    const verdict = publishVerdict({ counter, published: previous });
    log(JSON.stringify({ ...verdict, counter, published: Number(previous?.versionCode ?? 0) }));
    return 0;
  }

  let apkPath = valueOf('--apk') ?? BUILT_APK;
  if (!valueOf('--apk')) {
    if (!existsSync(join(ROOT, 'keystore.properties'))) {
      throw new Error(
        'keystore.properties is missing, so a release build would be unsigned and uninstallable.\n' +
          'It lives outside the repository — see docs/mobile/android-shell.md.'
      );
    }
    note('Building the signed release APK (npm run android:release)…');
    const build = spawnSync('npm run android:release', {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });
    if (build.status !== 0) throw new Error('the release build failed; nothing was published');
  }

  apkPath = resolve(apkPath);
  if (!existsSync(apkPath)) throw new Error(`no APK at ${apkPath}`);

  const { badging, fingerprints } = inspect(apkPath);
  const trusted = checkApkAgainstTree({
    badging,
    fingerprints,
    counter,
    assetlinksText: readFileSync(ASSETLINKS_PATH, 'utf8'),
  });

  const apkUrl = valueOf('--url') ?? nextApkUrl(previous.apkUrl, badging.versionCode);
  const min =
    valueOf('--min') === undefined ? previous.minSupportedVersionCode : Number(valueOf('--min'));
  const manifest = stampManifest({
    previous,
    versionCode: badging.versionCode,
    versionName: badging.versionName,
    apkUrl,
    sha256: sha256File(apkPath),
    sizeBytes: statSync(apkPath).size,
    notes: valueOf('--notes'),
    releasedAt: valueOf('--released-at'),
    minSupportedVersionCode: min,
  });

  const asset = assetNameFromUrl(manifest.apkUrl);
  const staged = join(STAGING_DIR, asset);
  const megabytes = (manifest.sizeBytes / (1024 * 1024)).toFixed(1);
  const tag = releaseTagFromUrl(manifest.apkUrl);

  const summary = {
    versionCode: manifest.versionCode,
    versionName: manifest.versionName,
    apkUrl: manifest.apkUrl,
    sha256: manifest.sha256,
    sizeBytes: manifest.sizeBytes,
    minSupportedVersionCode: manifest.minSupportedVersionCode,
    notes: manifest.notes,
    releasedAt: manifest.releasedAt,
    signedBy: trusted[0],
    tag,
    asset,
    apkPath,
  };

  if (!json) {
    log('');
    log(`signed by      ${trusted[0]}`);
    log(`versionCode    ${manifest.versionCode} (${manifest.versionName})`);
    log(`sha256         ${manifest.sha256}`);
    log(`size           ${manifest.sizeBytes} bytes (${megabytes} MB)`);
    log(`published URL  ${manifest.apkUrl}`);
    if (manifest.versionCode === previous.versionCode) {
      log('');
      log(`Note: ${previous.versionCode} was already published. Devices that installed it already`);
      log('will not be told anything until a higher versionCode exists.');
    }
  }

  if (dryRun) {
    note('');
    note('--dry-run: nothing written.');
    if (json) log(JSON.stringify({ ...summary, stagedPath: null, wroteManifest: false }));
    return 0;
  }

  copyFileSync(apkPath, staged);
  writeFileSync(MANIFEST_PATH, manifestText(manifest));

  if (json) {
    log(JSON.stringify({ ...summary, stagedPath: staged, wroteManifest: true }));
    return 0;
  }

  log('');
  log(`staged   ${staged}`);
  log(`stamped  ${MANIFEST_PATH}`);
  log('');
  log('Upload it — the asset name is what the published URL ends in, so it is not a rename');
  log('that can be skipped. There is no --clobber: this name belongs to this version code,');
  log('and an upload that finds it already there is a publish that has already happened:');
  log(`  gh release upload ${tag} "${staged}"`);
  log('');
  log(`The tag is a channel, not a version (it is "${tag}" for every publish), so the first`);
  log('publish has to create the release once — with --latest=false, so "Latest" stays on the');
  log('version releases where a reader expects it:');
  log(
    `  gh release create ${tag} "${staged}" --title "Android shell (latest)" --latest=false --target main`
  );
  log('');
  log('Then land the manifest so the site serves it — the asset has to be up first, because');
  log('the manifest names the hash of what it points at:');
  log(
    `  git add public/android/latest.json && git commit -m "chore(android): publish shell ${manifest.versionCode}"`
  );
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
