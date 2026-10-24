import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createNewsRepository } from '@/backend/repositories/news';
import { createNewsPreferencesRepository } from '@/backend/repositories/news/news-preferences';
import {
  createNewsPreferencesService,
  type NewsPreferencesService,
} from '@/backend/services/news/news-preferences-service';
import { createNewsService, type NewsService } from '@/backend/services/news/news-service';

/**
 * The digest is read, never written, by the app: publishing needs the service
 * role and happens in the GitHub workflow. A signed-in reader and an anonymous
 * one therefore take the same path, and the public client is the one wired here.
 */
export function createNewsServiceFor(supabase: SupabaseClient<Database>): NewsService {
  return createNewsService(createNewsRepository(supabase));
}

/**
 * The reader's own selection, wired to the session-scoped client so RLS answers
 * for the row. Separate from `createNewsServiceFor` because the digest reader is
 * public and this one is not.
 */
export function createNewsPreferencesServiceFor(
  supabase: SupabaseClient<Database>
): NewsPreferencesService {
  return createNewsPreferencesService(createNewsPreferencesRepository(supabase));
}
