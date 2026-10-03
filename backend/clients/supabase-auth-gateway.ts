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
        hasSession: Boolean(data.session),
        // Supabase returns an obfuscated user with no identities instead of an
        // error when the email is already registered.
        existing:
          Boolean(data.user) &&
          Array.isArray(data.user?.identities) &&
          data.user?.identities.length === 0,
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
      // The admin auth API has no email filter (listUsers pages the whole user
      // base), so resolve the user through a service-role-only RPC that reads
      // auth.users by its unique email index. This is O(1) and, unlike a
      // public.users lookup, stays correct even if the profile mirror is
      // missing a row.
      const { data, error } = await admin.rpc('get_auth_user_by_email', {
        p_email: email.trim().toLowerCase(),
      });

      if (error || !data || data.length === 0) return { user: null };

      const row = data[0];
      if (!row) return { user: null };
      return {
        user: {
          id: row.id,
          email: row.email ?? '',
          email_confirmed_at: row.email_confirmed_at ?? null,
        },
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
