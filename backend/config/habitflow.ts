import type { SupabaseClient } from '@supabase/supabase-js';
import { HabitService } from '@/backend/services/habitflow/habit-service';
import type { IHabitRepository } from '@/shared/contracts/habitflow';
import { JsonFileHabitRepository } from '@/backend/repositories/habitflow/json-file-repository';
import { SupabaseHabitRepository } from '@/backend/repositories/habitflow/supabase-repository';

let cachedRepository: IHabitRepository | null = null;

export function getHabitRepository(
  userId?: string,
  client?: SupabaseClient
): {
  repository: IHabitRepository;
  mode: 'supabase' | 'local';
} {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (userId && url && key) {
    try {
      return { repository: new SupabaseHabitRepository(userId, client), mode: 'supabase' };
    } catch (e) {
      console.warn('Supabase init failed, falling back to local storage:', e);
    }
  }

  if (!cachedRepository) {
    cachedRepository = new JsonFileHabitRepository();
  }
  return { repository: cachedRepository, mode: 'local' };
}

interface ServiceWithMode {
  service: HabitService;
  mode: 'supabase' | 'local';
}

export function createHabitService(userId?: string, client?: SupabaseClient): ServiceWithMode {
  const { repository, mode } = getHabitRepository(userId, client);
  return { service: new HabitService(repository), mode };
}
