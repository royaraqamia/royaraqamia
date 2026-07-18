import { IHabitRepository } from '@/domains/habitflow/models';
import { JsonFileHabitRepository } from './json-file-repository';
import { SupabaseHabitRepository } from './supabase-repository';

let cachedRepository: IHabitRepository | null = null;

export function getHabitRepository(userId?: string): {
  repository: IHabitRepository;
  mode: 'supabase' | 'local';
} {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (userId && url && key) {
    try {
      return { repository: new SupabaseHabitRepository(userId), mode: 'supabase' };
    } catch (e) {
      console.warn('Supabase init failed, falling back to local storage:', e);
    }
  }

  if (!cachedRepository) {
    cachedRepository = new JsonFileHabitRepository();
  }
  return { repository: cachedRepository, mode: 'local' };
}
