import { getAdminSupabase } from '@/backend/config/supabase';
import { createScheduledJobHealthRepository } from '@/backend/repositories/cron/job-health-repository';
import { ScheduledJobHealthService } from '@/backend/services/cron/job-health';

/** The scheduler's check reads the operator views on the service role. */
export function createScheduledJobHealthService(): ScheduledJobHealthService {
  return new ScheduledJobHealthService(createScheduledJobHealthRepository(getAdminSupabase()));
}
