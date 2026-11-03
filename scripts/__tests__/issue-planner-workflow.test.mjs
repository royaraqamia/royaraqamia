import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The planner files work an unattended implementer will act on, so a finding it could not
 * reproduce is the one failure mode worth guarding in the file itself:
 *
 * - every filed issue carries an `## Evidence` section;
 * - the run has the toolchain to produce that evidence, and the prompt says how;
 * - it cannot change the repository (no commit, no push, no pull request);
 * - it files three findings a day, not five.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom.
 */
describe('the issue planner files only what it reproduced', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '.github/workflows/issue-planner.yml'),
    'utf8'
  );

  it('requires an evidence section in every issue it files', () => {
    expect(workflow).toContain('## Evidence');
    expect(workflow).toContain('A hypothesis you could not verify is not a finding');
  });

  it('never assumes: it asks for the command and its output, not for an opinion', () => {
    expect(workflow).toContain('Never assume.');
    expect(workflow).toContain('the command, and the failing output');
  });

  it('has the toolchain the evidence needs', () => {
    expect(workflow).toContain('npx playwright install --with-deps chromium');
    expect(workflow).toContain('platforms;android-36');
    expect(workflow).toContain('npm run check:visual');
  });

  it('cannot change the repository: read-only contents, no push', () => {
    expect(workflow).toMatch(/contents:\s*read/);
    expect(workflow).not.toContain('gh pr create');
    expect(workflow).not.toContain('git push');
  });

  it('files three findings a day, not five', () => {
    expect(workflow).toContain('Keep at most the 3 highest-impact findings');
    expect(workflow).not.toContain('at most the 5 highest-impact');
  });
});
