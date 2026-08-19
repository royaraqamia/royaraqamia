import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createMcpOAuthRepository } from '@/backend/repositories/mcp/mcp-oauth-repository';
import { McpScope } from './scope';
import { env } from '@/backend/config/env';
import { isAdmin } from '@/backend/shared/admin-validator';

/**
 * Context attached to an authenticated MCP request (or null for anonymous).
 * Contains the user's identity, scopes, admin flag, and a user-scoped
 * Supabase client that enforces RLS and passes the security-definer RPC checks.
 */

export interface McpUserContext {
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
  scopes: McpScope[];
  clientId: string | null;
  tokenExpiresAt: number | null;
  supabase: SupabaseClient<any>;
}

const TOKEN_CACHE = new Map<string, { ctx: McpUserContext; expiresAt: number }>();

/**
 * Build a user-scoped Supabase client using a live access token from the
 * stored refresh token. The client enforces RLS and satisfies the
 * security-definer RPC self-checks (auth.uid() matches the caller).
 */
async function buildUserScopedClient(
  _userId: string,
  storedRefreshToken: string
): Promise<SupabaseClient<any> | null> {
  const supabaseUrl = env.supabaseUrl;
  const publishableKey = env.supabasePublishableKey;
  if (!supabaseUrl || !publishableKey) return null;

  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data, error } = await client.auth.setSession({
      access_token: '',
      refresh_token: storedRefreshToken,
    });
    if (error || !data.session?.access_token) {
      console.error('[MCP:SESSION] setSession failed:', error?.message);
      return null;
    }
    return client;
  } catch (err) {
    console.error('[MCP:SESSION] setSession exception:', err);
    return null;
  }
}

/**
 * Resolve an MCP access token to a McpUserContext.
 * Caches the context per token until the access token expires.
 * Returns null for invalid/revoked/expired tokens.
 */
export async function resolveMcpContext(
  bearerToken: string | null | undefined
): Promise<McpUserContext | null> {
  if (!bearerToken) return anonymousContext();

  const tokenHash = (await import('@/backend/repositories/mcp/mcp-token-crypto')).hashToken(
    bearerToken
  );
  const cached = TOKEN_CACHE.get(tokenHash);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ctx;
  }

  const repo = createMcpOAuthRepository();
  const tokenRow = await repo.getTokenByHash(tokenHash);

  if (!tokenRow || tokenRow.kind !== 'access') return null;
  if (tokenRow.revoked_at) return null;
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) return null;

  // Update last_used_at
  await repo.touchTokenLastUsed(tokenRow.id);

  const sessionEnc = tokenRow.session_enc;
  if (!sessionEnc) return null;

  let storedRefreshToken: string;
  try {
    storedRefreshToken = (
      await import('@/backend/repositories/mcp/mcp-token-crypto')
    ).decryptSecret(sessionEnc);
  } catch {
    return null;
  }

  const userScoped = await buildUserScopedClient(tokenRow.user_id, storedRefreshToken);
  if (!userScoped) return null;

  // Get the user's email for admin check
  const { data: userData } = await userScoped.auth.getUser();
  const email = userData.user?.email ?? null;
  const isAdminUser = email ? isAdmin(email, env.adminEmails) : false;

  // Build the scope set from the token + admin gate
  const tokenScopes = (tokenRow.scope as McpScope[]) ?? [];
  const isAdminScopeGranted = tokenScopes.includes('admin');
  const finalScopes =
    isAdminScopeGranted && isAdminUser
      ? [...tokenScopes]
      : tokenScopes.filter((s) => s !== 'admin');

  const ctx: McpUserContext = {
    userId: tokenRow.user_id,
    email,
    isAdmin: isAdminUser,
    scopes: finalScopes,
    clientId: tokenRow.client_id,
    tokenExpiresAt: new Date(tokenRow.expires_at).getTime(),
    supabase: userScoped,
  };

  // Cache for 5 minutes or until token expiry, whichever is sooner
  const ttl = Math.min(5 * 60 * 1000, new Date(tokenRow.expires_at).getTime() - Date.now());
  TOKEN_CACHE.set(tokenHash, { ctx, expiresAt: Date.now() + Math.max(ttl, 1000) });

  return ctx;
}

function anonymousContext(): McpUserContext {
  const url = env.supabaseUrl;
  const key = env.supabasePublishableKey;
  const supabase =
    url && key
      ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
      : ({} as SupabaseClient<any>);
  return {
    userId: null,
    email: null,
    isAdmin: false,
    scopes: [],
    clientId: null,
    tokenExpiresAt: null,
    supabase,
  };
}

export function invalidateTokenCache(tokenHash: string): void {
  TOKEN_CACHE.delete(tokenHash);
}

export function clearAllTokenCache(): void {
  TOKEN_CACHE.clear();
}

/**
 * Invalidate all cached contexts for a user (on "revoke all sessions").
 */
export function invalidateUserCache(_userId: string): void {
  // We don't have a direct mapping from userId -> tokenHash in cache.
  // Invalidate entire cache; it's small and short-lived anyway.
  TOKEN_CACHE.clear();
}
