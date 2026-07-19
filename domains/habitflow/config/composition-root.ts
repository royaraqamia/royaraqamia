import { SupabaseClient } from '@supabase/supabase-js';
import { HabitService } from '@/domains/habitflow/services/habit-service';
import { getHabitRepository } from '@/domains/habitflow/repositories/repository-provider';

export interface ServiceWithMode {
  service: HabitService;
  mode: 'supabase' | 'local';
}

export function createHabitService(userId?: string, client?: SupabaseClient): ServiceWithMode {
  const { repository, mode } = getHabitRepository(userId, client);
  return { service: new HabitService(repository), mode };
}
