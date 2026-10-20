import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `/oc` stops at the pull request (ADR 0066, superseding ADR 0049). The load-bearing
 * parts are that nothing merges, the check watch reads with the default token, and the
 * pull request is named by the branch whose tip this run moved — not the newest
 * `opencode/*` one, because two `/oc` runs can be in flight at once.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom, where
 * import.meta.url is an http URL and `new URL` refuses it.
 */
describe('the interactive agent stops at the open pull request', () => {
  const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/opencode.yml'), 'utf8');
  const checksAt = workflow.indexOf("Watch the pull request's checks and report");
  const checks = workflow.slice(checksAt);

  it("never merges: the merge is the owner's manual step", () => {
    expect(checksAt).toBeGreaterThan(-1);
    expect(workflow).not.toContain('gh pr merge');
    expect(workflow).not.toContain('--auto');
    expect(workflow).not.toContain('--delete-branch');
  });

  it('reads the checks with the default token, because there is no merge identity', () => {
    expect(checks).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(workflow).not.toContain('secrets.RELEASE_TOKEN');
  });

  it('names its own pull request by the head commit, not by being the newest', () => {
    const snapshotAt = workflow.indexOf('Snapshot open agent pull requests');
    expect(snapshotAt).toBeGreaterThan(-1);
    expect(snapshotAt).toBeLessThan(workflow.indexOf('Implement — DeepSeek 4.1 Flash (Execute)'));
    expect(checks).toContain('headRefOid');
    expect(checks).toContain('steps.snapshot.outputs.agent_prs');
  });

  it('refuses to report on a pull request it cannot identify', () => {
    expect(checks).toContain('if [ -z "$before" ]');
    expect(checks).toContain('if [ "$count" -gt 1 ]');
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

  it('watches only after the implement phase succeeded', () => {
    expect(checks).toContain("steps.implement.outcome == 'success'");
  });
});
