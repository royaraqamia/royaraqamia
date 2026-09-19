import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/frontend/shared/constants';
import { isSessionCookieName } from '@/backend/shared/session-cookie';

let clientPromise: Promise<SupabaseClient> | null = null;

export function createClient(): Promise<SupabaseClient> {
  if (clientPromise) return clientPromise;
  clientPromise = import('@supabase/ssr').then(({ createBrowserClient }) =>
    createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { isSingleton: false })
  );
  return clientPromise;
}

export function hasBrowserSessionToken(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .map((cookie) => cookie.trim().split('=')[0] ?? '')
    .some((name) => isSessionCookieName(name));
}
