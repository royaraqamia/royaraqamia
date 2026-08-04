import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HabitService } from '@/backend/services/habitflow/habit-service';
import { HabitBackupService } from '@/backend/services/habitflow/backup-service';
import type { HabitRepository } from '@/shared/contracts/habitflow';
import { JsonFileHabitRepository } from '@/backend/repositories/habitflow/json-file-repository';
import { SupabaseHabitRepository } from '@/backend/repositories/habitflow/supabase-repository';
import { env } from '@/backend/config/env';
import { getDbPath } from '@/backend/config/habitflow/data-path';

export function getLocalHabitRepository(): JsonFileHabitRepository {
  return new JsonFileHabitRepository(getDbPath());
}

export function getHabitRepository(
  userId?: string,
  client?: SupabaseClient
): {
  repository: HabitRepository;
  mode: 'supabase' | 'local';
} {
  const url = env.habitflowSupabaseUrl;
  const key = env.supabasePublishableKey;

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

export function createLocalHabitService(): HabitService {
  return new HabitService(getLocalHabitRepository());
}

export function createHabitBackupService(
  userId?: string,
  client?: SupabaseClient
): ServiceWithMode<HabitBackupService> {
  const { repository, mode } = getHabitRepository(userId, client);
  return { service: new HabitBackupService(repository), mode };
}
