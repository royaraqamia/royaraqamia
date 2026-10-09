import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { PublicUser } from '@/shared/contracts/users';
import { sanitizeOrFilterTerm } from '@/backend/shared/postgrest-or-filter';

const PUBLIC_USER_COLUMNS = 'id, username, name, avatar_url, bio';

/**
 * Read access to the public member directory.
 *
 * `public.users` is not readable by the anon client the feed runs on (RLS scopes
 * it to the owning session), so callers wire this to the service role and the
 * projection above keeps email, `is_admin` and every other private column out of
 * the returned shape.
 */
export interface PublicUsersRepository {
  /** Newest members first — the community page's "who's here" list. */
  list(limit: number): Promise<PublicUser[]>;
  search(query: string, limit: number): Promise<PublicUser[]>;
  getByUsername(username: string): Promise<PublicUser | null>;
  getById(id: string): Promise<PublicUser | null>;
}

export function createPublicUsersRepository(
  supabase: SupabaseClient<Database>
): PublicUsersRepository {
  return {
    async list(limit): Promise<PublicUser[]> {
      const { data, error } = await supabase
        .from('users')
        .select(PUBLIC_USER_COLUMNS)
        .not('username', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) return [];
      return (data ?? []) as PublicUser[];
    },

    async search(query, limit): Promise<PublicUser[]> {
      const term = sanitizeOrFilterTerm(query);
      if (!term) return [];

      const { data, error } = await supabase
        .from('users')
        .select(PUBLIC_USER_COLUMNS)
        .not('username', 'is', null)
        .or(`name.ilike.%${term}%,username.ilike.%${term}%`)
        .order('name', { ascending: true, nullsFirst: false })
        .limit(limit);

      if (error) return [];
      return (data ?? []) as PublicUser[];
    },

    async getByUsername(username): Promise<PublicUser | null> {
      const { data, error } = await supabase
        .from('users')
        .select(PUBLIC_USER_COLUMNS)
        .eq('username', username.toLowerCase())
        .maybeSingle();

      if (error) return null;
      return (data as PublicUser | null) ?? null;
    },

    async getById(id): Promise<PublicUser | null> {
      const { data, error } = await supabase
        .from('users')
        .select(PUBLIC_USER_COLUMNS)
        .eq('id', id)
        .maybeSingle();

      if (error) return null;
      return (data as PublicUser | null) ?? null;
    },
  };
}
