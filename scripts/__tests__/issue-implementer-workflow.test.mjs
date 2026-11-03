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
 * - the picker reads the blocker edges and the plan instead of taking the lowest number;
 * - six rounds run one after another;
 * - a merged issue is not handed to a person, a green-but-unmerged one still is.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom, where
 * import.meta.url is an http URL and `new URL` refuses it.
 */
describe('the issue implementer merges what it watched go green', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '.github/workflows/issue-implementer.yml'),
    'utf8'
  );
  const watchAt = workflow.indexOf("Watch the pull request's checks");
  const checks = workflow.slice(watchAt);

  it('merges the commit the checks ran on, so a late push cannot ride along', () => {
    expect(watchAt).toBeGreaterThan(-1);
    expect(checks).toContain('gh pr merge "$pr" --squash --match-head-commit "$head"');
  });

  it('merges only after the watch has reported green', () => {
    const watched = checks.indexOf('gh pr checks "$pr" --watch');
    const merged = checks.indexOf('gh pr merge');
    expect(watched).toBeGreaterThan(-1);
    expect(merged).toBeGreaterThan(watched);
    expect(checks.indexOf('status=green')).toBeLessThan(merged);
  });

  it('never deletes the branch and never bypasses protection', () => {
    // The comments name both flags (to say they are not used), so the assertion is on
    // the command that runs, not on the word appearing in the file.
    expect(workflow).not.toMatch(/gh pr merge[^\n]*--delete-branch/);
    expect(workflow).not.toMatch(/gh pr merge[^\n]*--admin/);
    expect(workflow).not.toContain('secrets.RELEASE_TOKEN');
  });

  it('takes the unblocked issue the plan puts first, not the lowest number', () => {
    expect(workflow).toContain('dependencies/blocked_by');
    expect(workflow).toContain('docs/mobile/parity-plan.json');
    expect(workflow).toContain('a blocker is still open');
  });

  it('runs six rounds one after another, so each branch is cut from the merge before it', () => {
    expect(workflow).toContain('round: [1, 2, 3, 4, 5, 6]');
    expect(workflow).toContain('max-parallel: 1');
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
