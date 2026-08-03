import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { env } from '@/backend/config/env';

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
