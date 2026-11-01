import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { HiddenServiceKey } from '@/shared/contracts/hidden-services';

/**
 * A member's hidden services (ADR-0112).
 *
 * The repository knows the table and nothing about menus: a key is stored as it
 * arrives, and a service retired from the catalog leaves a row no client matches.
 * `add`/`remove` rather than a whole-table replace, because the service is what
 * decides the difference — and keeping a row that stays hidden is what keeps its
 * `hidden_at` honest.
 */
export interface HiddenServicesRepository {
  /** Every route this member has hidden, in no particular order. */
  list(userId: string): Promise<string[]>;
  /** Hide these routes; one already hidden is not an error. */
  add(userId: string, keys: readonly HiddenServiceKey[]): Promise<void>;
  /** Unhide these routes; one already shown is not an error. */
  remove(userId: string, keys: readonly string[]): Promise<void>;
}

export function createHiddenServicesRepository(
  supabase: SupabaseClient<Database>
): HiddenServicesRepository {
  return {
    async list(userId) {
      const { data, error } = await supabase
        .from('hidden_services')
        .select('service_key')
        .eq('user_id', userId);
      if (error) throw error;
      return (data ?? []).map((row) => row.service_key);
    },

    async add(userId, keys) {
      if (keys.length === 0) return;
      const { error } = await supabase.from('hidden_services').upsert(
        keys.map((service_key) => ({ user_id: userId, service_key })),
        { onConflict: 'user_id,service_key', ignoreDuplicates: true }
      );
      if (error) throw error;
    },

    async remove(userId, keys) {
      if (keys.length === 0) return;
      const { error } = await supabase
        .from('hidden_services')
        .delete()
        .eq('user_id', userId)
        .in('service_key', keys);
      if (error) throw error;
    },
  };
}
