import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function git(args, fallback) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return fallback;
  }
}

export function parseTag(tag) {
  if (!tag) return null;
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function formatTag(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function compareVersionsDesc(a, b) {
  const v = a.version;
  const w = b.version;
  if (v.major !== w.major) return w.major - v.major;
  if (v.minor !== w.minor) return w.minor - v.minor;
  return w.patch - v.patch;
}

/**
 * Parses raw `git tag` output into semver entries, filtering out non-semver
 * tags (e.g. `backup-1`) and sorting descending by version.
 */
export function sortSemverTags(rawTags) {
  return (rawTags ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((tag) => ({ tag, version: parseTag(tag) }))
    .filter((entry) => entry.version !== null)
    .sort(compareVersionsDesc);
}

/**
 * The highest `vX.Y.Z` tag reachable from HEAD — the single source of truth
 * for "latest release". Returns null when no semver tag exists (or no git).
 */
export function latestSemverTag() {
  const tags = sortSemverTags(git(['tag', '--merged', 'HEAD'], null));
  return tags.length > 0 ? tags[0].tag : null;
}
