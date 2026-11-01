#!/usr/bin/env node
/**
 * Rebuilds a branch on a base it can be merged from.
 *
 * `npm run check:branch-base` refuses a branch that carries a local `main`
 * squash copy; this is the one command that fixes it, because "rebase onto the
 * right base and drop the copies" is exactly what a rebase does:
 *
 *   git rebase --onto <base> <last copy> <branch>
 *
 * The base is `origin/main` when the copied pull request has landed. When the
 * copy belongs to a pull request that is still open, its *branch* is the base —
 * keeping the dependency without carrying a copy of it — so the branch's commits
 * share history with the base instead of duplicating it.
 *
 * It refuses to guess: without `gh`, or when the copies are not a leading run,
 * it prints what to do instead of rewriting history.
 */

import { execFileSync } from 'node:child_process';

import { copiesOnBranch } from './check-branch-base.mjs';

const FAILED = 1;

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...options }).trim();
}

function tryGit(args) {
  try {
    return { ok: true, out: git(args) };
  } catch (error) {
    return { ok: false, out: String(error.stderr ?? error.message) };
  }
}

/** `{ state, branch }` for a pull request number, or null when gh cannot say. */
function pullRequest(number) {
  try {
    const raw = execFileSync('gh', ['pr', 'view', String(number), '--json', 'state,headRefName'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(raw);
    return { state: parsed.state, branch: parsed.headRefName };
  } catch {
    return null;
  }
}

export function main(argv = process.argv.slice(2), log = console.log) {
  const dryRun = argv.includes('--dry-run');

  const head = (() => {
    const result = tryGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    return result.ok ? result.out : 'HEAD';
  })();
  if (head === 'main' || head === 'HEAD') {
    log('sync:base — run this from the task branch, not from main.');
    return FAILED;
  }

  const copies = copiesOnBranch();
  if (copies.length === 0) {
    log('sync:base — nothing to do: the branch carries no local squash copies.');
    return 0;
  }

  // The copies must be the *leading* commits, which is how landing stacks them.
  // Anything else needs a person: a copy in the middle is a decision, not a
  // mechanical rebase.
  const range = git(['rev-list', '--reverse', 'origin/main..HEAD']).split('\n').filter(Boolean);
  const lastCopy = copies[copies.length - 1];
  const leading = range.slice(0, range.indexOf(lastCopy.sha) + 1);
  if (leading.length !== copies.length) {
    log('sync:base — the copies are not the first commits on this branch; rebase by hand:');
    log('    git rebase --interactive --onto origin/main');
    return FAILED;
  }

  const numbers = copies.map((copy) => /\(#(\d+)\)\s*$/.exec(copy.subject)?.[1]).filter(Boolean);

  let base = 'origin/main';
  for (const number of numbers) {
    const pr = pullRequest(number);
    if (!pr) {
      log(`sync:base — cannot tell whether #${number} is merged (gh unavailable).`);
      log('    If it is merged: git rebase --onto origin/main ' + lastCopy.sha);
      log(`    If it is open:   git rebase --onto origin/<its-branch> ${lastCopy.sha}`);
      return FAILED;
    }
    if (pr.state !== 'MERGED') {
      base = `origin/${pr.branch}`;
      if (!dryRun) {
        const fetched = tryGit(['fetch', 'origin', pr.branch]);
        if (!fetched.ok) {
          log(`sync:base — could not fetch origin/${pr.branch} for open #${number}.`);
          return FAILED;
        }
      }
    }
  }

  const command = ['rebase', '--onto', base, lastCopy.sha];

  if (dryRun) {
    log(`sync:base — would run: git ${command.join(' ')}`);
    return 0;
  }

  log(`sync:base — git ${command.join(' ')}`);
  const result = tryGit(command);
  if (!result.ok) {
    log('sync:base — the rebase stopped; resolve it, then run `git rebase --continue`.');
    return FAILED;
  }

  log('');
  log(`Dropped ${copies.length} local squash cop${copies.length === 1 ? 'y' : 'ies'};`);
  log(`the branch now starts from ${base}.`);
  log('Push it with: git push --force-with-lease');
  return 0;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('sync-branch-base.mjs');
if (invokedDirectly) process.exitCode = main();
