'use client';

/**
 * The Bearer session the spike runs on (issue #500 scope: Bearer only, no
 * cookie changes).
 *
 * A bundled surface has no cookie for `royaraqamia.com` — its origin is
 * `https://localhost`, so a SameSite=Lax session cookie would not be sent on a
 * cross-site subrequest even if the app could read one. The spike therefore
 * holds the credential the way a native client would:
 *
 *   * the **refresh token** lives in `@capacitor/preferences` (native storage,
 *     survives WebView data clears and app restarts),
 *   * the **access token** lives in memory only, and is re-minted from the
 *     refresh token at boot and on a 401.
 *
 * Token minting goes through `CapacitorHttp` rather than `fetch` on purpose:
 * native HTTP has no CORS gate, so a bundled origin can call the API without
 * the server growing a CORS allowlist for `https://localhost`. Whether the
 * promoted shell keeps that transport or adds CORS is part of what the spike
 * records (`docs/mobile/two-origin-spike.md`).
 */

import { CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const REFRESH_TOKEN_KEY = 'spike.refresh-token';

/**
 * Build-time constants, injected by `vite.config.ts` from the same
 * `NEXT_PUBLIC_SUPABASE_*` values the site is built with. Both are public
 * (they ship in every browser bundle already).
 */
declare const __SPIKE_SUPABASE_URL__: string;
declare const __SPIKE_SUPABASE_ANON_KEY__: string;

export interface SpikeSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  /** Unix seconds, from Supabase's `expires_in`. */
  expiresAt: number;
}

interface SupabaseTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string; email?: string };
  error_description?: string;
  msg?: string;
}

let session: SpikeSession | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeToSpikeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function spikeSession(): SpikeSession | null {
  return session;
}

function toSession(data: SupabaseTokenResponse): SpikeSession | null {
  if (!data.access_token || !data.refresh_token) return null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userId: data.user?.id ?? '',
    email: data.user?.email ?? '',
    expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
  };
}

async function grant(body: Record<string, string>, grantType: string) {
  const response = await CapacitorHttp.post({
    url: `${__SPIKE_SUPABASE_URL__}/auth/v1/token?grant_type=${grantType}`,
    headers: {
      apikey: __SPIKE_SUPABASE_ANON_KEY__,
      'Content-Type': 'application/json',
    },
    data: body,
  });

  const data = (response.data ?? {}) as SupabaseTokenResponse;
  if (response.status >= 400) {
    throw new Error(data.error_description ?? data.msg ?? `auth failed (${response.status})`);
  }
  return data;
}

/** Sign in with a password and remember only the refresh token. */
export async function signIn(email: string, password: string): Promise<SpikeSession> {
  const parsed = toSession(await grant({ email, password }, 'password'));
  if (!parsed) throw new Error('auth response carried no tokens');

  session = parsed;
  await Preferences.set({ key: REFRESH_TOKEN_KEY, value: parsed.refreshToken });
  emit();
  return parsed;
}

/** Mint an access token from the stored refresh token, if there is one. */
export async function restoreSession(): Promise<SpikeSession | null> {
  const { value } = await Preferences.get({ key: REFRESH_TOKEN_KEY });
  if (!value) return null;

  try {
    const parsed = toSession(await grant({ refresh_token: value }, 'refresh_token'));
    if (!parsed) return null;

    session = parsed;
    await Preferences.set({ key: REFRESH_TOKEN_KEY, value: parsed.refreshToken });
    emit();
    return parsed;
  } catch {
    // A revoked or already-rotated refresh token is not a session.
    await Preferences.remove({ key: REFRESH_TOKEN_KEY });
    session = null;
    emit();
    return null;
  }
}

export async function signOut(): Promise<void> {
  session = null;
  await Preferences.remove({ key: REFRESH_TOKEN_KEY });
  emit();
}

/** The access token, refreshed first when it is within a minute of expiry. */
export async function accessToken(): Promise<string | null> {
  if (!session) return null;
  if (session.expiresAt - 60 > Math.floor(Date.now() / 1000)) return session.accessToken;

  const refreshed = await restoreSession();
  return refreshed?.accessToken ?? null;
}
