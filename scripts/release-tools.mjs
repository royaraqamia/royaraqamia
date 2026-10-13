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

const EMPTY_GROUPS = () => ({ Added: [], Fixed: [], Changed: [] });

function normalizeEntry(entry) {
  return String(entry).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Renders a dated Keep-a-Changelog section from ready-made groups. */
export function changelogSectionFromGroups(version, date, groups) {
  const lines = [`## [${formatTag(version)}] - ${date}`];
  for (const section of ALL_CHANGED) {
    const entries = groups?.[section] ?? [];
    if (entries.length === 0) continue;
    lines.push('', `### ${section}`, ...entries.map((entry) => `- ${entry}`));
  }
  return `${lines.join('\n')}\n`;
}

export function changelogSection(version, date, commitMessages) {
  return changelogSectionFromGroups(version, date, groupCommits(commitMessages));
}

/**
 * Folds the entries already written under `[Unreleased]` into the generated
 * ones: one list per change type, generated first, then written, with a
 * verbatim repeat dropped. This is what keeps a release to a single `### Fixed`
 * header instead of restating a change once as a subject and once as prose.
 */
export function mergeChangelogGroups(generated, written) {
  const merged = EMPTY_GROUPS();
  for (const section of ALL_CHANGED) {
    const seen = new Set();
    for (const entry of [...(generated?.[section] ?? []), ...(written?.[section] ?? [])]) {
      const key = normalizeEntry(entry);
      if (key.length === 0 || seen.has(key)) continue;
      seen.add(key);
      merged[section].push(entry);
    }
  }
  return merged;
}

/** The release section for a cut, from generated subjects plus written entries. */
export function composeReleaseSection(version, date, generatedGroups, writtenGroups) {
  return changelogSectionFromGroups(
    version,
    date,
    mergeChangelogGroups(generatedGroups, writtenGroups)
  );
}

export const CHANGELOG_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
`;

export function readCommits(fromRef, toRef = 'HEAD') {
  const raw = git(['log', '--no-merges', '--format=%H %s', `${fromRef}..${toRef}`], null);
  if (raw === null) return [];
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 40)
    .map((line) => ({ hash: line.slice(0, 40), subject: line.slice(41) }));
}

export function readCommittedMessages(fromRef, toRef = 'HEAD') {
  return readCommits(fromRef, toRef).map((commit) => commit.subject);
}

/**
 * The line span (1-based, inclusive) of the body under `## [Unreleased]`,
 * excluding the header line itself. `null` when the header is absent; the span
 * is empty (`endLine < startLine`) when nothing has been written yet.
 */
export function unreleasedRegion(changelogText) {
  const lines = String(changelogText ?? '').split('\n');
  const start = lines.findIndex((line) => /^##\s*\[Unreleased\]\s*$/.test(line));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s*\[/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { startLine: start + 2, endLine: end };
}

export function unreleasedBody(changelogText) {
  const region = unreleasedRegion(changelogText);
  if (!region) return '';
  return String(changelogText ?? '')
    .split('\n')
    .slice(region.startLine - 1, region.endLine)
    .join('\n');
}

/**
 * Groups the hand-written `[Unreleased]` entries by change type, dropping the
 * leading `- ` so they render exactly like generated subject lines. Indented
 * continuation lines stay attached to their entry.
 */
export function parseChangelogSections(bodyText) {
  const groups = EMPTY_GROUPS();
  let section = null;
  let entry = -1;
  for (const line of String(bodyText ?? '').split('\n')) {
    const header = /^###\s+(Added|Fixed|Changed)\s*$/i.exec(line);
    if (header) {
      const name = header[1].toLowerCase();
      section = name[0].toUpperCase() + name.slice(1);
      entry = -1;
      continue;
    }
    if (!section) {
      entry = -1;
      continue;
    }
    if (line.startsWith('- ')) {
      groups[section].push(line.slice(2));
      entry = groups[section].length - 1;
      continue;
    }
    if (entry >= 0 && /^\s+\S/.test(line)) {
      groups[section][entry] += `\n${line}`;
      continue;
    }
    entry = -1;
  }
  return groups;
}

export function countChangelogEntries(groups) {
  return ALL_CHANGED.reduce((total, section) => total + (groups?.[section]?.length ?? 0), 0);
}

/**
 * The hex commits that authored the current `[Unreleased]` body. A commit that
 * writes its own entry there is documented by it, so its subject must not be
 * restated in the release section.
 */
export function changelogOwningCommits(changelogText) {
  const region = unreleasedRegion(changelogText);
  if (!region || region.endLine < region.startLine) return new Set();
  const raw = git(
    ['blame', '--porcelain', '-L', `${region.startLine},${region.endLine}`, '--', 'CHANGELOG.md'],
    null
  );
  if (raw === null) return new Set();
  const hashes = new Set();
  for (const line of raw.split('\n')) {
    const match = /^([0-9a-f]{40}) /.exec(line);
    if (match) hashes.add(match[1]);
  }
  return hashes;
}

export function dropDocumentingCommits(commits, owningHashes) {
  return commits.filter((commit) => !owningHashes.has(commit.hash));
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

const CHANGELOG_PATH = resolve(ROOT, 'CHANGELOG.md');

export function readChangelog() {
  try {
    return readFileSync(CHANGELOG_PATH, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Cuts the release section into the file *and empties the `[Unreleased]` body*,
 * so a written entry moves under the version header instead of being stranded
 * there and restated by the next section.
 */
export function applyChangelogSection(changelogText, sectionText) {
  const current = String(changelogText ?? '');
  if (current.trim().length === 0) {
    return `${CHANGELOG_HEADER}\n${sectionText}`;
  }
  const lines = current.split('\n');
  const start = lines.findIndex((line) => /^##\s*\[Unreleased\]\s*$/.test(line));
  if (start < 0) {
    return `${CHANGELOG_HEADER}\n${sectionText}${current}`;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s*\[/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const before = lines.slice(0, start + 1).join('\n');
  const after = lines.slice(end).join('\n');
  const head = `${before}\n\n${sectionText}`;
  return after ? `${head}\n${after}` : head;
}

export function upsertChangelog(sectionText) {
  const next = applyChangelogSection(readChangelog(), sectionText);
  writeFileSync(CHANGELOG_PATH, next, 'utf8');
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Grades the commits in `from..HEAD` into a release section, folding in any
 * entries already written under `[Unreleased]`. A commit that authored one of
 * those entries (via blame) is dropped from the generated list, so the change is
 * not restated once as a subject line and once as prose.
 */
function buildReleaseSection(version, from) {
  const changelogText = readChangelog();
  const written = parseChangelogSections(unreleasedBody(changelogText));
  const hasWritten = countChangelogEntries(written) > 0;
  const commits = from ? readCommits(from) : [];
  const documented = hasWritten ? changelogOwningCommits(changelogText) : new Set();
  const generated = groupCommits(
    dropDocumentingCommits(commits, documented).map((commit) => commit.subject)
  );
  return composeReleaseSection(version, today(), generated, hasWritten ? written : null);
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
    const commits = from ? readCommits(from) : [];
    const next = nextVersionFromMessages(
      lastTag,
      commits.map((commit) => commit.subject)
    );
    process.stdout.write(`${formatTag(next)}\n`);
    if (dryRun) {
      process.stdout.write(buildReleaseSection(next, from));
    }
    return;
  }

  const versionArg = valueOf('--apply');
  if (has('--apply')) {
    const version = String(versionArg);
    bumpPackageVersion(version);
    const lastTag = readLatestTag();
    const from = lastTag ?? git(['rev-list', '--max-parents=0', 'HEAD'], 'HEAD');
    const section = buildReleaseSection(
      parseTag(version) ?? { major: 0, minor: 0, patch: 0 },
      from
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
