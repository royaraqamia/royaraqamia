import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';

export interface AdminAllowlistRepository {
  sync(emails: string[]): Promise<void>;
}

export function createAdminAllowlistRepository(
  supabase: SupabaseClient<Database>
): AdminAllowlistRepository {
  return {
    async sync(emails) {
      const { data } = await supabase
        .from('app_settings')
        .select('admin_emails')
        .eq('id', true)
        .maybeSingle();

      const current = (data?.admin_emails ?? []) as string[];
      const isSame =
        current.length === emails.length && emails.every((e) => current.includes(e));
      if (isSame) return;

      await supabase.from('app_settings').upsert({ id: true, admin_emails: emails });
      await supabase.rpc('recompute_admin_flags', { p_emails: emails });
    },
  };
}
