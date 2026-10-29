'use client';

/**
 * The Bearer session the app runs on (issue #501).
 *
 * A bundled surface has no cookie for `royaraqamia.com` — its origin is
 * `https://localhost`, so a SameSite=Lax session cookie would not be sent on a
 * cross-site subrequest even if the app could read one. The app therefore holds
 * the credential the way a native client would:
 *
 *   * the **refresh token** lives in the platform's secure store (Android
 *     Keystore through the biometric plugin the shell already ships), never in
 *     `Preferences` when that store is available;
 *   * the **access token** lives in memory only, and is re-minted from the
 *     refresh token at boot, before expiry, and on a 401;
 *   * a refresh is **single-flight**: concurrent readers that find the token
 *     expired (or several 401s arriving together) share one grant, because two
 *     rotations of the same refresh token make one of them fail.
 *
 * Token minting goes through `CapacitorHttp` rather than `fetch` on purpose:
 * native HTTP has no CORS gate, so a bundled origin can call the API without
 * the server growing a CORS allowlist for `https://localhost`.
 *
 * No token is ever placed in a URL or a log line. The provider flow puts only
 * the PKCE challenge in the authorize URL; the tokens are exchanged out of
 * band and never returned to the browser.
 */

import { CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

import { NATIVE_OAUTH_CALLBACK_URL } from '@/shared/contracts/auth';

import { REMOTE_ORIGIN } from './crossing';

const REFRESH_TOKEN_KEY = 'royaraqamia.session.refresh-token';
const PKCE_KEY = 'royaraqamia.session.pkce';

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

/**
 * The platform secure store, reached through the bridge rather than imported:
 * the plugin is native and its JavaScript is already in the shell, so pulling
 * its package into this bundle would duplicate it for a call it does not make.
 */
interface SecureDataPlugin {
  setData(options: { key: string; value: string }): Promise<void>;
  getData(options: { key: string }): Promise<{ value?: string | null }>;
  deleteData(options: { key: string }): Promise<void>;
}

interface CapacitorBridge {
  Plugins?: Record<string, unknown>;
}

function secureStore(): SecureDataPlugin | undefined {
  const plugin = (globalThis as { Capacitor?: CapacitorBridge }).Capacitor?.Plugins
    ?.NativeBiometric;
  if (!plugin || typeof plugin !== 'object') return undefined;
  const candidate = plugin as Partial<SecureDataPlugin>;
  if (
    typeof candidate.setData !== 'function' ||
    typeof candidate.getData !== 'function' ||
    typeof candidate.deleteData !== 'function'
  ) {
    return undefined;
  }
  return candidate as SecureDataPlugin;
}

async function readSecret(key: string): Promise<string | null> {
  const secure = secureStore();
  if (secure) {
    try {
      const { value } = await secure.getData({ key });
      return value ?? null;
    } catch {
      // A missing entry rejects on some platforms; it is not a session.
      return null;
    }
  }
  const { value } = await Preferences.get({ key });
  return value;
}

async function writeSecret(key: string, value: string): Promise<void> {
  const secure = secureStore();
  if (secure) {
    await secure.setData({ key, value });
    return;
  }
  await Preferences.set({ key, value });
}

async function clearSecret(key: string): Promise<void> {
  const secure = secureStore();
  if (secure) {
    try {
      await secure.deleteData({ key });
    } catch {
      // Nothing to delete is the same outcome as deleting it.
    }
    return;
  }
  await Preferences.remove({ key });
}

let session: SpikeSession | null = null;
let refreshInFlight: Promise<SpikeSession | null> | null = null;
/**
 * Which sign-in the current session belongs to. A refresh that was already in
 * flight when the user signed in or out must not resurrect the session it was
 * minted for.
 */
let generation = 0;
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

async function remember(parsed: SpikeSession): Promise<void> {
  session = parsed;
  await writeSecret(REFRESH_TOKEN_KEY, parsed.refreshToken);
  emit();
}

/** Sign in with a password and remember only the refresh token. */
export async function signIn(email: string, password: string): Promise<SpikeSession> {
  const parsed = toSession(await grant({ email, password }, 'password'));
  if (!parsed) throw new Error('auth response carried no tokens');

  generation += 1;
  await remember(parsed);
  return parsed;
}

/** Mint an access token from the stored refresh token, if there is one. */
async function refreshFromStore(): Promise<SpikeSession | null> {
  const startedIn = generation;
  const value = await readSecret(REFRESH_TOKEN_KEY);
  if (!value) return null;

  try {
    const parsed = toSession(await grant({ refresh_token: value }, 'refresh_token'));
    if (!parsed) return null;
    // The user signed in or out while this grant was in flight; its result
    // belongs to the session that is already gone.
    if (startedIn !== generation) return null;

    // Supabase rotates the refresh token on every use; the rotated one is the
    // only copy that can refresh again, so it replaces the stored value.
    await remember(parsed);
    return parsed;
  } catch {
    if (startedIn !== generation) return null;
    // A revoked or already-rotated refresh token is not a session.
    await clearSecret(REFRESH_TOKEN_KEY);
    session = null;
    emit();
    return null;
  }
}

/**
 * Refresh once, shared by every caller already waiting for it. Two concurrent
 * rotations of the same refresh token cannot both succeed, so the in-flight
 * promise is the whole point rather than an optimisation.
 */
export function refreshSession(): Promise<SpikeSession | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshFromStore().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Re-mint the session from the refresh token at boot. */
export async function restoreSession(): Promise<SpikeSession | null> {
  if (session) return session;
  return refreshSession();
}

/**
 * Drop the session: revoke the refresh token when the network allows, clear the
 * stored credential and the in-memory pair. Nothing else is touched — the app's
 * rows belong to the device and signing out never deletes them (ADR-0070).
 */
export async function signOut(): Promise<void> {
  generation += 1;
  const accessToken = session?.accessToken ?? null;
  session = null;
  await clearSecret(REFRESH_TOKEN_KEY);
  await clearSecret(PKCE_KEY);
  emit();

  if (!accessToken) return;
  try {
    await CapacitorHttp.post({
      url: `${__SPIKE_SUPABASE_URL__}/auth/v1/logout`,
      headers: {
        apikey: __SPIKE_SUPABASE_ANON_KEY__,
        Authorization: `Bearer ${accessToken}`,
      },
      data: {},
    });
  } catch {
    // The local session is already gone; a failed revocation must not keep the
    // user signed in on this device.
  }
}

/** The access token, refreshed first when it is within a minute of expiry. */
export async function accessToken(): Promise<string | null> {
  if (!session) {
    const restored = await refreshSession();
    return restored?.accessToken ?? null;
  }
  if (session.expiresAt - 60 > Math.floor(Date.now() / 1000)) return session.accessToken;

  const refreshed = await refreshSession();
  return refreshed?.accessToken ?? null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  );
  return base64Url(new Uint8Array(digest));
}

