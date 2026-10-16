import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `/oc` lands its own pull request too (ADR 0049). The load-bearing parts are the merge
 * identity, the order of the steps, and the way the pull request is named: it has to be
 * the branch whose tip this run moved, not the newest `opencode/*` one, because two
 * `/oc` runs can be in flight at once.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom, where
 * import.meta.url is an http URL and `new URL` refuses it.
 */
describe('the interactive agent lands its own pull request', () => {
  const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/opencode.yml'), 'utf8');
  const mergeAt = workflow.indexOf("Merge the agent's pull request once CI is green");
  const merge = workflow.slice(mergeAt);

  it('merges with the release token, so the merge starts the release train', () => {
    expect(mergeAt).toBeGreaterThan(-1);
    expect(merge).toContain('GH_TOKEN: ${{ secrets.RELEASE_TOKEN }}');
    expect(merge).not.toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
  });

  it('names its own pull request by the head commit, not by being the newest', () => {
    const snapshotAt = workflow.indexOf('Snapshot open agent pull requests');
    expect(snapshotAt).toBeGreaterThan(-1);
    expect(snapshotAt).toBeLessThan(workflow.indexOf('Implement — DeepSeek 4.1 Flash (Execute)'));
    expect(merge).toContain('headRefOid');
    expect(merge).toContain('steps.snapshot.outputs.agent_prs');
  });

  it('refuses to merge when it cannot tell whose pull request it is', () => {
    expect(merge).toContain('if [ -z "$before" ]');
    expect(merge).toContain('if [ "$count" -gt 1 ]');
  });

  it('waits for the checks before it merges', () => {
    expect(merge).toContain('gh pr checks "$pr" --watch');
    expect(merge.indexOf('gh pr checks')).toBeLessThan(merge.indexOf('gh pr merge'));
  });

  it('normalizes the pull request title first, so repo-checks is green when it watches', () => {
    expect(workflow.indexOf('Normalize Agent PR Titles')).toBeLessThan(mergeAt);
  });

  it('merges only after the implement phase succeeded', () => {
    expect(merge).toContain("steps.implement.outcome == 'success'");
  });
});
