import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Go plan's allowance is spent per token at list price, so two things in these
 * files decide what a month costs before any agent runs: the hour a schedule fires,
 * and the reasoning depth a model call asks for (ADR-0133).
 *
 * DeepSeek V4.1 Flash costs double inside its peak windows — 01:00-04:00 and
 * 06:00-10:00 UTC, Monday to Friday — and the allowance counts those dollars.
 * `variant: high` is not a quality requirement anywhere in this repository: the
 * issue's acceptance criteria are the spec, and the extra reasoning only multiplies
 * the output tokens charged for.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom.
 */

const WORKFLOWS = [
  'issue-planner.yml',
  'issue-implementer.yml',
  'pr-land.yml',
  'opencode.yml',
  'telegram.yml',
  'news-digest.yml',
];

/** Minutes after midnight, from a five-field cron. */
function minuteOfDay(expression) {
  const [minute, hour] = expression.trim().split(/\s+/);
  return Number(minute) + Number(hour) * 60;
}

/** 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday. */
function isPeak(minutes) {
  return (minutes >= 60 && minutes < 240) || (minutes >= 360 && minutes < 600);
}

describe('agent cost is chosen in the workflow, not discovered on the invoice', () => {
  const read = (name) => readFileSync(resolve(process.cwd(), '.github/workflows', name), 'utf8');

  it('keeps every scheduled agent run out of the peak-price windows', () => {
    for (const name of WORKFLOWS) {
      const workflow = read(name);
      const crons = [...workflow.matchAll(/-\s+cron:\s*'([^']+)'/g)].map((match) => match[1]);
      for (const expression of crons) {
        // `*/2` is an interval, not a fixed hour; it is tested where it is written.
        if (!/^\d+\s+\d+\s/.test(expression)) continue;
        expect(isPeak(minuteOfDay(expression)), `${name} runs at ${expression}`).toBe(false);
      }
    }
  });

  it('does not ask for a reasoning variant anywhere', () => {
    for (const name of WORKFLOWS) {
      expect(read(name), `${name} still asks for variant: high`).not.toMatch(
        /^\s*variant:\s*high/m
      );
    }
  });

  it('records what each agent workflow spent, and gates only the optional work', () => {
    for (const name of WORKFLOWS) {
      expect(read(name), `${name} does not record its spend`).toContain(
        './.github/actions/agent-usage'
      );
    }
    // The planner and the two interactive surfaces are measured but never gated:
    // a person asked for the run, and the planner is one run a day.
    expect(read('issue-planner.yml')).not.toContain('mode: gate');
    expect(read('opencode.yml')).not.toContain('mode: gate');
    expect(read('telegram.yml')).not.toContain('mode: gate');
  });

  it('every recorded step is best-effort, so a ledger outage cannot fail a merge', () => {
    for (const name of WORKFLOWS) {
      const workflow = read(name);
      const records = workflow.split('- name:').filter((step) => step.includes('mode: record'));
      for (const step of records) {
        expect(step, `${name}: a record step must not fail the job`).toContain(
          'continue-on-error: true'
        );
      }
    }
  });
});