interface PendingPkce {
  verifier: string;
  state: string;
}

/**
 * The provider path: Google and the others complete in a Custom Tab and return
 * on `royar://auth/callback`. The verifier never leaves the device — only its
 * S256 challenge goes into the authorize URL — and the returned code is
 * exchanged here, which is how a provider-only account gets a token the app
 * owns instead of a cookie it cannot carry.
 */
export async function beginProviderSignIn(
  provider: string,
  redirectTo: string = NATIVE_OAUTH_CALLBACK_URL
): Promise<string> {
  const verifier = randomVerifier();
  const state = randomVerifier();
  const challenge = await challengeFor(verifier);
  await writeSecret(PKCE_KEY, JSON.stringify({ verifier, state } satisfies PendingPkce));

  const params = new URLSearchParams({
    provider,
    redirect_to: redirectTo,
    code_challenge: challenge,
    code_challenge_method: 's256',
    state,
  });
  return `${__SPIKE_SUPABASE_URL__}/auth/v1/authorize?${params.toString()}`;
}

/** Finish the provider flow with the callback the Custom Tab returned. */
export async function completeProviderSignIn(callbackUrl: string): Promise<SpikeSession | null> {
  const url = new URL(callbackUrl);
  const error = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  const code = url.searchParams.get('code');

  const stored = await readSecret(PKCE_KEY);
  await clearSecret(PKCE_KEY);
  if (error) throw new Error(error);
  if (!code) return null;
  if (!stored) throw new Error('the provider return had no pending sign-in');

  const pending = JSON.parse(stored) as PendingPkce;
  const returnedState = url.searchParams.get('state');
  if (returnedState && pending.state !== returnedState) {
    throw new Error('the provider return did not match this sign-in');
  }

  const parsed = toSession(
    await grant({ auth_code: code, code_verifier: pending.verifier }, 'pkce')
  );
  if (!parsed) throw new Error('auth response carried no tokens');

  generation += 1;
  await remember(parsed);
  return parsed;
}

export interface AuthorizedResponse {
  status: number;
  data: unknown;
}

async function send(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  token: string,
  data?: unknown
) {
  return CapacitorHttp.request({
    url: `${REMOTE_ORIGIN}${path}`,
    method,
    headers: { Authorization: `Bearer ${token}` },
    ...(data === undefined ? {} : { data }),
  });
}

/**
 * An API call carrying the app's token, with exactly one re-authentication on a
 * 401. If several calls are rejected at once they share the same single-flight
 * refresh, so the server sees one rotation rather than a race.
 */
export async function authorizedRequest(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; data?: unknown } = {}
): Promise<AuthorizedResponse> {
  const method = init.method ?? 'GET';
  const token = await accessToken();
  if (!token) throw new Error('no session');

  const first = await send(path, method, token, init.data);
  if (first.status !== 401) return { status: first.status, data: first.data };

  const refreshed = await refreshSession();
  if (!refreshed) return { status: first.status, data: first.data };

  const retried = await send(path, method, refreshed.accessToken, init.data);
  return { status: retried.status, data: retried.data };
}
