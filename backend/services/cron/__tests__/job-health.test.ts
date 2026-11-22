import { describe, expect, it } from 'vitest';

import type { ScheduledJobHealthRow } from '@/backend/repositories/cron/job-health-repository';
import { evaluateJobHealth, formatAge } from '@/backend/services/cron/job-health';

const NOW = new Date('2026-11-22T12:00:00.000Z');
const HOUR = 60 * 60;

function row(overrides: Partial<ScheduledJobHealthRow> = {}): ScheduledJobHealthRow {
  return {
    jobid: 5,
    jobname: 'daily-habit-recovery-nudge',
    schedule: '0 8 * * *',
    last_success: '2026-11-22T08:00:00.000Z',
    last_failure: null,
    failures_7d: 0,
    expected_interval_seconds: 26 * HOUR,
    owner: 'habitflow',
    ...overrides,
  };
}

describe('scheduled job health', () => {
  it('passes a job inside its declared interval', () => {
    const report = evaluateJobHealth([row()], NOW);

    expect(report.healthy).toBe(true);
    expect(report.problems).toEqual([]);
    expect(report.jobs[0]).toMatchObject({ jobid: 5, ageSeconds: 4 * HOUR });
  });

  it('fails a stale job, naming it and its age in the body', () => {
    const report = evaluateJobHealth([row({ last_success: '2026-11-19T08:00:00.000Z' })], NOW);

    expect(report.healthy).toBe(false);
    expect(report.problems).toMatchObject([
      {
        jobid: 5,
        jobname: 'daily-habit-recovery-nudge',
        reason: 'stale',
      },
    ]);
    const problem = report.problems[0]!;
    expect(problem.detail).toContain('daily-habit-recovery-nudge');
    expect(problem.detail).toContain('3 days');
    expect(problem.detail).toContain('26 hours');
  });

  it('fails a job that never succeeded in the retention window', () => {
    const report = evaluateJobHealth([row({ last_success: null })], NOW);

    expect(report.problems).toMatchObject([{ jobid: 5, reason: 'never_succeeded' }]);
  });

  it('fails an expected job whose cron row vanished', () => {
    const report = evaluateJobHealth([row({ jobname: null, last_success: null })], NOW);

    expect(report.problems).toMatchObject([{ jobid: 5, reason: 'not_scheduled' }]);
  });

  it('fails a live job that never declared an expectation', () => {
    const report = evaluateJobHealth([row({ expected_interval_seconds: null })], NOW);

    expect(report.problems).toMatchObject([{ jobid: 5, reason: 'no_expectation' }]);
  });

  it('fails when no expectations were found at all', () => {
    const report = evaluateJobHealth([], NOW);

    expect(report.healthy).toBe(false);
    expect(report.problems).toMatchObject([{ reason: 'no_contract' }]);
  });

  it('formats ages with ASCII digits at every boundary', () => {
    expect(formatAge(45)).toBe('45 seconds');
    expect(formatAge(90)).toBe('1 minutes');
    expect(formatAge(3 * HOUR)).toBe('3 hours');
    expect(formatAge(34 * 24 * HOUR)).toBe('34 days');
  });
});
