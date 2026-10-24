import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import type { NewsPreferencesRepository } from '@/backend/repositories/news/news-preferences-repository';

/**
 * The reader's own source selection, keyed by user.
 *
 * The write is an upsert on `user_id`, because the row is created on first save
 * rather than at signup — the same lazy shape `user_settings` uses. The explicit
 * `user_id` filter on the read is belt and braces beside RLS: this repository is
 * also reachable with a service-role client, where RLS does not apply.
 */
export function createNewsPreferencesRepository(
  supabase: SupabaseClient<Database>
): NewsPreferencesRepository {
  return {
    async getSourceIds(userId: string): Promise<string[] | null> {
      const { data, error } = await supabase
        .from('news_source_preferences')
        .select('source_ids')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data ? data.source_ids : null;
    },

    async saveSourceIds(userId: string, sourceIds: readonly string[]): Promise<void> {
      const { error } = await supabase.from('news_source_preferences').upsert(
        {
          user_id: userId,
          source_ids: [...sourceIds],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (error) throw new Error(error.message);
    },
  };
}
