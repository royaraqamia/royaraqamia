import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { AdminUser } from '@/shared/contracts/users';

export interface RecipientEmail {
  id: string;
  email: string;
}

export interface AdminUsersRepository {
  search(query: string, limit?: number): Promise<AdminUser[]>;
  findExistingUserIds(ids: string[]): Promise<string[]>;
  findRecipientEmails(ids?: string[]): Promise<RecipientEmail[]>;
}

export function createAdminUsersRepository(
  supabase: SupabaseClient<Database>
): AdminUsersRepository {
  return {
    async search(query, limit = 50): Promise<AdminUser[]> {
      let builder = supabase
        .from('users')
        .select('id, name, email, avatar_url')
        .order('name', { ascending: true, nullsFirst: false })
        .limit(limit);

      const term = query.trim();
      if (term) {
        builder = builder.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
      }

      const { data } = await builder;
      return (data ?? []) as AdminUser[];
    },

    async findExistingUserIds(ids: string[]): Promise<string[]> {
      if (ids.length === 0) return [];
      const { data } = await supabase.from('users').select('id').in('id', ids);
      return (data ?? []).map((row) => row.id);
    },

    async findRecipientEmails(ids?: string[]): Promise<RecipientEmail[]> {
      let builder = supabase.from('users').select('id, email');
      if (ids && ids.length > 0) {
        builder = builder.in('id', ids);
      }
      const { data } = await builder;
      return (data ?? []).map((row) => ({ id: row.id, email: row.email }));
    },
  };
}
