import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createNewsRepository } from '@/backend/repositories/news';
import { createNewsService, type NewsService } from '@/backend/services/news/news-service';

/**
 * The digest is read, never written, by the app: publishing needs the service
 * role and happens in the GitHub workflow. A signed-in reader and an anonymous
 * one therefore take the same path, and the public client is the one wired here.
 */
export function createNewsServiceFor(supabase: SupabaseClient<Database>): NewsService {
  return createNewsService(createNewsRepository(supabase));
}
