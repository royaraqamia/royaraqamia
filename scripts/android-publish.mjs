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
 *   npm run android:publish -- --released-at 2026-10-20 # the date to announce (UTC today by default)
 *   npm run android:publish -- --notes "…"  # what the dialog's body should say
 *   npm run android:publish -- --dry-run    # say everything, change nothing
 *   npm run android:publish -- --json       # one JSON line on stdout; the rest on stderr
 *   npm run android:publish -- --verdict    # just: is there anything to publish? (JSON, no build)
 *
 * The asset name and the release tag come from the version the APK carries — the
 * release is `android-1.0.3`, the asset `royaraqamia-1.0.3.apk` — so every
 * publish is a new, immutable release and the URL in the manifest names exactly
 * the bytes it hashed. `android-` keeps shell tags apart from the web train's.
 *
 * The bytes are served from our own origin (ADR-0047): the manifest points at
 * `/android/royaraqamia-1.0.3.apk`, which the site proxies to the Supabase Storage
 * bucket, and the GitHub release carries the same file as the archive. GitHub's
 * release assets are unreachable from at least one country this app has users in,
 * and an update nobody can download is not an update.
 *
 * Two callers use this. `.github/workflows/shell-release.yml` runs it on a push to
 * main that touches the shell, with `--json`, and does the uploads, the re-download
 * check and the manifest commit itself; the keystore comes from repository secrets
 * there. Run by hand it is the same publish, printing the `curl`, `gh` and `git`
 * commands for you to run — with `--dry-run` to see all of it and touch nothing.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MANIFEST_PATH,
  parseShellVersion,
  parseShellVersionName,
  SHELL_VERSION_PATH,
  shellVersionNameFor,
  versionNameVerdict,
} from './android-shell-version.mjs';
import { assertWebViewDebuggingOff } from './android-config-guard.mjs';

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
  'rollout',
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
 * The date is the day a version was announced — `2026-10-20`, no time — because
 * that is all the manifest has ever said and all a device shows.
 *
 * It comes from the clock of the publish, not from the commit being released: a
 * workflow can be dispatched or re-run days after a merge, and a device asking
 * when this build appeared wants the day it appeared. Re-publishing the same
 * version keeps the date it was first published, because that is the same
 * release; any other version gets the current UTC date and never the previous
 * manifest's. `--released-at` wins over all of that so a wrong date can be
 * corrected by hand.
 */
export function resolveReleasedAt({ previous, versionCode, releasedAt, now = new Date() }) {
  if (releasedAt !== undefined) return releasedAt;
  const sameVersion =
    Number(previous?.versionCode ?? 0) === versionCode && isManifestDate(previous?.releasedAt);
  return sameVersion ? previous.releasedAt : now.toISOString().slice(0, 10);
}

/** Whether a value is a real calendar date, spelled the way the manifest spells it. */
export function isManifestDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * The manifest, from the APK and the manifest that is already published.
 *
 * `minSupportedVersionCode` is the floor below which a shell is told its update
 * cannot wait; it is carried forward unless raised deliberately, because
 * lowering it is how a device would be told to stop caring.
 *
 * Everything else is an input. In particular `releasedAt` is never copied from
 * the previous manifest: a publish that did not say when it happened used to keep
 * the date of the first release that ever set it, and described every release
 * after it with that day. A date that is wrong is worse than no date at all.
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
  rollout = 100,
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
  if (!Number.isInteger(rollout) || rollout < 0 || rollout > 100) {
    throw new Error(`rollout must be an integer from 0 to 100, got ${JSON.stringify(rollout)}`);
  }

  if (!isManifestDate(releasedAt)) {
    throw new Error(
      `releasedAt must be a real date as YYYY-MM-DD, got ${JSON.stringify(releasedAt)}.\n` +
        'It is never copied from the previous manifest; say when this publish happened.'
    );
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
    rollout,
    notes: notes ?? previous?.notes ?? '',
    releasedAt,
  };
}

/**
 * Where a published APK is served from — our own origin, not GitHub's.
 *
 * A release asset was reachable everywhere except at least one country this app
 * has users in, and an update that cannot be downloaded is not an update. The
 * bytes live in a Supabase Storage bucket and the site proxies this path to it
 * (`next.config.js`), so the only host a device needs is the one it already loads
 * the app from. The GitHub release keeps the same file as the permanent archive
 * (ADR-0047).
 */
