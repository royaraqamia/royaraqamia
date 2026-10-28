import { describe, expect, it } from 'vitest';

import { git } from '../git-utils.mjs';

describe('git-utils', () => {
  it('answers with the fallback when git cannot run the command', () => {
    expect(git(['a-command-that-does-not-exist'], 'fallback')).toBe('fallback');
  });

  it('returns trimmed stdout from a command that works', () => {
    const top = git(['rev-parse', '--show-toplevel'], null);
    // No git, no checkout: there is nothing to assert, and the fallback above
    // already proved the contract.
    if (top === null) return;
    expect(top.length).toBeGreaterThan(0);
    expect(top).toBe(top.trim());
  });
});
