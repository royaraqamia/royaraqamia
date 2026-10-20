import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `repo-checks` must validate the title the pull request has *now*, not the one its
 * event carried. Two things make the payload stale: the agent workflows correct a
 * non-conventional title seconds after opening the pull request, and a re-run replays
 * the stored payload — so a payload read can stay red on a title that is already fixed.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom, where
 * import.meta.url is an http URL and `new URL` refuses it.
 */
describe('repo-checks reads the title the pull request has now', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '.github/workflows/repo-checks.yml'),
    'utf8'
  );
  // Comments explain why the payload is not read; only executable lines are asserted.
  const script = workflow
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

  it('reads the live title from the pull request instead of the event payload', () => {
    expect(script).not.toContain('github.event.pull_request.title');
    expect(script).toContain('gh pr view "$PR_NUMBER"');
    expect(workflow).toContain('pull-requests: read');
  });
});
