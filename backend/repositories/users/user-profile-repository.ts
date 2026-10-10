import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';

export interface UserProfileInput {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  is_admin: boolean;
}

export interface UserProfileRepository {
  upsert(input: UserProfileInput): Promise<void>;
  getById(id: string): Promise<UserProfile | null>;
  updateProfile(
    id: string,
    input: {
      name?: string | null;
      username?: string;
      avatar_url?: string | null;
      bio?: string | null;
    }
  ): Promise<void>;
}

export function createUserProfileRepository(
  supabase: SupabaseClient<Database>
): UserProfileRepository {
  return {
    async upsert(input) {
      // `username` is deliberately omitted: the assign_username trigger fills it
      // (and resolves collisions) on insert — see migration 20261009120000. The
      // generated Insert type requires it because the column is NOT NULL with no
      // default, which cannot express a trigger-filled column, so we narrow the
      // payload to everything but username.
      type UsersInsert = Database['public']['Tables']['users']['Insert'];
      const payload = {
        id: input.id,
        email: input.email,
        name: input.name,
        avatar_url: input.avatar_url ?? null,
        created_at: new Date().toISOString(),
      } satisfies Omit<UsersInsert, 'username'>;

      await supabase
        .from('users')
        .upsert(payload as UsersInsert)
        .maybeSingle();
    },

    async getById(id) {
      const { data } = await supabase
        .from('users')
        .select('id, email, name, username, avatar_url, bio, is_admin')
        .eq('id', id)
        .maybeSingle();
      return data ?? null;
    },

    async updateProfile(id, input) {
      const updates: {
        name?: string | null;
        username?: string;
        avatar_url?: string | null;
        bio?: string | null;
      } = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.username !== undefined) updates.username = input.username;
      if (input.avatar_url !== undefined) updates.avatar_url = input.avatar_url;
      if (input.bio !== undefined) updates.bio = input.bio;

      const { error } = await supabase.from('users').update(updates).eq('id', id);
      if (error) throw error;
    },
  };
}
