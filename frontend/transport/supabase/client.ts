import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/frontend/shared/constants';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (client) return client;
  client = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { isSingleton: false });
  return client;
}
