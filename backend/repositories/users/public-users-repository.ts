import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { PublicUser } from '@/shared/contracts/users';
import { sanitizeOrFilterTerm } from '@/backend/shared/postgrest-or-filter';

const PUBLIC_USER_COLUMNS = 'id, username, name, avatar_url, bio, verified';

/**
 * Read access to the public member directory.
 *
 * `public.users` is not readable by the anon client the feed runs on (RLS scopes
 * it to the owning session), so callers wire this to the service role and the
 * projection above keeps email, `is_admin` and every other private column out of
 * the returned shape. Directory reads are scoped to verified members so
 * unconfirmed signups never surface; `getByUsername` stays unfiltered because it
 * also backs the handle-uniqueness check.
 */
export interface PublicUsersRepository {
  /** Newest verified members first — the community page's "who's here" list. */
  list(limit: number): Promise<PublicUser[]>;
  /** Total members, for the roster badge. Independent of how many are shown. */
  count(): Promise<number>;
  /** Verified members matching the term. */
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
        .eq('verified', true)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) return [];
      return (data ?? []) as PublicUser[];
    },

    async count(): Promise<number> {
      const { count, error } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true });

      if (error) return 0;
      return count ?? 0;
    },

    async search(query, limit): Promise<PublicUser[]> {
      const term = sanitizeOrFilterTerm(query);
      if (!term) return [];

      const { data, error } = await supabase
        .from('users')
        .select(PUBLIC_USER_COLUMNS)
        .or(`name.ilike.%${term}%,username.ilike.%${term}%`)
        .eq('verified', true)
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
