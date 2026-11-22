import type {
  ScheduledJobHealthRepository,
  ScheduledJobHealthRow,
} from '@/backend/repositories/cron/job-health-repository';

export type JobHealthProblemReason =
  'no_contract' | 'no_expectation' | 'not_scheduled' | 'never_succeeded' | 'stale';

export interface JobHealthProblem {
  jobid: number;
  jobname: string | null;
  reason: JobHealthProblemReason;
  /** Names the job and its age, which is what the workflow log needs. */
  detail: string;
}

export interface JobHealthJob {
  jobid: number;
  jobname: string | null;
  lastSuccess: string | null;
  ageSeconds: number | null;
  expectedIntervalSeconds: number | null;
  failures7d: number;
}

export interface JobHealthReport {
  healthy: boolean;
  checkedAt: string;
  jobs: JobHealthJob[];
  problems: JobHealthProblem[];
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/** A coarse, ASCII-digit age for the alarm body. Only ever called with >= 0. */
export function formatAge(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  if (value < SECONDS_PER_MINUTE) return `${value} seconds`;
  if (value < SECONDS_PER_HOUR) return `${Math.floor(value / SECONDS_PER_MINUTE)} minutes`;
  // Keep a day-plus interval in hours: "26 hours" reads better than "1 days".
  if (value < 2 * SECONDS_PER_DAY) return `${Math.floor(value / SECONDS_PER_HOUR)} hours`;
  return `${Math.floor(value / SECONDS_PER_DAY)} days`;
}

/**
 * The verdict the cron route serves. Every job must be inside the interval it
 * declared, be visible in cron.job, and have succeeded at least once in the
 * retention window. A vanished job and a job with no contract are both failures:
 * neither can be inferred from a view over live cron rows.
 */
export function evaluateJobHealth(
  rows: ScheduledJobHealthRow[],
  now: Date = new Date()
): JobHealthReport {
  const problems: JobHealthProblem[] = [];
  const jobs: JobHealthJob[] = [];

  if (rows.length === 0) {
    problems.push({
      jobid: 0,
      jobname: null,
      reason: 'no_contract',
      detail: 'no scheduled job expectations were found',
    });
  }

  for (const row of rows) {
    const label = row.jobname ?? `job #${row.jobid}`;
    const limit = row.expected_interval_seconds;
    const succeededAt = row.last_success ? Date.parse(row.last_success) : Number.NaN;
    const ageSeconds = Number.isNaN(succeededAt)
      ? null
      : Math.max(0, (now.getTime() - succeededAt) / 1000);

    jobs.push({
      jobid: row.jobid,
      jobname: row.jobname,
      lastSuccess: row.last_success,
      ageSeconds,
      expectedIntervalSeconds: limit,
      failures7d: row.failures_7d,
    });

    if (limit === null) {
      problems.push({
        jobid: row.jobid,
        jobname: row.jobname,
        reason: 'no_expectation',
        detail: `${label} has no declared expectation`,
      });
      continue;
    }
    if (row.jobname === null) {
      problems.push({
        jobid: row.jobid,
        jobname: null,
        reason: 'not_scheduled',
        detail: `expected job #${row.jobid} is not scheduled`,
      });
      continue;
    }
    if (ageSeconds === null) {
      problems.push({
        jobid: row.jobid,
        jobname: row.jobname,
        reason: 'never_succeeded',
        detail: `${label} has no successful run in the retention window`,
      });
      continue;
    }
    if (ageSeconds > limit) {
      problems.push({
        jobid: row.jobid,
        jobname: row.jobname,
        reason: 'stale',
        detail: `${label} last succeeded ${formatAge(ageSeconds)} ago (limit ${formatAge(limit)})`,
      });
    }
  }

  return {
    healthy: problems.length === 0,
    checkedAt: now.toISOString(),
    jobs,
    problems,
  };
}

export class ScheduledJobHealthService {
  constructor(private readonly repository: ScheduledJobHealthRepository) {}

  async check(now: Date = new Date()): Promise<JobHealthReport> {
    return evaluateJobHealth(await this.repository.rows(), now);
  }
}
