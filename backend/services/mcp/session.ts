import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  createMcpOAuthRepository,
  type McpOAuthRepository,
  type McpTokenRecord,
} from '@/backend/repositories/mcp/mcp-oauth-repository';
import { McpScope } from './scope';
import { getCachedContext, invalidateTokenCache, setCachedContext } from './token-cache';
import { env } from '@/backend/config/env';
import { isAdmin } from '@/backend/shared/admin-validator';
import { logger } from '@/backend/shared/logger';

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

type UserScopedClientResult =
  | { ok: true; client: SupabaseClient<any>; refreshToken: string }
  | { ok: false; reauthRequired: boolean };

/**
 * GoTrue's answer to a refresh token it will never honour again. Anything that
 * does not name one of these is transient (network, 429, 5xx) or a deploy
 * misconfiguration (a rotated publishable key answers `invalid_api_key`), and
 * must NOT cost the user their credentials — see `isBridgeSessionDead`.
 */
const DEAD_BRIDGE_SESSION_CODES: ReadonlySet<string> = new Set([
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
  'session_expired',
  'user_not_found',
  'user_banned',
]);

/**
 * Whether a failed session refresh means this grant's bridge session is gone for
 * good, so the grant must be revoked and the user asked to authorize again.
 *
 * Deliberately narrow. Revoking on a transient failure would sign a working user
 * out; missing a genuine death merely repeats today's 401 (the client's refresh
 * still answers 200, so nothing self-heals).
 */
export function isBridgeSessionDead(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, status, message } = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };
  if (typeof code === 'string' && DEAD_BRIDGE_SESSION_CODES.has(code)) return true;
  // Older GoTrue builds omit `code` and answer a bare 400 with a message.
  return status === 400 && typeof message === 'string' && /refresh token|session/i.test(message);
}

/**
 * The bridge session is gone and no MCP token can revive it. Revoke this grant's
 * access *and* refresh rows so the client's next `/mcp/token` refresh is answered
 * `invalid_grant`, which makes the client drop its credential and re-run the
 * browser authorization. Without this, refresh keeps succeeding and the client
 * loops on 401 forever (the failure mode `docs/security.md` step 3 assumes away).
 */
export async function abandonDeadBridgeSession(
  repo: McpOAuthRepository,
  accessRow: McpTokenRecord
): Promise<void> {
  try {
    await repo.revokeToken(accessRow.id);
    invalidateTokenCache(accessRow.token_hash);
    if (!accessRow.refresh_token_hash) return;
    const refreshRow = await repo.getTokenByHash(accessRow.refresh_token_hash);
    if (!refreshRow) return;
    await repo.revokeToken(refreshRow.id);
    invalidateTokenCache(refreshRow.token_hash);
  } catch (err) {
    logger.warn('[MCP:SESSION] failed to revoke a dead bridge session', { err });
  }
}

/**
 * Build a user-scoped Supabase client using a live access token from the
 * stored refresh token. The client enforces RLS and satisfies the
 * security-definer RPC self-checks (auth.uid() matches the caller).
 *
 * Returns the client and the *rotated* refresh token (Supabase rotates
 * refresh tokens on every refresh) so the caller can persist it back.
 */
async function buildUserScopedClient(
  _userId: string,
  storedRefreshToken: string
): Promise<UserScopedClientResult> {
  const supabaseUrl = env.supabaseUrl;
  const publishableKey = env.supabasePublishableKey;
  // A missing URL/key is a deploy misconfiguration, not a dead user session:
  // never let it revoke credentials.
  if (!supabaseUrl || !publishableKey) return { ok: false, reauthRequired: false };

  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // setSession({ access_token: '', refresh_token }) throws
    // AuthSessionMissingError in @supabase/auth-js (empty access_token is
    // rejected), so refreshSession is the correct call here.
    const { data, error } = await client.auth.refreshSession({
      refresh_token: storedRefreshToken,
    });
    if (error || !data.session?.access_token) {
      logger.error('[MCP:SESSION] refreshSession failed:', { message: error?.message });
      return { ok: false, reauthRequired: isBridgeSessionDead(error) };
    }
    return {
      ok: true,
      client,
      refreshToken: data.session.refresh_token ?? storedRefreshToken,
    };
  } catch (err) {
    logger.error('[MCP:SESSION] refreshSession exception:', { err });
    return { ok: false, reauthRequired: false };
  }
}

/**
 * Resolve an MCP access token to a McpUserContext.
 * Caches the context per token until the access token expires.
 * Returns null for invalid/revoked/expired tokens, and for tokens whose bridge
 * session is dead — in which case the grant is revoked first so the client
 * re-authorizes instead of looping on 401.
 */
export async function resolveMcpContext(
  bearerToken: string | null | undefined
): Promise<McpUserContext | null> {
  if (!bearerToken) return anonymousContext();

  const tokenHash = (await import('@/backend/repositories/mcp/mcp-token-crypto')).hashToken(
    bearerToken
  );
  const cached = getCachedContext(tokenHash);
  if (cached) {
    return cached;
  }

  const repo = createMcpOAuthRepository();
  const tokenRow = await repo.getTokenByHash(tokenHash);

  if (!tokenRow || tokenRow.kind !== 'access') return null;
  if (tokenRow.revoked_at) return null;
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) return null;

  // Update last_used_at
  await repo.touchTokenLastUsed(tokenRow.id);

  const sessionEnc = tokenRow.session_enc;
  if (!sessionEnc) {
    await abandonDeadBridgeSession(repo, tokenRow);
    return null;
  }

  let storedRefreshToken: string;
  try {
    storedRefreshToken = (
      await import('@/backend/repositories/mcp/mcp-token-crypto')
    ).decryptSecret(sessionEnc);
  } catch {
    // Undecryptable means the encryption key was rotated (or the row is
    // corrupt): the bridge can never be revived, so retire the grant and let the
    // client re-run the browser flow — the intended kill switch, not a 401 loop.
    await abandonDeadBridgeSession(repo, tokenRow);
    return null;
  }

  const userScoped = await buildUserScopedClient(tokenRow.user_id, storedRefreshToken);
  if (!userScoped.ok) {
    if (userScoped.reauthRequired) await abandonDeadBridgeSession(repo, tokenRow);
    return null;
  }

  // Supabase rotates the refresh token on every refresh. Persist the rotated
  // token back so subsequent MCP requests (after the token cache expires) can
  // still build a user-scoped client. If the persist fails we degrade the
  // current request only.
  try {
    const rotated = userScoped.refreshToken;
    if (rotated && rotated !== storedRefreshToken) {
      const newEnc = (await import('@/backend/repositories/mcp/mcp-token-crypto')).encryptSecret(
        rotated
      );
      await repo.updateTokenSessionEnc(tokenRow.id, newEnc);
    }
  } catch (err) {
    logger.warn('[MCP:SESSION] failed to persist rotated refresh token', { err });
  }

  // Get the user's email for admin check
  const { data: userData } = await userScoped.client.auth.getUser();
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
    supabase: userScoped.client,
  };

  // Cache for 5 minutes or until token expiry, whichever is sooner
  const ttl = Math.min(5 * 60 * 1000, new Date(tokenRow.expires_at).getTime() - Date.now());
  setCachedContext(tokenHash, ctx, ttl);

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

export { invalidateTokenCache, clearAllTokenCache, invalidateUserCache } from './token-cache';
