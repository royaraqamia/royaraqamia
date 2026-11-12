import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/frontend/shared/constants';
import { isSessionCookieName } from '@/shared/session-cookie';

/**
 * How long the Realtime socket outlives the last channel on it (ADR-0169).
 *
 * The connection is the tab's, not a screen's. The library tears the socket
 * down as soon as its channel set empties, and its drain window is what a
 * screen-to-screen move races against: leaving the chats list for a thread
 * removes the last channel and, with the default window, starts a fresh
 * handshake for the thread. A tab keeps one socket for as long as a member
 * could plausibly come back to chat, and the bound only keeps the timer inside
 * what a browser can hold — it is not a promise to close it.
 */
export const REALTIME_TAB_IDLE_MS = 24 * 60 * 60 * 1000;

let clientPromise: Promise<SupabaseClient> | null = null;

export function createClient(): Promise<SupabaseClient> {
  if (clientPromise) return clientPromise;
  clientPromise = import('@supabase/ssr').then(({ createBrowserClient }) =>
    createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      isSingleton: false,
      realtime: { disconnectOnEmptyChannelsAfterMs: REALTIME_TAB_IDLE_MS },
    })
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
