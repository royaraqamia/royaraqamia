import { SupabaseClient } from '@supabase/supabase-js';
import { HabitService } from '@/shared/habitflow/habit-service';
import { getHabitRepository } from '@/backend/repositories/habitflow/repository-provider';

interface ServiceWithMode {
  service: HabitService;
  mode: 'supabase' | 'local';
}

export function createHabitService(userId?: string, client?: SupabaseClient): ServiceWithMode {
  const { repository, mode } = getHabitRepository(userId, client);
  return { service: new HabitService(repository), mode };
}
