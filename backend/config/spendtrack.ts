import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createSpendtrackRepository } from '@/backend/repositories/spendtrack';
import { SpendtrackService } from '@/backend/services/spendtrack/spendtrack-service';

export function createSpendtrackService(supabase: SupabaseClient<Database>): SpendtrackService {
  return new SpendtrackService(createSpendtrackRepository(supabase));
}
