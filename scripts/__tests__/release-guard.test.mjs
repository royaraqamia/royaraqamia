import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { classifyHeadMove, PUBLISH_ONLY_FILES } from '../release-guard.mjs';

const A = 'aaaaaaaa';
const B = 'bbbbbbbb';

describe('classifyHeadMove', () => {
  it('releases when the tested commit is still HEAD', () => {
    expect(classifyHeadMove({ tested: A, current: A, changedFiles: [] })).toEqual({
      verdict: 'same',
    });
  });

  it('releases when only the published manifest landed on top', () => {
    expect(
      classifyHeadMove({
        tested: A,
        current: B,
        changedFiles: [...PUBLISH_ONLY_FILES],
      })
    ).toEqual({ verdict: 'publish-only', changedFiles: [...PUBLISH_ONLY_FILES] });
  });

  it('aborts when real code landed, and names it', () => {
    const move = classifyHeadMove({
      tested: A,
      current: B,
      changedFiles: [...PUBLISH_ONLY_FILES, 'app/page.tsx'],
    });

    expect(move.verdict).toBe('moved');
    expect(move.reason).toContain('app/page.tsx');
  });

  it('aborts when the tested commit is not an ancestor of HEAD', () => {
    const move = classifyHeadMove({
      tested: A,
      current: B,
      changedFiles: [],
      isAncestor: false,
    });

    expect(move.verdict).toBe('moved');
    expect(move.reason).toContain('not an ancestor');
  });

  it('does not accept a lookalike path as the manifest', () => {
    const move = classifyHeadMove({
      tested: A,
      current: B,
      changedFiles: ['public/android/latest.json.bak'],
    });

    expect(move.verdict).toBe('moved');
  });

  it('tolerates nothing else, even a doc', () => {
    expect(classifyHeadMove({ tested: A, current: B, changedFiles: ['README.md'] }).verdict).toBe(
      'moved'
    );
  });
});

describe('the release train runs the guard', () => {
  // `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom, where
  // import.meta.url is an http URL and `new URL` refuses it.
  const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/release.yml'), 'utf8');

  it('asks it before it releases anything', () => {
    expect(workflow).toContain('node scripts/release-guard.mjs');
  });

  it('rebases and retries the push rather than losing the version to a rejected push', () => {
    // Both workflows write to `main`. A rejected push used to lose the version
    // outright: the tag existed only locally and no later run recomputes it.
    const push = workflow.slice(workflow.indexOf('Commit & Tag & Push'));
    expect(push).toContain('for attempt in');
    expect(push).toContain('git rebase origin/main');
  });
});
