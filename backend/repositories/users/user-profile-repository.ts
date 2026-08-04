import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';

export interface UserProfileInput {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
}

export interface UserProfileRepository {
  upsert(input: UserProfileInput): Promise<void>;
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
  };
}
