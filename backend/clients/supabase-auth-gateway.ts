import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { AuthGateway, AuthUser } from './auth-gateway';

export function createSupabaseAuthGateway(
  supabase: SupabaseClient<Database>,
  admin: SupabaseClient<Database>
): AuthGateway {
  return {
    async signUp(input) {
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: { data: { name: input.name } },
      });
      return {
        user: data.user ? { id: data.user.id } : null,
        error: error ? { message: error.message } : null,
      };
    },

    async signInWithPassword(input) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      return {
        user: data?.user ? toAuthUser(data.user) : null,
        error: error ? { message: error.message } : null,
      };
    },

    async getUser() {
      const { data } = await supabase.auth.getUser();
      return { user: data?.user ? toAuthUser(data.user) : null };
    },

    async updateUser(input) {
      const { error } = await supabase.auth.updateUser({ password: input.password });
      return { error: error ? { message: error.message } : null };
    },

    async signOut() {
      await supabase.auth.signOut();
    },

    async signInWithOAuth(provider, redirectTo) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      return {
        url: data.url ?? null,
        error: error ? { message: error.message } : null,
      };
    },

    async resetPasswordForEmail(email, redirectTo) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      return { error: error ? { message: error.message } : null };
    },

    async confirmUserEmail(userId) {
      await admin.auth.admin.updateUserById(userId, { email_confirm: true });
    },

    async listUsers() {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 10000 });
      return {
        users: data ? data.users.map(toAuthUser) : [],
        error: error ? { message: error.message } : null,
      };
    },
  };
}

function toAuthUser(user: {
  id: string;
  email?: string;
  user_metadata?: { name?: string };
  email_confirmed_at?: string | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email ?? '',
    name: user.user_metadata?.name ?? undefined,
    email_confirmed_at: user.email_confirmed_at ?? null,
  };
}
