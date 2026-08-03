import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HabitService } from '@/backend/services/habitflow/habit-service';
import { HabitBackupService } from '@/backend/services/habitflow/backup-service';
import type { IHabitRepository } from '@/shared/contracts/habitflow';
import { JsonFileHabitRepository } from '@/backend/repositories/habitflow/json-file-repository';
import { SupabaseHabitRepository } from '@/backend/repositories/habitflow/supabase-repository';

let cachedRepository: JsonFileHabitRepository | null = null;

export function getLocalHabitRepository(): JsonFileHabitRepository {
  if (!cachedRepository) {
    cachedRepository = new JsonFileHabitRepository();
  }
  return cachedRepository;
}

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
      const supabase = client ?? createClient(url, key);
      return {
        repository: new SupabaseHabitRepository(supabase, userId),
        mode: 'supabase',
      };
    } catch (e) {
      console.warn('Supabase init failed, falling back to local storage:', e);
    }
  }

  return { repository: getLocalHabitRepository(), mode: 'local' };
}

interface ServiceWithMode<T> {
  service: T;
  mode: 'supabase' | 'local';
}

export function createHabitService(
  userId?: string,
  client?: SupabaseClient
): ServiceWithMode<HabitService> {
  const { repository, mode } = getHabitRepository(userId, client);
  return { service: new HabitService(repository), mode };
}

export function createHabitBackupService(
  userId?: string,
  client?: SupabaseClient
): ServiceWithMode<HabitBackupService> {
  const { repository, mode } = getHabitRepository(userId, client);
  return { service: new HabitBackupService(repository), mode };
}
