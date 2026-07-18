import { HabitService } from '@/domains/habitflow/services/habit-service';
import { getHabitRepository } from '@/domains/habitflow/repositories/repository-provider';

export interface ServiceWithMode {
  service: HabitService;
  mode: 'supabase' | 'local';
}

export function createHabitService(userId?: string): ServiceWithMode {
  const { repository, mode } = getHabitRepository(userId);
  return { service: new HabitService(repository), mode };
}
