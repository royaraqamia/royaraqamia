import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The implementer lands its own pull request (ADR 0048). Two of these are invariants a
 * quiet edit would break and nothing else would notice: the merge identity, because a
 * merge made with the default token starts no workflows, and the order of the steps,
 * because a title `repo-checks` rejects is a check the merge must not run over.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom, where
 * import.meta.url is an http URL and `new URL` refuses it.
 */
describe('the issue implementer lands its own pull request', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '.github/workflows/issue-implementer.yml'),
    'utf8'
  );
  const mergeAt = workflow.indexOf('Merge the pull request once CI is green');
  const merge = workflow.slice(mergeAt);

  it('merges with the release token, so the merge starts the release train', () => {
    // A merge made with GITHUB_TOKEN starts no workflows: the push to main would skip
    // Code Quality and with it Release, so nothing would bump the version or tag it.
    expect(mergeAt).toBeGreaterThan(-1);
    expect(merge).toContain('GH_TOKEN: ${{ secrets.RELEASE_TOKEN }}');
    expect(merge).not.toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
  });

  it('waits for the checks before it merges', () => {
    expect(merge).toContain('gh pr checks "$pr" --watch');
    expect(merge.indexOf('gh pr checks')).toBeLessThan(merge.indexOf('gh pr merge'));
  });

  it('normalizes the pull request title first, so repo-checks is green when it watches', () => {
    expect(workflow.indexOf('Normalize Agent PR Titles')).toBeLessThan(mergeAt);
  });
});
