import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { repositoryFailure } from '@/backend/shared/repository-error';

/**
 * One row of the scheduler's contract with itself. The function joins the
 * health view to the expectation table with a full join, so an expected job
 * whose cron row vanished arrives here with a null name and last_success — the
 * case a read of cron.job alone cannot see.
 */
export interface ScheduledJobHealthRow {
  jobid: number;
  jobname: string | null;
  schedule: string | null;
  last_success: string | null;
  last_failure: string | null;
  failures_7d: number;
  /** Seconds from the declared interval; null when the job has no expectation. */
  expected_interval_seconds: number | null;
  owner: string | null;
}

export interface ScheduledJobHealthRepository {
  rows(): Promise<ScheduledJobHealthRow[]>;
}

export function createScheduledJobHealthRepository(
  supabase: SupabaseClient<Database>
): ScheduledJobHealthRepository {
  return {
    async rows() {
      const { data, error } = await supabase.rpc('scheduled_job_health_rows');
      if (error) throw repositoryFailure('scheduled_job_health_rows', error);
      return (data ?? []) as ScheduledJobHealthRow[];
    },
  };
}
