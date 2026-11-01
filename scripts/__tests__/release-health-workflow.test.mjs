import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The dead-man's switch is only a switch if it says something (ADR-0090). Two
 * ways it went quiet, both pinned here: a prose line appended to
 * `$GITHUB_OUTPUT` failed the reading step for four daily runs
 * (2026-10-29 → 2026-11-01), and the alert step was skipped whenever that
 * reading step failed, so nothing was opened, updated or closed.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom, where
 * import.meta.url is an http URL and `new URL` refuses it.
 */
const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/release-health.yml'),
  'utf8'
);

const stepOf = (name) => {
  const at = workflow.indexOf(`- name: ${name}`);
  expect(at).toBeGreaterThan(-1);
  const next = workflow.indexOf('\n      - name:', at);
  return workflow.slice(at, next === -1 ? undefined : next);
};

describe('the release health switch', () => {
  it('reads the train every day, and can be dispatched by hand', () => {
    expect(workflow).toContain("cron: '0 7 * * *'");
    expect(workflow).toMatch(/workflow_dispatch:/);
  });

  it('pipes the reading step, and only that, into $GITHUB_OUTPUT', () => {
    const step = stepOf("Read the train's backlog");
    expect(step).toContain('node scripts/android-release.mjs --health');
    expect(step).toContain('>> "$GITHUB_OUTPUT"');
    // The prose a person reads is the script's stderr; GitHub parses stdout.
    expect(step).not.toContain('|');
    expect(workflow.match(/>> "\$GITHUB_OUTPUT"/g)).toHaveLength(1);
  });

  it('alerts even when the reading step failed', () => {
    const step = stepOf('Open, update or close the alert');
    expect(step).toContain('if: always()');
    expect(step).toContain("TRAIN_OK: ${{ steps.train.outcome == 'success' }}");
    // A blind run opens its own issue rather than the overdue one.
    expect(step).toContain('Release health cannot read the train');
    expect(step.indexOf('if (blind)')).toBeLessThan(step.indexOf('if (!stalled)'));
  });
});
