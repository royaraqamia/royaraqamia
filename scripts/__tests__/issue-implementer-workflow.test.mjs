import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The implementer merges its own pull request once it is green (ADR 0120, which
 * supersedes ADR 0066 for this workflow alone). What these assert is the part a quiet
 * edit would break and nothing else would notice:
 *
 * - the merge arrives after the watch, never before it, and names the commit it watched;
 * - it is a squash with no branch deletion and no protection bypass;
 * - a red run is repaired once and then watched again, not retried in a loop;
 * - the picker reads the blocker edges and the plan instead of taking the lowest number;
 * - six rounds run one after another;
 * - the job installs the e2e and visual toolchain, because that is the evidence;
 * - a merged issue is not handed to a person, a green-but-unmerged one still is.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom, where
 * import.meta.url is an http URL and `new URL` refuses it.
 */
describe('the issue implementer merges what it watched go green', () => {
  const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
  const workflow = read('.github/workflows/issue-implementer.yml');
  const land = read('scripts/ci/land-pull-request.sh');
  const watchAt = workflow.indexOf("Watch the pull request's checks");
  const checks = workflow.slice(watchAt);

  it('merges the commit the checks ran on, so a late push cannot ride along', () => {
    expect(watchAt).toBeGreaterThan(-1);
    expect(land).toContain('gh pr merge "$pr" --squash --match-head-commit "$head"');
  });

  it('merges only after the watch has reported green', () => {
    const watched = land.indexOf('gh pr checks "$pr" --watch');
    const merged = land.indexOf('gh pr merge');
    expect(watched).toBeGreaterThan(-1);
    expect(merged).toBeGreaterThan(watched);
    expect(
      land.indexOf('status=green') === -1 ? land.indexOf('write status green') : 0
    ).toBeLessThan(merged);
  });

  it('never deletes the branch and never bypasses protection', () => {
    expect(land).not.toMatch(/gh pr merge[^\n]*--delete-branch/);
    expect(land).not.toMatch(/gh pr merge[^\n]*--admin/);
    expect(workflow).not.toContain('secrets.RELEASE_TOKEN');
  });

  it('repairs a red run once and watches the repair, instead of retrying in a loop', () => {
    expect(checks).toContain('Repair the failing checks');
    expect(checks).toContain('Watch the repaired pull request');
    expect(checks.indexOf('Repair the failing checks')).toBeLessThan(
      checks.indexOf('Watch the repaired pull request')
    );
    expect(checks).toContain("steps.checks.outputs.status == 'red'");
    expect(checks).toContain('One repair, not a loop');
    expect(checks.match(/name: Repair the failing checks/g)).toHaveLength(1);
  });

  it('installs the e2e and visual toolchain, because that is the evidence it merges on', () => {
    expect(workflow).toContain('npx playwright install --with-deps chromium');
    expect(workflow).toContain('npm run check:visual');
    expect(workflow).toContain('platforms;android-36');
  });

  it('takes the unblocked issue the plan puts first, not the lowest number', () => {
    expect(workflow).toContain('dependencies/blocked_by');
    expect(workflow).toContain('docs/mobile/parity-plan.json');
    expect(workflow).toContain('a blocker is still open');
  });

  it('runs six rounds one after another, so each branch is cut from the merge before it', () => {
    expect(workflow).toContain('round: [1, 2, 3, 4, 5, 6]');
    expect(workflow).toContain('max-parallel: 1');
    // Six by default, and a manual run can ask for fewer without editing the matrix.
    expect(workflow).toContain("default: '6'");
    expect(workflow).toContain('matrix.round <= fromJSON(github.event.inputs.rounds');
  });

  it('repairs on the pull request branch with the CLI, not with a second action run', () => {
    const repairAt = workflow.indexOf('Repair the failing checks');
    const recheckAt = workflow.indexOf('Watch the repaired pull request');
    const repair = workflow.slice(repairAt, recheckAt);
    expect(repair).toContain('gh pr checkout');
    expect(repair).toContain('opencode run --model');
    expect(repair).not.toContain('anomalyco/opencode/github@');
    expect(repair).toContain('git push origin "HEAD:');
  });

  it('normalizes the pull request title first, so repo-checks is green when it watches', () => {
    expect(workflow.indexOf('Normalize Agent PR Titles')).toBeLessThan(watchAt);
  });

  it('re-runs the Repo Checks run its rename invalidated, because a GITHUB_TOKEN event starts none', () => {
    const normalizeAt = workflow.indexOf('Normalize Agent PR Titles');
    expect(normalizeAt).toBeGreaterThan(-1);
    expect(workflow.slice(normalizeAt, watchAt)).toContain('reRunWorkflowFailedJobs');
    expect(workflow).toMatch(/actions:\s*write/);
  });

  it('records the merge and hands nothing to a person when it landed', () => {
    const merged = workflow.indexOf('The Issue Implementer merged pull request #');
    const handed = workflow.indexOf("labels: ['ready-for-human']");
    expect(merged).toBeGreaterThan(-1);
    expect(handed).toBeGreaterThan(merged);
    expect(workflow.slice(merged, handed)).not.toContain('ready-for-human');
  });

  it('still hands over a green pull request the merge was refused for', () => {
    expect(workflow).toContain('It is ready for a human to merge.');
    expect(workflow).toContain('ready-for-human');
  });
});
