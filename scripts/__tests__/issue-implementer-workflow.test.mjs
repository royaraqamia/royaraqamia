import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The implementer stops at the open pull request (ADR 0066, superseding ADR 0048). Two
 * of these are invariants a quiet edit would break and nothing else would notice: no
 * merge command may come back, and the title is normalized before the checks are
 * watched, because a title `repo-checks` rejects is a red check.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom, where
 * import.meta.url is an http URL and `new URL` refuses it.
 */
describe('the issue implementer stops at the open pull request', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '.github/workflows/issue-implementer.yml'),
    'utf8'
  );
  const checksAt = workflow.indexOf("Watch the pull request's checks");
  const checks = workflow.slice(checksAt);

  it("never merges: the merge is the owner's manual step", () => {
    expect(checksAt).toBeGreaterThan(-1);
    expect(workflow).not.toContain('gh pr merge');
    expect(workflow).not.toContain('--delete-branch');
    expect(workflow).not.toContain('secrets.RELEASE_TOKEN');
  });

  it('reads the checks with the default token, because there is no merge identity', () => {
    expect(checks).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
  });

  it('watches the checks and reports the result instead of merging', () => {
    expect(checks).toContain('gh pr checks "$pr" --watch');
    expect(checks).toContain('status=green');
    expect(checks).toContain('status=red');
    expect(checks).not.toContain('gh pr merge');
  });

  it('normalizes the pull request title first, so repo-checks is green when it watches', () => {
    expect(workflow.indexOf('Normalize Agent PR Titles')).toBeLessThan(checksAt);
  });

  it('hands the issue over when the pull request is open, instead of closing it as merged', () => {
    expect(workflow).toContain("labels: ['ready-for-human']");
    expect(workflow).toContain('ready for a human to merge');
  });
});
