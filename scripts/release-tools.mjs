import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, latestSemverTag, parseTag, formatTag } from './git-utils.mjs';

// Re-exported for the existing release-tools test suite.
export { parseTag, formatTag };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

export function bumpPackageVersion(version) {
  const pkgPath = resolve(ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const next = formatTag(
    typeof version === 'string' ? (parseTag(version) ?? { major: 0, minor: 0, patch: 0 }) : version
  );
  pkg.version = next;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  return next;
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

  if (has('--next')) {
    const lastTag = readLatestTag();
    const headMessage = git(['log', '-1', '--format=%s'], '').trim();
    const next = nextVersion(lastTag, headMessage);
    process.stdout.write(`${formatTag(next)}\n`);
    if (dryRun) {
      const from = lastTag ?? git(['rev-list', '--max-parents=0', 'HEAD'], 'HEAD');
      const messages = from ? readCommittedMessages(from) : [];
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
    'usage: node scripts/release-tools.mjs (--guard | --next [--dry-run] | --apply <version> [--notes-file <path>])\n'
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
