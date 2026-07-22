import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

let adminClient: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Returns a Supabase client with the service role key.
 * Use ONLY for privileged server-side operations (writes, admin queries).
 * For public read-only queries (e.g. certificate verification), use the publishable key instead.
 */
export function getAdminSupabase() {
  if (!adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
