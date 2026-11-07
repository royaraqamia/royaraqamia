import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The implementer merges its own pull request once it is green (ADR 0120, which
 * supersedes ADR 0066 for this workflow alone). What these assert is the part a quiet
 * edit would break and nothing else would notice:
 *
 * - the merge arrives after the watch, never before it, and names the commit it watched;
 * - it is a squash, with no branch deletion in the merge itself and no protection bypass;
 * - a red round is repaired once and then watched again, not retried in a loop;
 * - the repair can authenticate, cut its branch from the live base, and is asked for the
 *   conflict first - a conflicted pull request is never measured at all;
 * - an unmeasured pull request is not called green;
 * - the picker reads the blocker edges and the plan instead of taking the lowest number;
 * - six rounds run one after another;
 * - the job installs the e2e and visual toolchain, because that is the evidence;
 * - nothing is ever handed to a person: the queue is the implementer's.
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

  it('never deletes the branch with the merge, and never bypasses protection', () => {
    expect(land).not.toMatch(/gh pr merge[^\n]*--delete-branch/);
    expect(land).not.toMatch(/gh pr merge[^\n]*--admin/);
    expect(workflow).not.toContain('secrets.RELEASE_TOKEN');
  });

  it('deletes the ref of the branch its merge finished', () => {
    // #1040, #1044, #1054-#1057: a merge made through the API by the Actions app applies
    // no "automatically delete head branches", so every round left its merged
    // `opencode/*` branch on the remote and the branch list read like work nobody landed.
    // The Telegram merge deletes the ref itself for the same reason.
    const mergedAt = land.indexOf('if [ "$state" = "MERGED" ]');
    expect(mergedAt).toBeGreaterThan(-1);
    expect(land.slice(mergedAt)).toContain('delete_merged_branch');
    expect(land).toContain('gh api -X DELETE "repos/$repo/git/refs/heads/$branch"');
    // The branch is deleted after the merge is read back, never before it: up to the merge
    // a conflict resolution may still need the branch.
    expect(land.indexOf('delete_merged_branch() {')).toBeLessThan(mergedAt);
    // Bookkeeping after a merge that already happened: it may never report a red round.
    const start = land.indexOf('delete_merged_branch() {');
    expect(land.slice(start, land.indexOf('\n}\n', start))).toContain('return 0');
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

  it('spends at most one round of a run on an issue, so one bad issue cannot take the day', () => {
    // 2026-11-06 and 2026-11-07: six rounds, every one of them #920, and nothing
    // landed. The queue deliberately keeps a failed issue, so the picker has to
    // remember what this run already tried.
    expect(workflow).toContain('opencode-run:');
    expect(workflow).toContain('attemptedInThisRun');
    expect(workflow).toContain('this run already spent a round on it');
    // The marker is written by the claim, which is the only thing that runs before
    // the next round's picker.
    const claimAt = workflow.indexOf('name: Claim the issue');
    const cutAt = workflow.indexOf('name: Cut the branch from the current main');
    expect(claimAt).toBeGreaterThan(-1);
    expect(workflow.slice(claimAt, cutAt)).toContain('context.runId');
  });

  it('gates on the month, because that is the window that refuses every call', () => {
    expect(workflow).toContain("cap-monthly-usd: '75'");
  });

  it('never lets a round end on a workflow file the push token cannot carry', () => {
    // The token is the OpenCode Agent app, whose permissions do not include
    // `workflows`: a diff that touches .github/workflows is rejected at push, so the
    // instruction is to stop and name the change instead of spending the round.
    expect(workflow).toContain('Never edit anything under `.github/workflows/`');
    expect(workflow).toContain('does not hold the `workflows` permission');
  });

  it('hands the visual gate its own account instead of the offline one', () => {
    expect(workflow).toContain('secrets.E2E_VISUAL_EMAIL');
    expect(workflow).toContain('secrets.E2E_VISUAL_PASSWORD');
  });

  it('runs six rounds one after another, so each branch is cut from the merge before it', () => {
    expect(workflow).toContain('round: [1, 2, 3, 4, 5, 6]');
    expect(workflow).toContain('max-parallel: 1');
    // Six by default, and a manual run can ask for fewer without editing the matrix.
    // The gate is in the guard step because a job-level `if` cannot read `matrix`.
    expect(workflow).toContain("default: '6'");
    expect(workflow).toContain('REQUESTED_ROUNDS: ${{ github.event.inputs.rounds }}');
    expect(workflow).toContain('round > requested');
  });

  it('repairs on the pull request branch with the CLI, not with a second action run', () => {
    const repairAt = workflow.indexOf('Repair the failing checks');
    const recheckAt = workflow.indexOf('Watch the repaired pull request');
    const repair = workflow.slice(repairAt, recheckAt);
    expect(repair).toContain('gh pr checkout');
    expect(repair).toContain('opencode run --model');
    expect(repair).not.toContain('anomalyco/opencode/github@');
    expect(repair).toContain('x-access-token:${AGENT_PUSH_TOKEN}@github.com');
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

  it('loads the design skills only when the issue draws a screen, and never the port database', () => {
    expect(workflow).toContain('`codebase-design`');
    expect(workflow).toContain('Do NOT load `ui-ux-pro-max` for a port');
    expect(workflow).toContain('`web-design-guidelines`');
  });

  it('runs only the gates the diff reaches, and the check that owns each generated source', () => {
    expect(workflow).toContain('The suite is never run in full');
    expect(workflow).toContain('`npm run check:copy`');
    expect(workflow).toContain('`npm run check:parity`');
    expect(workflow).toContain('`npm run check:tokens`');
  });

  it('asks the pull request body for what was checked on each screen', () => {
    expect(workflow).toContain('keyboard and focus');
    expect(workflow).toContain('the empty state, the error state and the loading state');
  });

  it('records the merge and hands nothing to a person when it landed', () => {
    const merged = workflow.indexOf('The Issue Implementer merged pull request #');
    const next = workflow.indexOf("if (result.status === 'implemented' && prNumber)", merged);
    expect(merged).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(merged);
    // The merged path closes the issue: no readiness label comes back and nothing is kept
    // in the queue.
    expect(workflow.slice(merged, next)).not.toContain('keepForTheAgent');
  });

  it('keeps an issue that did not land in the agent queue, and never labels it for a person', () => {
    // ADR 0120's amendment: the implementer reads this queue, so `ready-for-human` is a
    // label nothing would ever pick up. An unmerged round leaves the issue as it found it
    // and the next round takes it again.
    expect(workflow).not.toContain('ready-for-human');
    expect(workflow).toContain('keepForTheAgent');
    expect(workflow).toContain("labels: ['ready-for-agent']");
  });

  it('gives the repair a git credential, because checkout deliberately stores none', () => {
    const repairAt = workflow.indexOf('Repair the failing checks');
    const recheckAt = workflow.indexOf('Watch the repaired pull request');
    const repair = workflow.slice(repairAt, recheckAt);
    expect(repair).toContain('gh auth setup-git');
    expect(repair.indexOf('gh auth setup-git')).toBeLessThan(repair.indexOf('gh pr checkout'));
  });

  it('resolves the conflict with main before it looks for a failing check', () => {
    const repairAt = workflow.indexOf('Repair the failing checks');
    const recheckAt = workflow.indexOf('Watch the repaired pull request');
    const repair = workflow.slice(repairAt, recheckAt);
    expect(repair).toContain('git merge --no-edit FETCH_HEAD');
    expect(repair).toContain('resolving-merge-conflicts');
    // An unresolved conflict must never be staged and pushed as markers.
    expect(repair).toContain('git merge --abort');
  });

  it('cuts every round from the live main, because the checkout is the dispatch commit', () => {
    expect(workflow).toContain('Cut the branch from the current main');
    const cutAt = workflow.indexOf('Cut the branch from the current main');
    expect(workflow.slice(cutAt, workflow.indexOf('name: Implement '))).toContain(
      'git reset --hard'
    );
  });

  it('does not call a pull request nothing measured green', () => {
    expect(land).toContain('substantive_checks');
    expect(land).toContain('No check ran on');
    // The skipped Supabase integration check is not a measurement.
    expect(land).toContain('SKIPPED|NEUTRAL');
  });

  it('names a conflict with main instead of watching it for checks it can never get', () => {
    expect(land).toContain('CONFLICTING');
    expect(land).toContain('conflicts with main');
  });

  it('reports why the merge was refused, not just that it was', () => {
    expect(land).toContain('The merge of #$pr was refused');
  });

  it('closes the issue its merge named, because `Closes` is only a request through the API', () => {
    // #1061: every implementer merge left its issue open - GitHub had recorded the link,
    // and only the merge path differed from the web UI's.
    const mergedAt = land.indexOf('if [ "$state" = "MERGED" ]');
    expect(mergedAt).toBeGreaterThan(land.indexOf('gh pr merge'));
    // GitHub's own record of the link, not a regex over a body that may say `Fixes` or
    // have been edited after the request opened.
    expect(land).toContain('closingIssuesReferences');
    expect(land).toContain('gh issue close "$number" --reason completed');
    expect(land.slice(mergedAt)).toContain('close_linked_issues');
    // The message that used to claim a close which never happened.
    expect(land).not.toContain('its Closes line closes the issue');
  });

  it('does not fail the landing when there is nothing it can close', () => {
    const start = land.indexOf('close_linked_issues() {');
    const closer = land.slice(start, land.indexOf('\n}\n', start));
    expect(start).toBeGreaterThan(-1);
    expect(closer).toContain('return 0');
    // Already closed, another repository's issue, and a link that is not an issue are
    // bookkeeping: the merge already happened, so none of them reports a red round.
    expect(closer).toContain('CLOSED');
    expect(closer).toContain('leaving it open');
    expect(closer).toContain('leaving it alone');
    expect(closer).not.toMatch(/\bred /);
  });

  it('closes the linked issue from pr-land too, because the landing script is shared', () => {
    expect(read('.github/workflows/pr-land.yml')).toContain('bash scripts/ci/land-pull-request.sh');
  });
});
