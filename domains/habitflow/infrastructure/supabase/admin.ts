import { createClient, SupabaseClient } from '@supabase/supabase-js';

let adminInstance: SupabaseClient | null = null;

export function getAdminSupabase(): SupabaseClient {
  if (!adminInstance) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'Supabase admin configuration missing. Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
      );
    }

    adminInstance = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return adminInstance;
}
