import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { MemberProfile, PublicUser } from '@/shared/contracts/users';
import { sanitizeOrFilterTerm } from '@/backend/shared/postgrest-or-filter';
import { guardRepositoryMethods, isNotFoundError } from '@/backend/shared/repository-error';

const PUBLIC_USER_COLUMNS = 'id, username, name, avatar_url, bio, verified';

/** The single-row profile read also carries the flag the route has to judge. */
const MEMBER_PROFILE_COLUMNS = `${PUBLIC_USER_COLUMNS}, is_hidden`;

/**
 * Read access to the public member directory.
 *
 * `public.users` is not readable by the anon client the feed runs on (RLS scopes
 * it to the owning session), so callers wire this to the service role and the
 * projection above keeps email, `is_admin` and every other private column out of
 * the returned shape. Directory reads are scoped to verified members so
 * unconfirmed signups never surface; `getByUsername` stays unfiltered because it
 * also backs the handle-uniqueness check.
 *
 * Every listing also skips hidden rows (ADR-0127): the E2E fixture account is a
 * real confirmed member, and an internal row must not be named by the roster,
 * the member search, the sitemap or the chat picker. The row itself stays
 * readable in the single-id and by-handle reads on purpose — a chat thread that
 * already has it must still resolve its name, and a new signup claiming that
 * handle must still be refused as taken.
 */
export interface PublicUsersRepository {
  /** Newest visible members first — the community page's "who's here" list. */
  list(limit: number): Promise<PublicUser[]>;
  /** Total listed members, for the roster badge. Independent of the page size. */
  count(): Promise<number>;
  /**
   * Every visible verified handle, for `sitemap.ts`. One column and no profile
   * payload: the roster's own page size (`list`) is a display cap, not the
   * directory.
   */
  listVerifiedHandles(limit: number): Promise<string[]>;
  /** Visible verified members matching the term. */
  search(query: string, limit: number): Promise<PublicUser[]>;
  /** Any member by handle, hidden or not, with the flag the caller judges. */
  getByUsername(username: string): Promise<MemberProfile | null>;
  getById(id: string): Promise<PublicUser | null>;
  /** Several members in one read, for a chat thread's roster. */
  getMany(ids: string[]): Promise<PublicUser[]>;
}

export function createPublicUsersRepository(
  supabase: SupabaseClient<Database>
): PublicUsersRepository {
  return guardRepositoryMethods<PublicUsersRepository>({
    async list(limit): Promise<PublicUser[]> {
      const { data, error } = await supabase
        .from('users')
        .select(PUBLIC_USER_COLUMNS)
        .eq('verified', true)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as PublicUser[];
    },

    async count(): Promise<number> {
      const { count, error } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('is_hidden', false);

      if (error) throw error;
      return count ?? 0;
    },

    async listVerifiedHandles(limit): Promise<string[]> {
      const { data, error } = await supabase
        .from('users')
        .select('username')
        .eq('verified', true)
        .eq('is_hidden', false)
        .order('username', { ascending: true })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map((row) => row.username);
    },

    async search(query, limit): Promise<PublicUser[]> {
      const term = sanitizeOrFilterTerm(query);
      if (!term) return [];

      const { data, error } = await supabase
        .from('users')
        .select(PUBLIC_USER_COLUMNS)
        .or(`name.ilike.%${term}%,username.ilike.%${term}%`)
        .eq('verified', true)
        .eq('is_hidden', false)
        .order('name', { ascending: true, nullsFirst: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as PublicUser[];
    },

    async getByUsername(username): Promise<MemberProfile | null> {
      const { data, error } = await supabase
        .from('users')
        .select(MEMBER_PROFILE_COLUMNS)
        .eq('username', username.toLowerCase())
        .maybeSingle();

      // Only PostgREST's no-rows code means absence; anything else is an outage
      // and must not render as `/u/[username]` not-found.
      if (error && !isNotFoundError(error)) throw error;
      return (data as MemberProfile | null) ?? null;
    },

    async getById(id): Promise<PublicUser | null> {
      const { data, error } = await supabase
        .from('users')
        .select(PUBLIC_USER_COLUMNS)
        .eq('id', id)
        .maybeSingle();

      if (error && !isNotFoundError(error)) throw error;
      return (data as PublicUser | null) ?? null;
    },

    async getMany(ids): Promise<PublicUser[]> {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return [];

      const { data, error } = await supabase
        .from('users')
        .select(PUBLIC_USER_COLUMNS)
        .in('id', unique);

      if (error) throw error;
      return (data ?? []) as PublicUser[];
    },
  });
}
