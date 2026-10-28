#!/usr/bin/env node
/**
 * The Android release train (ADR-0089): grade a batch, write one version, and
 * collect the user-facing notes that batch is allowed to ship with.
 *
 * A shell release used to be "one commit, one APK": push a native change, the
 * counter moves, a new APK is published, and every user is prompted — twenty-one
 * times in the first weeks of the shell. Nothing about that is how a native app
 * ships. This script is the alternative:
 *
 *   - **A batch, not a commit.** Everything native since the last `android-*`
 *     release is graded together, so a week of small fixes is one update.
 *   - **A version that means something.** `!`/BREAKING → major, `feat` → minor,
 *     anything else → patch, graded over the batch only. The name is semantic,
 *     the code is derived from it (scripts/android-shell-version.mjs).
 *   - **Notes written by a person, in Arabic.** A pull request that changes the
 *     shell adds a file under `android/release-notes/unreleased/`; the cut folds
 *     them into the release. The cut refuses to ship without one, and so does the
 *     pull-request check — a changelog that is optional is a changelog nobody
 *     writes.
 *
 * Usage:
 *   node scripts/android-release.mjs --plan [--min-age-days 6] [--force] [--json]
 *   node scripts/android-release.mjs --apply [--released-at YYYY-MM-DD] [--json]
 *   node scripts/android-release.mjs --check-notes <base>     # CI, on a pull request
 *   node scripts/android-release.mjs --health [--max-age-days 9]
 *
 * `--plan` is read-only and is the first thing the train asks. `--apply` writes
 * the version, the notes archive and `public/android/changelog.json`; the
 * workflow uploads the APK, and only then commits all of it together.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  nextShellVersion,
  parseShellTag,
  parseShellVersion,
  parseShellVersionName,
  shellChangeVerdict,
  shellVersionCodeFor,
  shellVersionNameFor,
  writeShellVersionFor,
} from './android-shell-version.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const NOTES_ROOT = 'android/release-notes';
export const UNRELEASED_DIR = `${NOTES_ROOT}/unreleased`;
export const CHANGELOG_PATH = 'public/android/changelog.json';
const MANIFEST_PATH = 'public/android/latest.json';
const SHELL_VERSION_PATH = 'android/shell-version.properties';

/**
 * The files a cut writes about itself — the version, the notes, the manifest and
 * the site's changelog. They land in one commit *after* the release is published,
 * so from the next run's point of view they sit between the release tag and
 * `HEAD`. They are not a shell change: counting them would give every release a
 * follow-up release of its own, once a week, forever.
 */
export const RELEASE_BOOKKEEPING = [
  'android/shell-version.properties',
  `${NOTES_ROOT}/`,
  'public/android/',
];

export function isReleaseBookkeeping(file) {
  return RELEASE_BOOKKEEPING.some((entry) => file === entry || file.startsWith(entry));
}

/** How many releases the site's changelog keeps. */
export const CHANGELOG_LIMIT = 20;

/** The weekly cadence, with a day of slack for GitHub's best-effort schedule. */
export const RELEASE_CADENCE_DAYS = 7;
export const MIN_AGE_DAYS = RELEASE_CADENCE_DAYS - 1;
export const STALE_DAYS = RELEASE_CADENCE_DAYS + 2;

const BREAKING = /^[a-z]+(\(.*\))?!:/i;
const BREAKING_BODY = /BREAKING CHANGE\s*:/;
const FEATURE = /^feat(\(.*\))?!?:/i;
const INVISIBLE_PREFIX = /^[\uFEFF\u200B\u200C\u200D\u2060]+/;

function normalize(subject) {
  return String(subject ?? '').replace(INVISIBLE_PREFIX, '');
}

/** One release level for a batch: the highest level any of its commits asks for. */
export function gradeBump(messages) {
  let level = 'patch';
  for (const message of messages) {
    const text = normalize(message);
    const firstLine = text.split('\n', 1)[0] ?? '';
    if (BREAKING.test(firstLine) || BREAKING_BODY.test(text)) return 'major';
    if (FEATURE.test(firstLine)) level = 'minor';
  }
  return level;
}

/** Bullets from note fragments, ordered by filename, without repeats. */
export function notesFromFragments(fragments) {
  const ordered = [...fragments].sort((a, b) => a.name.localeCompare(b.name));
  const seen = new Set();
  const notes = [];
  for (const fragment of ordered) {
    for (const raw of String(fragment.text ?? '').split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      // A fragment is a list. A line that is not one is prose a person left in
      // the file by accident, and dropping it silently would lose the note — so
      // it is kept, with the marker a list line already carries.
      const note = line.startsWith('- ') ? line.slice(2).trim() : line;
      const key = note.replace(/\s+/g, ' ').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      notes.push(note);
    }
  }
  return notes;
}