export const APK_ORIGIN = 'https://royaraqamia.com/android';

/** The bucket `APK_ORIGIN` is proxied to, and where a publish uploads. */
export const STORAGE_BUCKET = 'android';

/** The URL a version is published at: `/android/royaraqamia-1.0.3.apk`. */
export function apkUrlFor(versionName) {
  return `${APK_ORIGIN}/${shellAssetName(versionName)}`;
}

/**
 * What the published asset is called: `royaraqamia-1.0.3.apk`.
 *
 * One file per version, and the manifest points at that exact file. The
 * alternative — one name that each publish overwrites — means a device that read
 * a manifest can download bytes that no longer match the hash in it. They would be
 * refused, so it fails safe, but "sometimes the update just does not work" is not
 * a failure mode a release channel should have.
 *
 * The name is the shell's own version rather than the counter, because it is what
 * a person reads: `royaraqamia-1.0.3.apk` says which app version it is. No `shell`
 * in it: every file a user downloads from this repository is an APK of this app,
 * and the release tag already says which line it belongs to.
 */
export function shellAssetName(versionName) {
  validateVersionName(versionName);
  return `royaraqamia-${versionName}.apk`;
}

/**
 * The release each version lives in: `android-1.0.3`.
 *
 * A channel release (`shell`) needed a `--clobber` upload that raced a device
 * mid-download; a release per version means the tag in a published URL can never
 * be rewritten to other bytes, and the releases list reads as a version list.
 * `android-` next to the web train's `web-` prefix says which app a tag belongs to.
 */
export function shellReleaseTag(versionName) {
  validateVersionName(versionName);
  return `android-${versionName}`;
}

function validateVersionName(versionName) {
  if (!/^\d+\.\d+\.\d+$/.test(String(versionName))) {
    throw new Error(`a shell version is major.minor.patch, got ${JSON.stringify(versionName)}`);
  }
}

/**
 * What the release is called: `android-1.0.3` — the same string as its tag.
 *
 * A title that says something else (`Android shell 1.0.3 (20003)`) makes the
 * releases list and the tags list disagree about one release, and the prefix is
 * already how a reader tells the two release lines apart. The version code lives
 * in the release body, where a support conversation can find it.
 */
