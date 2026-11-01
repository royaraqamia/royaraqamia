import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { copiesOnBranch, main as check, markCopy } from '../check-branch-base.mjs';

/**
 * The guard against stacking a branch on a local `main` squash copy — the shape
 * that turned #831/#832/#833 conflicting when their bases landed.
 */

let dir: string | null = null;
let previousCwd = process.cwd();

function run(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function commit(message: string): string {
  writeFileSync(join(process.cwd(), 'file.txt'), message);
  run(['add', '-A']);
  run(['commit', '-qm', message]);
  return run(['rev-parse', 'HEAD']);
}

function repo() {
  previousCwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), 'branch-base-'));
  process.chdir(dir);
  run(['init', '-q', '-b', 'main']);
  run(['config', 'user.email', 'agent@example.com']);
  run(['config', 'user.name', 'agent']);
  commit('init');
  return dir;
}

afterEach(() => {
  process.chdir(previousCwd);
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

const quiet = () => {};

describe('check-branch-base', () => {
  it('passes a branch cut from a main that is even with origin/main', () => {
    repo();
    run(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    run(['switch', '-q', '-c', 'feat/clean']);
    commit('feat: my work');

    expect(copiesOnBranch()).toEqual([]);
    expect(check([], quiet)).toBe(0);
  });

  it('refuses a branch that carries a noted squash copy', () => {
    repo();
    run(['update-ref', 'refs/remotes/origin/main', run(['rev-parse', 'HEAD'])]);

    // landing.md step 6: the local record of a landed pull request, tagged so a
    // branch from it can be told apart even after `main` moves on.
    const copy = commit('feat(android): budgets (#831)');
    markCopy(copy, 831);

    run(['switch', '-q', '-c', 'feat/stacked']);
    commit('feat(android): currency (#832)');

    const copies = copiesOnBranch();
    expect(copies).toHaveLength(1);
    expect(copies[0]?.subject).toBe('feat(android): budgets (#831)');
    expect(check([], quiet)).toBe(1);
  });

  it('refuses a copy recorded before the note existed', () => {
    repo();
    const base = run(['rev-parse', 'HEAD']);
    run(['update-ref', 'refs/remotes/origin/main', base]);

    // The local record on main, without the note the newer step 6 writes.
    commit('feat(android): budgets (#831)');
    run(['switch', '-q', '-c', 'feat/stacked']);
    commit('feat(android): currency (#832)');

    // The same request lands upstream as its own squash, under a second hash.
    run(['switch', '-q', '-c', 'upstream', base]);
    writeFileSync(join(process.cwd(), 'other.txt'), 'upstream');
    run(['add', '-A']);
    run(['commit', '-qm', 'feat(android): budgets (#831)']);
    run(['update-ref', 'refs/remotes/origin/main', run(['rev-parse', 'HEAD'])]);
    run(['switch', '-q', 'feat/stacked']);

    expect(check([], quiet)).toBe(1);
  });

  it('leaves main itself alone: it is the record', () => {
    repo();
    run(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const copy = commit('feat(android): budgets (#831)');
    markCopy(copy, 831);

    expect(check([], quiet)).toBe(0);
  });
});