/** The archive file a release's notes are frozen into. */
export function archivePathFor(version) {
  return `${NOTES_ROOT}/${version}.md`;
}

/** The archive's Markdown: a heading and the bullets a user reads. */
export function composeReleaseNotes({ version, versionCode, notes, releasedAt }) {
  const lines = [
    `# ${version}`,
    '',
    `الإصدار ${version} (versionCode ${versionCode}) — ${releasedAt}`,
    '',
    ...notes.map((note) => `- ${note}`),
    '',
  ];
  return lines.join('\n');
}

/** The archived notes read back as bullets, for a resumed cut. */
export function notesFromArchive(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

/** What the manifest's one-line `notes` field says: the first bullet. */
export function summarizeNotes(notes, max = 160) {
  const first = String(notes?.[0] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

/**
 * The changelog the site serves: newest first, bounded. It is a plain file in
 * `public/` rather than the GitHub API on purpose — release assets are
 * unreachable from at least one country this app has users in (ADR-0047), and a
 * changelog that some users cannot load is the same defect in a smaller place.
 */
export function changelogWithRelease(existing, release, limit = CHANGELOG_LIMIT) {
  const releases = Array.isArray(existing?.releases) ? existing.releases : [];
  const withoutThisVersion = releases.filter((entry) => entry?.version !== release.version);
  return {
    releases: [
      {
        version: release.version,
        versionCode: release.versionCode,
        releasedAt: release.releasedAt,
        notes: release.notes,
      },
      ...withoutThisVersion,
    ].slice(0, limit),
  };
}

/**
 * Whether a release is due, and what it would be.
 *
 * Four answers matter, in this order: a cut that was written but never published
 * is resumed (its version is already committed, and re-grading would skip it); a
 * push with no native change has nothing to publish; the weekly train waits out
 * its own cadence unless it was dispatched by hand; and everything else is a
 * graded step from the last release.
 */
export function planRelease({
  shellChanged,
  reasons = [],
  baseVersion,
  messages = [],
  publishedCode = 0,
  committedCode = 0,
  committedVersion = null,
  ageDays = 0,
  minAgeDays = MIN_AGE_DAYS,
  force = false,
}) {
  if (committedCode > publishedCode) {
    return {
      release: true,
      resume: true,
      base: baseVersion ?? committedVersion,
      next: committedVersion ?? shellVersionNameFor(committedCode),
      versionCode: committedCode,
      bump: null,
      reason: `shell ${committedVersion ?? committedCode} was cut but never published; resuming it`,
    };
  }

  if (!shellChanged) {
    return {
      release: false,
      reason: 'no shell change since the last Android release; nothing to publish',
    };
  }

  if (!force && ageDays < minAgeDays) {
    return {
      release: false,
      reason: `the last Android release is ${ageDays} day(s) old; the train waits ${minAgeDays}`,
    };
  }

  const bump = gradeBump(messages);
  const base = baseVersion ?? '1.0.0';
  const next = nextShellVersion(base, bump);
  return {
    release: true,
    resume: false,
    base,
    next: next.name,
    versionCode: next.code,
    bump,
    reason: `${reasons.join(', ') || 'manual dispatch'}; ${bump} release from ${base}`,
  };
}

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(join(ROOT, path), 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

/** The newest `android-*` tag and its version, or null before the first release. */
export function latestShellRelease() {
  const tags = git(['tag', '--list', 'android-*'])
    .split('\n')
    .map((tag) => tag.trim())
    .map((tag) => ({ tag, version: parseShellTag(tag) }))
    .filter((entry) => entry.version !== null)
    .map((entry) => ({ ...entry, code: shellVersionCodeFor(entry.version) }))
    .sort((a, b) => b.code - a.code);
  return tags[0] ?? null;
}

function shellFilesSince(base) {
  if (!base) return [];
  return git(['diff', '--name-only', base, 'HEAD'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !isReleaseBookkeeping(file));
}

function shellMessagesSince(base) {
  if (!base) return [];
  return git([
    'log',
    `${base}..HEAD`,
    '--format=%s',
    '--',
    'android/',
    'capacitor.config.ts',
    'package.json',
  ])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** The oldest and newest shell commits since a base, as Unix seconds. */
function shellCommitDates(base) {
  if (!base) return [];
  return git([
    'log',
    `${base}..HEAD`,
    '--format=%ct',
    '--',
    'android/',
    'capacitor.config.ts',
    'package.json',
  ])
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function releaseAgeDays(base) {
  if (!base) return Number.POSITIVE_INFINITY;
  const committed = Number(git(['log', '-1', '--format=%ct', base]) || 0);
  if (!committed) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() / 1000 - committed) / 86400);
}

/** Fragments a pull request added or edited, newest files included. */
export function fragmentFiles(cwd = ROOT) {
  const dir = join(cwd, UNRELEASED_DIR);
  if (!existsSync(dir)) return [];
  return (
    readdirSync(dir)
      // `_README.md` documents the convention; a leading underscore keeps it from
      // being read as a note, since every other file here is one.
      .filter((name) => name.endsWith('.md') && !name.startsWith('_'))
      .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }))
  );
}

/** The plan, from the repository as it stands. */
export function planFromRepo({ minAgeDays = MIN_AGE_DAYS, force = false } = {}) {
  const published = readJson(MANIFEST_PATH, {});
  const versionText = readFileSync(join(ROOT, SHELL_VERSION_PATH), 'utf8');
  const committedCode = parseShellVersion(versionText);
  const committedVersion = parseShellVersionName(versionText);
  const lastRelease = latestShellRelease();
  const base = lastRelease?.tag ?? null;
  const change = shellChangeVerdict({
    files: shellFilesSince(base),
    basePackageJson: base ? git(['show', `${base}:package.json`]) : '',
    headPackageJson: readFileSync(join(ROOT, 'package.json'), 'utf8'),
  });

  // A cut can stop between publishing its APK and committing the manifest. The
  // tag then names a version no manifest announces, and the tree may or may not
  // carry its properties: whichever is ahead is the version to resume, so the
  // next run finishes that release instead of grading a fresh one on top of it.
  const tagAhead = lastRelease && lastRelease.code > committedCode ? lastRelease : null;
  const effectiveCode = Math.max(committedCode, lastRelease?.code ?? 0);
  const effectiveVersion = tagAhead ? tagAhead.version : committedVersion;
  // The manifest is the published truth; a tag can lag it (a release published
  // before tags existed, or a tag deleted by hand). Grading from the lower of the
  // two would re-issue a version the channel already serves.
  const publishedVersion =
    typeof published?.versionName === 'string' ? published.versionName : null;
  const publishedVersionCode = (() => {
    try {
      return publishedVersion ? shellVersionCodeFor(publishedVersion) : 0;
    } catch {
      return 0;
    }
  })();
  const baseVersion =
    publishedVersionCode > (lastRelease?.code ?? 0)
      ? publishedVersion
      : (lastRelease?.version ?? committedVersion);
  const ageDays = releaseAgeDays(base);

  const plan = planRelease({
    shellChanged: change.changesShell,
    reasons: change.reasons.slice(0, 3),
    baseVersion,
    messages: shellMessagesSince(base),
    publishedCode: Number(published?.versionCode ?? 0),
    committedCode: effectiveCode,
    committedVersion: effectiveVersion,
    ageDays: Number.isFinite(ageDays) ? ageDays : 0,
    minAgeDays,
    force,
  });

  const dates = shellCommitDates(base);
  const oldest = dates.length > 0 ? Math.min(...dates) : null;
  return {
    ...plan,
    lastRelease: lastRelease?.version ?? null,
    lastReleaseTag: base,
    oldestChangeAgeDays: oldest ? Math.floor((Date.now() / 1000 - oldest) / 86400) : 0,
    notes: plan.release ? resolveNotes(plan) : [],
  };
}

/** The notes a cut ships with: its archive if it has one, else the fragments. */
function resolveNotes(plan) {
  const archive = archivePathFor(plan.next);
  const archived = existsSync(join(ROOT, archive));
  if (archived) return notesFromArchive(readFileSync(join(ROOT, archive), 'utf8'));
  return notesFromFragments(fragmentFiles());
}

function valueOf(argv, flag) {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function main(argv = process.argv.slice(2), log = console.log) {
  const json = argv.includes('--json');
  const note = json ? (...parts) => console.error(...parts) : log;
  const minAgeDays = argv.includes('--min-age-days')
    ? Number(valueOf(argv, '--min-age-days'))
    : MIN_AGE_DAYS;
  const force = argv.includes('--force');

  if (argv.includes('--check-notes')) {
    const base = valueOf(argv, '--check-notes');
    if (!base) {
      log('usage: node scripts/android-release.mjs --check-notes <ref>');
      return 1;
    }
    const change = shellChangeVerdict({
      files: shellFilesSince(base),
      basePackageJson: git(['show', `${base}:package.json`]),
      headPackageJson: readFileSync(join(ROOT, 'package.json'), 'utf8'),
    });
    if (!change.changesShell) {
      log('no shell change; there is no release note to ask for.');
      return 0;
    }
    const added = git([
      'diff',
      '--name-only',
      '--diff-filter=AM',
      `${base}..HEAD`,
      '--',
      UNRELEASED_DIR,
    ])
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const notes = notesFromFragments(fragmentFiles());
    if (added.length === 0 || notes.length === 0) {
      log('This change touches the shell, so it ships to users — and it has no release note.');
      log('');
      log(`Add a file under ${UNRELEASED_DIR}/ with the sentence a user reads, in Arabic:`);
      log('  echo "- إصلاح: ..." > android/release-notes/unreleased/<slug>.md');
      log('');
      log("The weekly release folds every fragment into the APK's changelog (ADR-0089).");
      return 1;
    }
    log(
      `${added.length} release-note fragment(s), ${notes.length} note(s): this change says what it does.`
    );
    return 0;
  }

  if (argv.includes('--health')) {
    const maxAgeDays = argv.includes('--max-age-days')
      ? Number(valueOf(argv, '--max-age-days'))
      : STALE_DAYS;
    const plan = planFromRepo({ force: true });
    const stalled = Boolean(plan.release) && plan.oldestChangeAgeDays > maxAgeDays;
    note(
      stalled
        ? `a shell release is due and its oldest change is ${plan.oldestChangeAgeDays} day(s) old`
        : plan.release
          ? `a shell release is due (${plan.next}) but not yet overdue`
          : `the train is level: ${plan.reason}`
    );
    log(`stalled=${String(stalled)}`);
    log(`release=${String(Boolean(plan.release))}`);
    log(`next=${plan.next ?? ''}`);
    log(`age_days=${plan.oldestChangeAgeDays ?? 0}`);
    return 0;
  }

  const plan = planFromRepo({ minAgeDays, force });

  if (argv.includes('--plan')) {
    if (json) {
      log(JSON.stringify(plan));
    } else {
      if (plan.release) {
        log(`release ${plan.next} (versionCode ${plan.versionCode})`);
      }
      log(plan.reason);
      if (plan.notes?.length) {
        log('');
        for (const entry of plan.notes) log(`  - ${entry}`);
      }
    }
    return 0;
  }

  if (argv.includes('--apply')) {
    if (!plan.release) {
      log(`nothing to release: ${plan.reason}`);
      return 0;
    }
    const releasedAt = valueOf(argv, '--released-at') ?? today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(releasedAt)) {
      throw new Error(`--released-at is a YYYY-MM-DD date, got ${JSON.stringify(releasedAt)}`);
    }
    if (plan.notes.length === 0) {
      throw new Error(
        `shell ${plan.next} has no release note.\n` +
          `Write the sentence a user reads, in Arabic, under ${UNRELEASED_DIR}/ and re-run.`
      );
    }

    const versionText = readFileSync(join(ROOT, SHELL_VERSION_PATH), 'utf8');
    writeFileSync(
      join(ROOT, SHELL_VERSION_PATH),
      writeShellVersionFor(versionText, plan.next),
      'utf8'
    );

    writeFileSync(
      join(ROOT, archivePathFor(plan.next)),
      composeReleaseNotes({
        version: plan.next,
        versionCode: plan.versionCode,
        notes: plan.notes,
        releasedAt,
      }),
      'utf8'
    );

    for (const fragment of fragmentFiles().map((entry) => join(ROOT, UNRELEASED_DIR, entry.name))) {
      unlinkSync(fragment);
    }

    const existing = readJson(CHANGELOG_PATH, { releases: [] });
    const release = {
      version: plan.next,
      versionCode: plan.versionCode,
      releasedAt,
      notes: plan.notes,
    };
    writeFileSync(
      join(ROOT, CHANGELOG_PATH),
      `${JSON.stringify(changelogWithRelease(existing, release), null, 2)}\n`,
      'utf8'
    );

    const result = {
      version: plan.next,
      versionCode: plan.versionCode,
      releasedAt,
      notes: plan.notes,
      manifestNotes: summarizeNotes(plan.notes),
      archive: archivePathFor(plan.next),
      changelog: CHANGELOG_PATH,
      resumed: Boolean(plan.resume),
    };
    if (json) {
      log(JSON.stringify(result));
    } else {
      log(`cut ${plan.next} (versionCode ${plan.versionCode})`);
      log(`notes  ${result.archive}`);
      log(`site   ${result.changelog}`);
      for (const entry of plan.notes) log(`  - ${entry}`);
    }
    return 0;
  }

  log(
    'usage: node scripts/android-release.mjs (--plan [--min-age-days N] [--force] | --apply | --check-notes <ref> | --health) [--json]'
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
