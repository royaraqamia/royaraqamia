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

/**
 * A release tag as a version.
 *
 * `web-1.97.0` is the current spelling, and the two that came before it —
 * `v1.97.0` and the bare `1.97.0` — are read forever, because the tags that
 * already exist are history and the release train computes the next version from
 * them (ADR-0046).
 *
 * A shell release (`android-1.0.3`) deliberately does not parse: the two release
 * lines have separate clocks, and a shell tag in the web version list would make
 * the web train bump for an APK.
 */
export function parseTag(tag) {
  if (!tag) return null;
  const match = /^(?:web-)?v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** A version as a number: `1.97.0` — a changelog heading, a `package.json`. */
export function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/** A version as a tag: `web-1.97.0` — what git and GitHub want. */
export function formatTag(version) {
  return `web-${formatVersion(version)}`;
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
 * The highest release tag reachable from HEAD — the single source of truth
 * for "latest release". Returns null when no semver tag exists (or no git).
 */
export function latestSemverTag() {
  const tags = sortSemverTags(git(['tag', '--merged', 'HEAD'], null));
  return tags.length > 0 ? tags[0].tag : null;
}

/**
 * The highest semver tag that exists in the repository, whether or not HEAD
 * contains it. `latestSemverTag` answers "which release is this commit on top
 * of"; this answers "which numbers are already taken". A tag owns its number
 * even when the commit it names never reached `main` — that is what a push
 * without `--atomic` can leave behind, and re-cutting the number then fails
 * forever on `git tag` (ADR-0051).
 */
export function highestSemverTag() {
  const tags = sortSemverTags(git(['tag', '--list'], null));
  return tags.length > 0 ? tags[0].tag : null;
}
