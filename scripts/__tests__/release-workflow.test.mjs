import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Two workflows write to `main`, so the release push can lose a race. On
 * 2026-10-16 it lost one in the costly way: `git push origin main --tags` landed
 * the tag and rejected the branch, so `web-1.101.13` named a commit `main` never
 * received, and every later run died on `fatal: tag 'web-1.101.13' already
 * exists` — the train stopped releasing anything (ADR-0051).
 *
 * The invariants pinned here are the load-bearing parts of the fix.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom, where
 * import.meta.url is an http URL and `new URL` refuses it.
 */
describe('the release push cannot strand its tag', () => {
  const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/release.yml'), 'utf8');
  const commitAt = workflow.indexOf('Commit & Tag & Push');
  const push = workflow.slice(commitAt);

  it('has the step it pins', () => {
    expect(commitAt).toBeGreaterThan(-1);
  });

  it('pushes the branch and the tag in one atomic transaction', () => {
    // Non-atomic is what stranded web-1.101.13: the tag landed, the branch did
    // not, and the tag then owned a number no branch could see.
    expect(push).toContain('git push --atomic origin');
    expect(push).toContain('refs/tags/$TAG');
  });

  it('creates the tag inside the retry loop, after the rebase', () => {
    const tagAt = push.indexOf('git tag -f -a');
    expect(tagAt).toBeGreaterThan(push.indexOf('for attempt in'));
    expect(tagAt).toBeLessThan(push.indexOf('git push --atomic'));
    // No tag outside the loop: a tag created once survives a rebase pointing at
    // the commit the rebase rewrote.
    expect(push).not.toMatch(/^\s*git tag -a /m);
  });

  it('treats a tag already on origin as a version already cut, not a failure', () => {
    const checkAt = push.indexOf('git ls-remote --tags origin');
    expect(checkAt).toBeGreaterThan(-1);
    expect(checkAt).toBeLessThan(push.indexOf('git rebase origin/main'));
    expect(push.slice(checkAt, push.indexOf('git rebase origin/main'))).toContain('exit 0');
  });

  it('still refuses to push over a main that moved under a conflicting bump', () => {
    expect(push).toContain('Could not rebase the release commit');
  });
});
