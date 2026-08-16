import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, latestSemverTag, parseTag, formatTag } from './git-utils.mjs';

// Re-exported for the existing release-tools test suite.
export { parseTag, formatTag };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_LOCK = resolve(ROOT, 'package-lock.json');

export function readLatestTag() {
  return latestSemverTag();
}

export function isBreakingCommit(message) {
  const firstLine = (message || '').split('\n', 1)[0] ?? '';
  return /^[a-z]+!(\(.*\))?:/i.test(firstLine) || /BREAKING CHANGE\s*:/i.test(message || '');
}

export function isFeatCommit(message) {
  const firstLine = (message || '').split('\n', 1)[0] ?? '';
  return /^feat(\(.*\))?!/i.test(firstLine) ? false : /^feat(\b|\(|:)/i.test(firstLine);
}

export function nextVersion(currentVersion, message) {
  const current = parseTag(currentVersion) ?? { major: 0, minor: 0, patch: 0 };
  if (isBreakingCommit(message)) {
    return { major: current.major + 1, minor: 0, patch: 0 };
  }
  if (isFeatCommit(message)) {
    return { major: current.major, minor: current.minor + 1, patch: 0 };
  }
  return { major: current.major, minor: current.minor, patch: current.patch + 1 };
}

function isHigherBump(a, b) {
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch > b.patch;
}

/**
 * Aggregates the bump over every commit since the last tag and returns the
 * highest bump level found (breaking > feature > patch). Grading from a single
 * tip commit would let a trailing cosmetic commit (e.g. `style:`) downgrade a
 * feature release to a patch.
 */
export function nextVersionFromMessages(currentVersion, messages) {
  const current = parseTag(currentVersion) ?? { major: 0, minor: 0, patch: 0 };
  let best = null;
  for (const message of messages) {
    const next = nextVersion(currentVersion, message);
    if (!best || isHigherBump(next, best)) best = next;
  }
  return best ?? { major: current.major, minor: current.minor, patch: current.patch + 1 };
}

export function isReleaseCommit(message) {
  return /^chore\(release\):/i.test(message || '');
}

export function shouldSkipRelease({ headMessage, headTag }) {
  return isReleaseCommit(headMessage) && headTag !== null;
}

export function stripType(message) {
  const firstLine = (message || '').split('\n', 1)[0] ?? '';
  const noPrefix = firstLine.replace(/^[a-z]+(\(.*\))?!/i, '').replace(/^[a-z]+(\([^)]*\))?:/i, '');
  const cleaned = noPrefix.trim().replace(/\s+$/u, '');
  return cleaned || firstLine.trim();
}

const CHANGELOG_SECTIONS = [
  ['feat', 'Added'],
  ['fix', 'Fixed'],
  ['perf', 'Changed'],
  ['style', 'Changed'],
  ['docs', 'Changed'],
  ['refactor', 'Changed'],
  ['chore', 'Changed'],
  ['test', 'Changed'],
  ['ci', 'Changed'],
];

const ALL_CHANGED = ['Changed', 'Added', 'Fixed'];

export function groupCommits(commitMessages) {
  const groups = { Added: [], Fixed: [], Changed: [] };
  for (const message of commitMessages) {
    const firstLine = String(message).split('\n', 1)[0] ?? '';
    const entry = stripType(message);
    const match = CHANGELOG_SECTIONS.find(([type]) => firstLine.startsWith(type));
    const section = match ? match[1] : 'Changed';
    if (!groups[section]) groups[section] = [];
    groups[section].push(entry);
  }
  return groups;
}

export function changelogSection(version, date, commitMessages) {
  const groups = groupCommits(commitMessages);
  const lines = [`## [${formatTag(version)}] - ${date}`];
  for (const section of ALL_CHANGED) {
    const entries = groups[section];
    if (!entries || entries.length === 0) continue;
    lines.push('', `### ${section}`, ...entries.map((entry) => `- ${entry}`));
  }
  return `${lines.join('\n')}\n`;
}

