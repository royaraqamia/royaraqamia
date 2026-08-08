import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/frontend/shared/constants';

let clientPromise: Promise<SupabaseClient> | null = null;

export function createClient(): Promise<SupabaseClient> {
  if (clientPromise) return clientPromise;
  clientPromise = import('@supabase/ssr').then(({ createBrowserClient }) =>
    createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { isSingleton: false })
  );
  return clientPromise;
}

// @supabase/ssr stores the session under `sb-<project-ref>-auth-token`, splitting
// oversized (base64url) values into `sb-<project-ref>-auth-token.0`, `.1`, etc.
const SESSION_COOKIE_NAME_RE = /^sb-[\w-]+-auth-token(?:\.\d+)?$/;

export function hasBrowserSessionToken(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .map((cookie) => cookie.trim().split('=')[0] ?? '')
    .some((name) => SESSION_COOKIE_NAME_RE.test(name));
}
