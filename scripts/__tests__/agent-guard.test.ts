import { describe, expect, it } from 'vitest';

import {
  DENY_MESSAGE,
  decideDeny,
  isWriterCommand,
  normalizePath,
} from '@/scripts/agent-guard/decide';

/**
 * The guard stops agents committing in the shared checkout. A false negative lets the hazard back
 * in; a false positive blocks read-only work in the one tree every agent reads.
 */
describe('isWriterCommand', () => {
  it.each([
    'git commit -m x',
    'git commit --allow-empty --dry-run -m probe',
    'git -C /repo commit -m x',
    'git --git-dir=/repo/.git commit -m x',
    'cd /repo && git push origin main',
    'git fetch && git push',
    'git status && git commit -m x',
  ])('catches %s', (command) => {
    expect(isWriterCommand(command)).toBe(true);
  });

  it.each([
    'git status --short',
    'git log --grep push',
    'git worktree add -b task ../wt main',
    'git worktree remove ../wt',
    'git stash list',
    "echo 'git commit'",
    'npm run lint',
    'git pushy',
    'git commit-ish',
  ])('leaves %s alone', (command) => {
    expect(isWriterCommand(command)).toBe(false);
  });
});

const CANONICAL = 'D:\\Projects\\royaraqamia\\';
const WORKTREE = 'C:\\Users\\Asus\\.local\\share\\opencode\\worktree\\440f7b\\shared-tree-guard';

function deny(overrides: Partial<Parameters<typeof decideDeny>[0]> = {}) {
  return decideDeny({
    action: 'shell',
    resources: ['git commit -m x'],
    sessionDirectory: CANONICAL,
    canonicalDirectory: 'D:/Projects/royaraqamia',
    ...overrides,
  });
}

describe('decideDeny', () => {
  it('refuses a writer in the canonical checkout', () => {
    expect(deny()).toBe(DENY_MESSAGE);
  });

  it('allows the same command in a worktree', () => {
    expect(deny({ sessionDirectory: WORKTREE })).toBeNull();
  });

  it('allows a subdirectory of the canonical checkout, which is a different tree to reason about', () => {
    expect(deny({ sessionDirectory: `${CANONICAL}\\nested` })).toBeNull();
  });

  it('allows it when the session directory is unknown, rather than guessing', () => {
    expect(deny({ sessionDirectory: null })).toBeNull();
  });

  it('allows read-only git', () => {
    expect(deny({ resources: ['git status --short'] })).toBeNull();
  });

  it('only guards shell commands', () => {
    expect(deny({ action: 'edit' })).toBeNull();
  });

  it('compares directories across separator and case differences', () => {
    expect(deny({ sessionDirectory: 'd:/projects/ROYARAQAMIA' })).toBe(DENY_MESSAGE);
    expect(normalizePath('D:\\Projects\\X\\')).toBe('d:/projects/x');
  });
});
