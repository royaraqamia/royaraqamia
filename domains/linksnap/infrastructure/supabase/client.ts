import { createClient, SupabaseClient } from '@supabase/supabase-js';

let publicSupabaseInstance: SupabaseClient | null = null;
let adminSupabaseInstance: SupabaseClient | null = null;

/**
 * Gets a Supabase Client configured with public anonymous keys.
 * Fails gracefully on first use if credentials are missing.
 */
export function getPublicSupabase(): SupabaseClient {
  if (!publicSupabaseInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!url || !key) {
      throw new Error(
        'Supabase configuration missing. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variables are set.'
      );
    }

    publicSupabaseInstance = createClient(url, key, {
      auth: {
        persistSession: false,
      },
    });
  }
  return publicSupabaseInstance;
}

/**
 * Gets a Supabase Client configured with the admin service role key to bypass RLS safely on the server side.
 * Fails gracefully on first use if credentials are missing.
 */
export function getAdminSupabase(): SupabaseClient {
  if (!adminSupabaseInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'Supabase admin configuration missing. Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
      );
    }

    adminSupabaseInstance = createClient(url, key, {
      auth: {
        persistSession: false,
      },
    });
  }
  return adminSupabaseInstance;
}