export function shellReleaseTitle(versionName) {
  return shellReleaseTag(versionName);
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
 * These are the ways a publish goes wrong without anyone noticing: an APK built
 * from another package, an APK whose version code disagrees with the counter CI
 * checks, an APK whose name disagrees with the name derived from that same
 * counter (which is what a user reads in their settings), and an APK signed with
 * a key that is not the one Android has for the installed app — which is
 * unrecoverable for any device that has it, because the signature can never
 * change.
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

  const expectedName = shellVersionNameFor(counter);
  if (badging.versionName !== expectedName) {
    throw new Error(
      `the APK says versionName ${JSON.stringify(badging.versionName)}, but counter ${counter} means ${expectedName}.\n` +
        'Both numbers come from android/shell-version.properties, so this build did not read the file\n' +
        'this tree has. Rebuild after bumping: npm run android:shell-version -- --bump.'
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
  const versionText = readFileSync(SHELL_VERSION_PATH, 'utf8');
  const counter = parseShellVersion(versionText);
  const versionName = parseShellVersionName(versionText);

  // The name is derived from the counter, so a mismatch means the file was
  // hand-edited. Said here, before a build: it is cheaper than signing 7 MB and
  // then refusing it.
  const nameCheck = versionNameVerdict({ code: counter, name: versionName });
  if (!nameCheck.matches) {
    throw new Error(
      `android/shell-version.properties says shellVersionName=${versionName} for counter ${counter},\n` +
        `but that counter means ${nameCheck.expected}. The name is derived, not typed — write both with:\n` +
        '  npm run android:shell-version -- --bump'
    );
  }

  // The cheapest question first, and the only one a push that changed nothing
  // native needs answered: is there a publish here at all? No build, no keystore.
  if (argv.includes('--verdict')) {
    const verdict = publishVerdict({ counter, published: previous });
    // `versionName` rides along because the workflow names the storage object after
    // it before the build: a version that is already published is adopted, not
    // rebuilt, and the run has to know which file to look for (ADR-0069).
    log(
      JSON.stringify({
        ...verdict,
        counter,
        published: Number(previous?.versionCode ?? 0),
        versionName,
      })
    );
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

  // Checked after the build, not before it: the build's own `cap sync` is what
  // writes the config this would read, and a `npm run android:test` before it
  // leaves a debug config that a pre-build check would refuse (issue #398).
  // `android:release` refuses earlier itself, so this only catches a build made
  // with the check bypassed — and the `--apk` path, which builds nothing here.
  assertWebViewDebuggingOff({ label: 'android:publish' });

  apkPath = resolve(apkPath);
  if (!existsSync(apkPath)) throw new Error(`no APK at ${apkPath}`);

  const { badging, fingerprints } = inspect(apkPath);
  const trusted = checkApkAgainstTree({
    badging,
    fingerprints,
    counter,
    assetlinksText: readFileSync(ASSETLINKS_PATH, 'utf8'),
  });

  const apkUrl = valueOf('--url') ?? apkUrlFor(versionName);
  const min =
    valueOf('--min') === undefined ? previous.minSupportedVersionCode : Number(valueOf('--min'));
  const rollout = valueOf('--rollout') === undefined ? 100 : Number(valueOf('--rollout'));
  const manifest = stampManifest({
    previous,
    versionCode: badging.versionCode,
    versionName: badging.versionName,
    apkUrl,
    sha256: sha256File(apkPath),
    sizeBytes: statSync(apkPath).size,
    notes: valueOf('--notes'),
    releasedAt: resolveReleasedAt({
      previous,
      versionCode: badging.versionCode,
      releasedAt: valueOf('--released-at'),
    }),
    minSupportedVersionCode: min,
    rollout,
  });

  const asset = shellAssetName(manifest.versionName);
  const staged = join(STAGING_DIR, asset);
  const megabytes = (manifest.sizeBytes / (1024 * 1024)).toFixed(1);
  const tag = shellReleaseTag(manifest.versionName);
  const releaseTitle = shellReleaseTitle(manifest.versionName);

  const summary = {
    versionCode: manifest.versionCode,
    versionName: manifest.versionName,
    apkUrl: manifest.apkUrl,
    sha256: manifest.sha256,
    sizeBytes: manifest.sizeBytes,
    minSupportedVersionCode: manifest.minSupportedVersionCode,
    rollout: manifest.rollout,
    notes: manifest.notes,
    releasedAt: manifest.releasedAt,
    signedBy: trusted[0],
    tag,
    asset,
    releaseTitle,
    storageBucket: STORAGE_BUCKET,
    apkPath,
  };

  if (!json) {
    log('');
    log(`signed by      ${trusted[0]}`);
    log(`version        ${manifest.versionName} (versionCode ${manifest.versionCode})`);
    log(`sha256         ${manifest.sha256}`);
    log(`size           ${manifest.sizeBytes} bytes (${megabytes} MB)`);
    log(`rollout        ${manifest.rollout}%`);
    log(`release        ${tag} — "${releaseTitle}"`);
    log(`published URL  ${manifest.apkUrl}`);
    log(`released       ${manifest.releasedAt}`);
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

  // An adopted build was compiled by an earlier run, so this job never ran Gradle
  // and the staging directory does not exist yet. `--apk` is the resume path
  // (ADR-0069), and it still has to stage the file it stamped.
  mkdirSync(STAGING_DIR, { recursive: true });
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
  log(`Publish the bytes first — the manifest names the hash of whatever a device`);
  log(`will fetch, and that URL serves the bucket, not this machine:`);
  log(`  curl -sS -X POST "$SUPABASE_URL/storage/v1/object/${STORAGE_BUCKET}/${asset}" \\`);
  log('    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \\');
  log('    -H "Content-Type: application/vnd.android.package-archive" \\');
  log('    -H "cache-control: max-age=31536000" -H "x-upsert: false" \\');
  log(`    --data-binary @"${staged}"`);
  log('');
  log(`The GitHub release is the archive, and is not what a device downloads:`);
  log(`  gh release create ${tag} "${staged}" --latest --target main \\`);
  log(`    --title "${releaseTitle}" --notes "<what changed>"`);
  log('');
  log('Re-running a publish that already happened is not an upload: the name belongs to this');
  log('version, and the bytes are checked against what is already there.');
  log('');
  log('Then land the manifest so the site serves it:');
  log(
    `  git add public/android/latest.json && git commit -m "chore(android): publish shell ${versionName} (${manifest.versionCode})"`
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
