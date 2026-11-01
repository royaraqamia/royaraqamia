#!/usr/bin/env node
/**
 * Refuses a branch that carries a local `main` squash copy.
 *
 * Landing (docs/agents/landing.md, step 6) records a landed pull request on the
 * checkout's local `main` as a NEW commit, "<PR title> (#N)", and tags it with a
 * git note in `refs/notes/landed-copies`. A worktree is cut from `main` — the
 * one base every path agrees on (ADR-0072) — so it inherits that copy, which is
 * a patch applied to whatever `main` happened to be at the time, not the pull
 * request's own tree.
 *
 * When GitHub merges the request it writes the same change under its own hash.
 * The later merge then compares the copy against the squash, and the two are not
 * identical (the local copy passed through lint-staged and was applied to a
 * different base), so every file both sides touched conflicts. That is what
 * turned #831, #832 and #833 conflicting within minutes of their bases landing.
 *
 * A branch never needs the copies: its base is `origin/main`, or another pull
 * request's branch when it genuinely depends on unmerged work. `npm run
 * sync:base` rebases onto that base and drops them.
 *
 * Detection is exact for anything recorded since the note was introduced, and
 * falls back to "a (#N) commit whose PR is already a squash on origin/main" for
 * copies recorded before it. Local refs only: no network, no gh.
 */

import { execFileSync } from 'node:child_process';

const OK = 0;
const VIOLATION = 1;
const NOTES_REF = 'refs/notes/landed-copies';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tryGit(args) {
  try {
    return { ok: true, out: git(args) };
  } catch (error) {
    return { ok: false, out: String(error.stderr ?? error.message) };
  }
}

function refExists(ref) {
  return tryGit(['rev-parse', '--verify', '--quiet', ref]).ok;
}

function hasCopyNote(sha) {
  return tryGit(['notes', '--ref=landed-copies', 'show', sha]).ok;
}

/** The `(#N)` a subject ends with, if any. */
export function pullRequestNumber(subject) {
  const match = /\(#(\d+)\)\s*$/.exec(subject);
  return match?.[1] ?? null;
}

/** Every pull request number `origin/main` already carries as a squash. */
export function landedNumbers() {
  if (!refExists('refs/remotes/origin/main')) return new Set();
  return new Set(
    git(['log', '--format=%s', 'origin/main']).split('\n').map(pullRequestNumber).filter(Boolean)
  );
}

/**
 * The copies this branch carries, oldest first: a commit outside `origin/main`
 * that either says so (the note step 6 writes) or that duplicates a pull request
 * `origin/main` already has as a squash.
 */
export function copiesOnBranch() {
  if (!refExists('refs/remotes/origin/main')) return [];

  const landed = landedNumbers();
  return git(['rev-list', '--reverse', 'HEAD', '--not', 'origin/main'])
    .split('\n')
    .filter(Boolean)
    .map((sha) => ({ sha, subject: git(['log', '-1', '--format=%s', sha]) }))
    .filter(({ sha, subject }) => {
      if (hasCopyNote(sha)) return true;
      const number = pullRequestNumber(subject);
      return number !== null && landed.has(number);
    });
}

export function main(argv = process.argv.slice(2), log = console.log) {
  if (argv.includes('--help')) {
    log('check-branch-base: fails when this branch carries a local-main squash copy.');
    return OK;
  }

  const head = tryGit(['rev-parse', '--abbrev-ref', 'HEAD']).out;

  // `main` itself is the record, not a branch under repair.
  if (head === 'main') return OK;

  if (!refExists('refs/remotes/origin/main')) {
    log('check-branch-base: no origin/main to compare against; skipped.');
    return OK;
  }

  const copies = copiesOnBranch();

  if (copies.length === 0) {
    log('check-branch-base: the branch carries no local squash copies.');
    return OK;
  }

  log('');
  log(`✗ ${copies.length} local squash cop${copies.length === 1 ? 'y' : 'ies'} on this branch:`);
  for (const copy of copies) log(`    ${copy.sha.slice(0, 8)} ${copy.subject}`);
  log('');
  log('A copy was applied to whatever local `main` was at that time, not to the pull request’s');
  log('own tree, so when GitHub merges that request the same content lands under a second hash');
  log('and the next merge conflicts on every file both sides touched.');
  log('');
  log('Fix it before pushing:');
  log('    npm run sync:base        # rebase onto origin/main, or onto the open PR’s branch');
  log('    git push --force-with-lease');
  log('');
  return VIOLATION;
}

/** Tags `sha` as a landed copy, so a branch from it can be told apart later. */
export function markCopy(sha, number) {
  execFileSync('git', ['notes', '--ref=landed-copies', 'add', '-f', '-m', `PR #${number}`, sha], {
    stdio: 'ignore',
  });
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('check-branch-base.mjs');
if (invokedDirectly) process.exitCode = main();
