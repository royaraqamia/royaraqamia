import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The landing workflow exists because a pull request an implementer run left behind used
 * to be nobody's: the picker skips an issue an open pull request names, so a red one
 * parked its issue for good (#996-#1000). What these assert is the part a quiet edit
 * would break and nothing else would notice:
 *
 * - the sweep never runs against a pull request while the implementer is landing its own;
 * - one landing run per pull request, so `concurrency` can be per pull request;
 * - a red pull request is repaired once per run and watched again, not retried in a loop;
 * - an unmeasured head is never called green, and a repair that cannot be measured says so;
 * - nothing loops forever: a stuck pull request is labelled and left alone.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom, where
 * `import.meta.url` is an http URL and `new URL` refuses it.
 */
describe('the landing workflow keeps no pull request unattended', () => {
  const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
  const workflow = read('.github/workflows/pr-land.yml');
  const implementer = read('.github/workflows/issue-implementer.yml');
  const sweepAt = workflow.indexOf('Find the pull requests to land');
  const landAt = workflow.indexOf('Land pull request');
  const sweep = workflow.slice(sweepAt, landAt);
  const land = workflow.slice(landAt);

  it('sweeps on a schedule, because a stranded pull request waits at most one interval', () => {
    expect(workflow).toMatch(/schedule:/);
    expect(workflow).toContain("cron: '*/30 * * * *'");
    expect(workflow).toContain('workflow_dispatch');
  });

  it('stays out of the way while the implementer lands its own pull request', () => {
    expect(sweep).toContain("workflow_id: 'issue-implementer.yml'");
    expect(sweep).toContain("run.status === 'in_progress'");
    expect(sweep).toContain('owns landing right now');
  });

  it('dispatches one run per pull request, so two falling landings never share a branch', () => {
    expect(sweep).toContain('createWorkflowDispatch');
    expect(sweep).toContain("workflow_id: 'pr-land.yml'");
    expect(workflow).toContain("group: pr-land-${{ github.event.inputs.pr || 'sweep' }}");
  });

  it('only lands the implementer branches, and never a stuck one', () => {
    expect(land).toContain("startsWith('opencode/')");
    expect(land).toContain('opencode:stuck');
    expect(land).toContain("core.setOutput('skip'");
  });

  it('watches with the same script the implementer uses, so the gate cannot drift', () => {
    expect(land).toContain('bash scripts/ci/land-pull-request.sh "$PR"');
  });

  it('repairs once per run and watches the repair, instead of retrying in a loop', () => {
    const repair = land.indexOf('Repair the pull request');
    const recheck = land.indexOf('Watch the repaired pull request');
    expect(repair).toBeGreaterThan(-1);
    expect(recheck).toBeGreaterThan(repair);
    expect(land).toContain("steps.land.outputs.status == 'red'");
    expect(land.slice(repair, recheck)).toContain('opencode run --model');
  });

  it('gives the repair a credential whose push CI will actually run on', () => {
    // `GITHUB_TOKEN` pushes start no workflow, so a repair under it would never be
    // measured. The PAT is the difference between a repair and a comment - and it is a
    // push credential only: every read, comment, label and merge stays on GITHUB_TOKEN,
    // so the PAT can be scoped to `Contents: Read and write` alone.
    expect(workflow).toContain('AGENT_PUSH_TOKEN: ${{ secrets.AGENT_PUSH_TOKEN }}');
    expect(workflow).toContain('HAS_PUSH_TOKEN');
    expect(workflow).toContain('AGENT_PUSH_TOKEN is missing');
    expect(workflow).toContain('x-access-token:${AGENT_PUSH_TOKEN}@github.com');
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(implementer).toContain('AGENT_PUSH_TOKEN: ${{ secrets.AGENT_PUSH_TOKEN }}');
    expect(implementer).toContain('x-access-token:${AGENT_PUSH_TOKEN}@github.com');
  });

  it('stops after a bounded number of attempts instead of spending every agent run', () => {
    expect(workflow).toContain('MAX_ATTEMPTS');
    expect(workflow).toContain('pr-land-attempt');
    expect(workflow).toContain('gh pr edit "$PR" --add-label opencode:stuck');
  });

  it('checks out the branch with a credential helper, because checkout stores none', () => {
    expect(land).toContain('gh auth setup-git');
    expect(land.indexOf('gh auth setup-git')).toBeLessThan(land.indexOf('gh pr checkout'));
  });

  it('installs the toolchain the repair has to run gates with', () => {
    expect(land).toContain('npx playwright install --with-deps chromium');
    expect(land).toContain('platforms;android-36');
    expect(land).toContain('npm install --global opencode-ai@');
  });
});
