import type { SupabaseClient } from '@supabase/supabase-js';
import { HabitService } from '@/backend/services/habitflow/habit-service';
import { HabitBackupService } from '@/backend/services/habitflow/backup-service';
import type { HabitRepository } from '@/shared/contracts/habitflow';
import { SupabaseHabitRepository } from '@/backend/repositories/habitflow/supabase-repository';

export function getHabitRepository(
  userId: string,
  client: SupabaseClient
): {
  repository: HabitRepository;
  mode: 'supabase';
} {
  return {
    repository: new SupabaseHabitRepository(client, userId),
    mode: 'supabase',
  };
}

interface ServiceWithMode<T> {
  service: T;
  mode: 'supabase';
}

export function createHabitService(
  userId: string,
  client: SupabaseClient
): ServiceWithMode<HabitService> {
  const { repository, mode } = getHabitRepository(userId, client);
  return { service: new HabitService(repository), mode };
}

export function createHabitBackupService(
  userId: string,
  client: SupabaseClient
): ServiceWithMode<HabitBackupService> {
  const { repository, mode } = getHabitRepository(userId, client);
  return { service: new HabitBackupService(repository), mode };
}
