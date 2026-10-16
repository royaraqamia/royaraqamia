import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUBLISH_ONLY_FILES } from './release-guard.mjs';
import { isReleaseCommit } from './release-tools.mjs';

/**
 * Is the web train behind on `main`?
 *
 * The train is only as reliable as its trigger. A Release run that never starts
 * (a push that starts no workflows), one that fails, or one that the guard
 * skipped leaves commits on `main` whose version nobody cuts: the number is owed,
 * and unlike a rejected push there is no later run that recomputes it (ADR-0052).
 * Nothing else in the repository notices that, so this is the switch that does —
 * `.github/workflows/release-health.yml` runs it on a schedule and raises exactly
 * one alert issue while the train is behind.
 *
 * The question is: every commit above the newest release commit is unreleased,
 * because a release commit sits on top of the version it cut. Ignore the commits
 * that owe no version — a manifest republish is data beside the app, not a change
 * (ADR-0046) — and what is left is what a release run would have released. If the
 * oldest of those has stood for longer than the threshold, no run is coming for it.
 */

/** The window the train is behind by, in minutes. One full release cycle is ~6. */
export const STALE_MINUTES = 30;

function git(args, fallback = null) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return fallback;
  }
}

function short(sha) {
  return String(sha ?? '').slice(0, 8);
}

/** A commit that only republishes the shell manifest owes no version. */
export function isPublishOnly(files) {
  return files.length > 0 && files.every((file) => PUBLISH_ONLY_FILES.includes(file));
}

/**
 * Whether the train is behind, from the commits above the newest release commit,
 * newest first, each `{ sha, subject, committedAt, files }`.
 *
 * The age that decides is the *oldest* owed commit's: a healthy train releases
 * every commit since the last tag within one cycle, so a backlog that has stood
 * for longer than the threshold means no release run is coming for it — including
 * when commits keep arriving and the tip is always young, which is exactly how the
 * stall of 2026-10-16 looked.
 *
 * A release commit inside the window is filtered too: it cannot be there (it is
 * what defines the window), but a subject that merely matches one must not make
 * the train look released.
 */
export function classifyStall({ commits, now, staleMs = STALE_MINUTES * 60 * 1000 }) {
  const owed = commits
    .filter((commit) => !isReleaseCommit(commit.subject) && !isPublishOnly(commit.files ?? []))
    .sort((a, b) => b.committedAt - a.committedAt);
  if (owed.length === 0) {
    return { stalled: false, owed, newest: null, oldest: null, ageMs: 0 };
  }

  const newest = owed[0];
  const oldest = owed[owed.length - 1];
  const ageMs = now - oldest.committedAt;
  return { stalled: ageMs > staleMs, owed, newest, oldest, ageMs };
}

/**
 * Every commit above the newest release commit, newest first, with the files it
 * touched. `{ commits: null }` when the history holds no release commit at all — a
 * repository before its first release is not a train that is behind, and saying so
 * would be an alert nobody can act on.
 */
export function unreleasedCommits() {
  const log = git(['log', '--format=%H%x09%s%x09%ct', 'HEAD']);
  if (log === null) return { error: 'could not read the commit history' };

  const rows = log
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha, subject, committedAt] = line.split('\t');
      return { sha, subject, committedAt: Number(committedAt) * 1000 };
    });

  const newestRelease = rows.findIndex((row) => isReleaseCommit(row.subject));
  if (newestRelease === -1) return { commits: null };

  return {
    commits: rows.slice(0, newestRelease).map((row) => ({ ...row, files: changedFiles(row.sha) })),
  };
}

function changedFiles(sha) {
  const out = git(['show', '--name-only', '--format=', sha], '') ?? '';
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Prints the GitHub-output lines `release-health.yml` reads (`stalled`, `count`,
 * `sha`, `subject`, `age_minutes`) on stdout, and the same thing as a sentence on
 * stderr, so the script says what a human needs when run by hand.
 */
export function main(argv = process.argv.slice(2)) {
  const index = argv.indexOf('--stale-minutes');
  const staleMinutes = index === -1 ? STALE_MINUTES : Number(argv[index + 1]);
  const staleMs = (Number.isFinite(staleMinutes) ? staleMinutes : STALE_MINUTES) * 60 * 1000;

  const { commits, error } = unreleasedCommits();
  if (error !== undefined) {
    console.error(`::error title=Release health could not run::${error}`);
    return 1;
  }
  if (commits === null) {
    console.error('no release commit in this history; nothing to compare against');
    console.log('stalled=false');
    console.log('count=0');
    console.log('age_minutes=0');
    return 0;
  }

  const { stalled, owed, newest, oldest, ageMs } = classifyStall({
    commits,
    now: Date.now(),
    staleMs,
  });
  const ageMinutes = Math.round(ageMs / 60000);
  const longest = oldest ?? newest;

  console.error(
    stalled
      ? `the train is behind: ${owed.length} commit(s) unreleased, the oldest ${short(longest.sha)} "${longest.subject}" ${ageMinutes} minute(s) old`
      : `the train is level with main: ${owed.length} commit(s) unreleased, the oldest ${ageMinutes} minute(s) old`
  );

  console.log(`stalled=${String(stalled)}`);
  console.log(`count=${owed.length}`);
  console.log(`sha=${longest ? short(longest.sha) : ''}`);
  console.log(`subject=${longest ? longest.subject : ''}`);
  console.log(`age_minutes=${ageMinutes}`);
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`::error title=Release health could not run::${error.message}`);
    process.exitCode = 1;
  }
}
