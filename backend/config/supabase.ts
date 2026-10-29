import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/backend/models/database.types';
import { env } from '@/backend/config/env';

let adminClient: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Returns a Supabase client with the service role key.
 * Use ONLY for privileged server-side operations (writes, admin queries).
 * For public read-only queries (e.g. certificate verification), use the publishable key instead.
 */
export function getAdminSupabase() {
  if (!adminClient) {
    const url = env.supabaseUrl;
    const serviceRoleKey = env.supabaseServiceRoleKey;

    if (!url) {
      throw new Error('[getAdminSupabase] Missing env var: NEXT_PUBLIC_SUPABASE_URL');
    }
    if (!serviceRoleKey) {
      throw new Error('[getAdminSupabase] Missing env var: SUPABASE_SERVICE_ROLE_KEY');
    }

    adminClient = createClient<Database>(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}

let publicClient: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Anonymous REST client using the publishable (anon) key.
 * For public, read-only server-side operations that rely on RLS
 * (e.g. certificate verification) — never uses the service role key.
 */
export function getPublicSupabase() {
  if (!publicClient) {
    const url = env.supabaseUrl;
    const publishableKey = env.supabasePublishableKey;

    if (!url) {
      throw new Error('[getPublicSupabase] Missing env var: NEXT_PUBLIC_SUPABASE_URL');
    }
    if (!publishableKey) {
      throw new Error('[getPublicSupabase] Missing env var: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    }

    publicClient = createClient<Database>(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return publicClient;
}

/**
 * A Supabase client that acts as the caller, not as the deployment.
 *
 * `@supabase/ssr` builds a client around a cookie jar, which is exactly the
 * thing a native client does not have. This factory is the other half of the
 * identity seam: the access token the request carried becomes the
 * `Authorization` header every PostgREST call uses, so RLS authorizes the
 * token's user. The key stays the publishable one — escalating to the service
 * role here would make the token decorative.
 */
export function createTokenSupabaseClient(accessToken: string) {
  if (!env.supabaseUrl) {
    throw new Error('[createTokenSupabaseClient] Missing env var: NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!env.supabasePublishableKey) {
    throw new Error(
      '[createTokenSupabaseClient] Missing env var: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
  }

  return createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export async function createServerSupabaseClient(cookieStore?: CookieStore) {
  const store = cookieStore ?? (await cookies());

  return createServerClient<Database>(env.supabaseUrl ?? '', env.supabasePublishableKey ?? '', {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
  });
}
