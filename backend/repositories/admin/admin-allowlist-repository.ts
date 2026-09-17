import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { isSameAllowlist } from '@/backend/shared/admin-validator';

export interface AdminAllowlistRepository {
  /** The allowlist currently stored in the database. */
  read(): Promise<string[]>;
  /** Rewrite the stored allowlist and recompute the derived flags, if it differs. */
  sync(emails: string[]): Promise<void>;
}

export function createAdminAllowlistRepository(
  supabase: SupabaseClient<Database>
): AdminAllowlistRepository {
  async function read(): Promise<string[]> {
    const { data } = await supabase
      .from('app_settings')
      .select('admin_emails')
      .eq('id', true)
      .maybeSingle();

    return (data?.admin_emails ?? []) as string[];
  }

  return {
    read,

    async sync(emails) {
      const current = await read();
      if (isSameAllowlist(current, emails)) return;

      await supabase.from('app_settings').upsert({ id: true, admin_emails: emails });
      await supabase.rpc('recompute_admin_flags', { p_emails: emails });
    },
  };
}
