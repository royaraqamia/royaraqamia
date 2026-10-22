import { getAdminSupabase } from '@/backend/config/supabase';
import {
  SupabaseUsageRepository,
  type UsageRepository,
} from '@/backend/repositories/plans/usage-repository';
import { UsageService } from '@/backend/services/plans/usage-service';

/**
 * Plans and allowance composition root.
 *
 * Every path runs on the service role: `user_plans`, `usage_events` and
 * `plan_activations` grant nothing to anon or authenticated, and the spend
 * RPCs are executable by service_role alone (ADR-0075). The three catalog
 * tables are public reads, because the pricing page and the offline client
 * both need the caps.
 */
export function createUsageRepository(): UsageRepository {
  return new SupabaseUsageRepository(getAdminSupabase());
}

export function createUsageService(): UsageService {
  return new UsageService(createUsageRepository());
}
