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

    async updateUserPassword(userId, password) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
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

    async getUserByEmail(email) {
      const target = email.trim().toLowerCase();
      const perPage = 1000;
      const maxPages = 100;

      // listUsers has no email filter, so paginate until the account is found
      // or the result set is exhausted (users beyond page 1 were previously unreachable).
      for (let page = 1; page <= maxPages; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error || !data?.users?.length) return { user: null };
        const found = data.users.find((u) => u.email?.trim().toLowerCase() === target);
        if (found) return { user: toAuthUser(found) };
        if (data.users.length < perPage) return { user: null };
      }
      return { user: null };
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
