import type { McpUserContext } from './session';

/**
 * Process-local cache of resolved MCP contexts, keyed by access-token hash.
 *
 * `resolveMcpContext` populates it so a burst of requests bearing the same
 * bearer token does not rebuild the user-scoped Supabase client per request.
 * The cache is deliberately tiny and short-lived, but it must never outlive a
 * revocation: the OAuth revoke/rotate paths call the invalidators below so a
 * revoked or rotated access token is rejected on the very next request instead
 * of up to 5 minutes later.
 */

const TOKEN_CACHE = new Map<string, { ctx: McpUserContext; expiresAt: number }>();

/** Return the cached context for a token hash, or null when absent or expired. */
export function getCachedContext(tokenHash: string): McpUserContext | null {
  const cached = TOKEN_CACHE.get(tokenHash);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    TOKEN_CACHE.delete(tokenHash);
    return null;
  }
  return cached.ctx;
}

/** Cache a resolved context until `ttlMs` elapses (floored at 1s). */
export function setCachedContext(tokenHash: string, ctx: McpUserContext, ttlMs: number): void {
  TOKEN_CACHE.set(tokenHash, { ctx, expiresAt: Date.now() + Math.max(ttlMs, 1000) });
}

/** Drop the cached context for one access token (called on revoke/rotate). */
export function invalidateTokenCache(tokenHash: string): void {
  TOKEN_CACHE.delete(tokenHash);
}

/** Drop every cached context belonging to a user (on "revoke all sessions"). */
export function invalidateUserCache(userId: string): void {
  for (const [hash, entry] of TOKEN_CACHE) {
    if (entry.ctx.userId === userId) TOKEN_CACHE.delete(hash);
  }
}

/** Drop the entire cache (tests, and process-wide resets). */
export function clearAllTokenCache(): void {
  TOKEN_CACHE.clear();
}
