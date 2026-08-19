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
  avatar_url: string | null;
  bio: string | null;
  is_admin: boolean;
}

export interface UserProfileRepository {
  upsert(input: UserProfileInput): Promise<void>;
  getById(id: string): Promise<UserProfile | null>;
}

export function createUserProfileRepository(
  supabase: SupabaseClient<Database>
): UserProfileRepository {
  return {
    async upsert(input) {
      await supabase
        .from('users')
        .upsert({
          id: input.id,
          email: input.email,
          name: input.name,
          avatar_url: input.avatar_url ?? null,
          created_at: new Date().toISOString(),
        })
        .maybeSingle();
    },

    async getById(id) {
      const { data } = await supabase
        .from('users')
        .select('id, email, name, avatar_url, bio, is_admin')
        .eq('id', id)
        .maybeSingle();
      return data ?? null;
    },
  };
}
