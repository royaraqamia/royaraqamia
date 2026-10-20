import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The manifest commit has to be the last writer on `main`: this workflow and the
 * release train both push there, and a manifest that lands mid-train used to make
 * the train's push lose its bump (ADR-0046).
 *
 * How the wait decides the train is done broke without failing. It polled for a
 * `Release` run whose `headSha` was its own commit, and a `Release` run reports the
 * branch tip there rather than the commit Code Quality tested — so the poll never
 * matched, and every shell release paid the full fifteen-minute cap. Measured on
 * shell 1.0.12: the train for `34e145d` ran as `0932f70`, and the job logged "no
 * release train run yet" forty-four times before pushing the manifest anyway
 * (ADR-0068).
 *
 * These pin the signal that replaced it — the tip of `main` — and the cap that
 * keeps a broken train from holding a shell release back.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom, where
 * import.meta.url is an http URL and `new URL` refuses it.
 */
describe('the manifest waits on main, not on a Release run', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '.github/workflows/shell-release.yml'),
    'utf8'
  );
  const stepAt = workflow.indexOf('Let the release train finish first');
  const step = workflow.slice(stepAt, workflow.indexOf('Land the manifest'));

  it('has the step it pins', () => {
    expect(stepAt).toBeGreaterThan(-1);
  });

  it('does not match on a run headSha, which a Release run never reports as the tested commit', () => {
    expect(step).not.toContain('headSha');
    expect(step).not.toContain('gh run list');
  });

  it('reads the tip of main rather than a run', () => {
    expect(step).toContain('git fetch origin main');
    expect(step).toContain('git log -1 --format=%s FETCH_HEAD');
  });

  it('treats a release commit at the tip as the train being done', () => {
    expect(step).toContain("'chore(release): '*");
    const caseAt = step.indexOf("'chore(release): '*");
    expect(step.slice(caseAt, caseAt + 400)).toContain('exit 0');
  });

  it('is bounded, and warns instead of failing when the train never lands', () => {
    expect(step).toContain('deadline=$((SECONDS + 900))');
    expect(step).toContain('::warning title=The release train never finished');
  });
});