export const CHANGELOG_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
`;

export function readCommittedMessages(fromRef, toRef = 'HEAD') {
  const raw = git(['log', '--no-merges', '--format=%s', `${fromRef}..${toRef}`], null);
  if (raw === null) return [];
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function sortTagsAscending(rawTags) {
  return (rawTags ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((tag) => ({ tag, version: parseTag(tag) }))
    .filter((entry) => entry.version !== null)
    .sort((a, b) => {
      if (a.version.major !== b.version.major) return a.version.major - b.version.major;
      if (a.version.minor !== b.version.minor) return a.version.minor - b.version.minor;
      return a.version.patch - b.version.patch;
    });
}

/**
 * Pure window-grading core for the replay audit. Walks the given sorted
 * semver tags (ascending) plus any trailing un-released commits and applies the
 * current bump rules to each window. `readMessages(from, to)` must return the
 * commit subjects in that range (excluding release commits).
 */
export function gradeWindows(tags, readMessages) {
  const windows = [];
  if (tags.length === 0) {
    const messages = readMessages(null, 'HEAD');
    const version = nextVersionFromMessages(null, messages);
    windows.push({ from: null, to: 'HEAD', messages, version });
    return { windows, final: version };
  }
  let current = tags[0].version;
  for (let i = 1; i < tags.length; i++) {
    const messages = readMessages(tags[i - 1].tag, tags[i].tag);
    const version = nextVersionFromMessages(formatTag(current), messages);
    windows.push({ from: tags[i - 1].tag, to: tags[i].tag, messages, version });
    current = version;
  }
  const tailMessages = readMessages(tags[tags.length - 1].tag, 'HEAD');
  if (tailMessages.length > 0) {
    const version = nextVersionFromMessages(formatTag(current), tailMessages);
    windows.push({ from: tags[tags.length - 1].tag, to: 'HEAD', messages: tailMessages, version });
    current = version;
  }
  return { windows, final: current };
}

/**
 * Re-grades every release window between consecutive semver tags (plus the
 * open window after the last tag) using the current "grade across all commits
 * since last tag" rules, returning the true accumulated version. Read-only —
 * never mutates the repo.
 */
export function replayVersions() {
  const tags = sortTagsAscending(git(['tag', '--merged', 'HEAD'], null));
  const readMessages = (from, to) =>
    (from
      ? readCommittedMessages(from, to)
      : readCommittedMessages(git(['rev-list', '--max-parents=0', 'HEAD'], 'HEAD'), to)
    ).filter((m) => !isReleaseCommit(m));
  return gradeWindows(tags, readMessages);
}

export function bumpPackageVersion(version) {
  const pkgPath = resolve(ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const next = formatTag(
    typeof version === 'string' ? (parseTag(version) ?? { major: 0, minor: 0, patch: 0 }) : version
  );
  pkg.version = next;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  syncLockfileVersion(next);
  return next;
}

export function applyLockfileVersion(lock, version) {
  lock.version = version;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = version;
  }
  return lock;
}

export function syncLockfileVersion(version) {
  const lock = JSON.parse(readFileSync(PACKAGE_LOCK, 'utf8'));
  applyLockfileVersion(lock, version);
  writeFileSync(PACKAGE_LOCK, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  return lock;
}

export function upsertChangelog(sectionText) {
  const changelogPath = resolve(ROOT, 'CHANGELOG.md');
  let current = '';
  try {
    current = readFileSync(changelogPath, 'utf8');
  } catch {
    current = '';
  }
  if (current.trim().length === 0) {
    const next = `${CHANGELOG_HEADER}\n${sectionText}`;
    writeFileSync(changelogPath, next, 'utf8');
    return next;
  }
  const insertAt = current.indexOf('## [Unreleased]');
  const marker = insertAt >= 0 ? current.indexOf('\n', insertAt) + 1 : 0;
  const next = `${current.slice(0, marker)}\n${sectionText}${current.slice(marker)}`;
  writeFileSync(changelogPath, next, 'utf8');
  return next;
}

function readArgs() {
  const args = process.argv.slice(2);
  const has = (flag) => args.includes(flag);
  const valueOf = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return { has, valueOf };
}

function main() {
  const { has, valueOf } = readArgs();
  const dryRun = has('--dry-run');

  if (has('--guard')) {
    const headMessage = git(['log', '-1', '--format=%s'], '').trim();
    const headTag = readLatestTag();
    const skip = shouldSkipRelease({ headMessage, headTag });
    process.stdout.write(`skip=${String(skip)}\n`);
    return;
  }

  if (has('--replay')) {
    const { windows, final } = replayVersions();
    for (const w of windows) {
      const fromLabel = w.from ?? '(root)';
      process.stdout.write(
        `${fromLabel}..${w.to}: ${w.messages.length} commits -> ${formatTag(w.version)}\n`
      );
    }
    process.stdout.write(`final=${formatTag(final)}\n`);
    return;
  }

  if (has('--next')) {
    const lastTag = readLatestTag();
    const from = lastTag ?? git(['rev-list', '--max-parents=0', 'HEAD'], 'HEAD');
    const messages = from ? readCommittedMessages(from) : [];
    const next = nextVersionFromMessages(lastTag, messages);
    process.stdout.write(`${formatTag(next)}\n`);
    if (dryRun) {
      process.stdout.write(changelogSection(next, new Date().toISOString().slice(0, 10), messages));
    }
    return;
  }

  const versionArg = valueOf('--apply');
  if (has('--apply')) {
    const version = String(versionArg);
    bumpPackageVersion(version);
    const lastTag = readLatestTag();
    const from = lastTag ?? git(['rev-list', '--max-parents=0', 'HEAD'], 'HEAD');
    const messages = from ? readCommittedMessages(from) : [];
    const section = changelogSection(
      parseTag(version) ?? { major: 0, minor: 0, patch: 0 },
      new Date().toISOString().slice(0, 10),
      messages
    );
    upsertChangelog(section);
    const notesFile = valueOf('--notes-file');
    if (notesFile) {
      writeFileSync(resolve(notesFile), section, 'utf8');
    }
    process.stdout.write(section);
    return;
  }

  process.stdout.write(
    'usage: node scripts/release-tools.mjs (--guard | --next [--dry-run] | --replay | --apply <version> [--notes-file <path>])\n'
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
