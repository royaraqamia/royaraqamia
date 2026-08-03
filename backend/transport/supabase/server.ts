import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/backend/models/database.types';
import { env } from '@/backend/config/env';

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export async function createClient(cookieStore?: CookieStore) {
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
