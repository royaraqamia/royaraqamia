import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { HomeServiceKey } from '@/shared/contracts/home-services';

/**
 * The apps a member keeps on the homepage (ADR-0143).
 *
 * The repository knows the table and nothing about tabs: a key is stored as it
 * arrives, and an app retired from the catalog leaves a row no client matches.
 * `replace` writes the whole ordered set, because the client's truth is the
 * strip itself — order included — not a sequence of independent toggles.
 */
export interface HomeServicesRepository {
  /** Every route this member keeps, in tab order. */
  list(userId: string): Promise<string[]>;
  /** Make the account's set exactly `keys`, in the order given. */
  replace(userId: string, keys: readonly HomeServiceKey[]): Promise<void>;
}

export function createHomeServicesRepository(
  supabase: SupabaseClient<Database>
): HomeServicesRepository {
  return {
    async list(userId) {
      const { data, error } = await supabase
        .from('home_services')
        .select('service_key')
        .eq('user_id', userId)
        .order('position', { ascending: true })
        .order('added_at', { ascending: true })
        .order('service_key', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => row.service_key);
    },

    async replace(userId, keys) {
      const next = new Set<string>(keys);

      const { data: current, error: readError } = await supabase
        .from('home_services')
        .select('service_key')
        .eq('user_id', userId);
      if (readError) throw readError;

      const toRemove = (current ?? [])
        .map((row) => row.service_key)
        .filter((key) => !next.has(key));

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('home_services')
          .delete()
          .eq('user_id', userId)
          .in('service_key', toRemove);
        if (error) throw error;
      }

      if (keys.length === 0) return;

      const { error } = await supabase.from('home_services').upsert(
        keys.map((service_key, position) => ({ user_id: userId, service_key, position })),
        { onConflict: 'user_id,service_key' }
      );
      if (error) throw error;
    },
  };
}
