import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAdminSupabase } from '@/backend/config/supabase';
import { env } from '@/backend/config/env';
import { logger } from '@/backend/shared/logger';

/**
 * Mints the Supabase session that backs an MCP OAuth grant.
 *
 * The grant needs a *real* Supabase session (not an impersonated service-role
 * client) so the data plane can build an RLS-enforced, user-scoped client —
 * ADR 0023. What it must not do is *borrow the browser's* session: Supabase
 * rotates refresh tokens and revokes the whole family on reuse, and the
 * browser keeps rotating its own copy (SessionProvider + `updateSession`), so
 * a token copied at consent time is stale by the time the data plane drains it.
 * The bridge then dies permanently and every authenticated call answers 401
 * while `/mcp/token` keeps handing out fresh MCP tokens.
 *
 * So we mint a second, independent session for the same user: an
 * admin-generated magic-link OTP, exchanged on a publishable-key client. It
 * belongs to nobody else, nothing else rotates it, and it is still a genuine
 * Supabase session — RLS applies, a ban or a deleted user kills it, and
 * `revokeAllUserTokens` plus the sweeper bound it (ADR 0023's revocation story
 * is untouched).
 *
 * This module also owns signing such a session *out*, which a live revoke asks
 * for: a bridged session nobody revokes outlives the grant that owned it.
 */

export interface McpBridgeSession {
  refreshToken: string;
}

export interface McpBridgeSessionMinter {
  /** Mint a bridge session for `email`, or null when it cannot be minted. */
  mint(email: string): Promise<McpBridgeSession | null>;
}

export interface McpBridgeSessionDeps {
  admin?: SupabaseClient<never>;
  /**
   * A publishable-key client. Must be dedicated: `verifyOtp` leaves a session on
   * the client, so a shared public client would start answering later "public"
   * reads as this user. Defaults to a fresh client per mint.
   */
  publicClient?: SupabaseClient<never> | null;
}

/**
 * Signs out a bridge session that a *live* revoke has stranded.
 *
 * Only a marked ciphertext may be handed to this (see
 * `readBridgeSession`): a pre-amendment row holds a copy of the user's browser
 * session, and signing that out would sign them out of the website. Retirement
 * paths never call it at all — GoTrue has already refused or invalidated the
 * session there (`refresh_token_not_found`, `session_expired`, `user_banned`) or
 * the ciphertext will not decrypt, so there is nothing left to revoke and no
 * network call to make (ADR 0023).
 *
 * The session is *not* signed out through the admin API: the grant owns a real,
 * user-scoped session, so it is revoked the way its owner would revoke it —
 * refresh it to obtain an access token, then log that one session out. Scope
 * `local` is load-bearing: `global` would revoke every session the user holds,
 * the browser's included.
 */
export interface McpBridgeSessionRevoker {
  /**
   * Best effort and non-fatal: the answer is for observability, and a session
   * that is already gone is as good as a signed-out one. Callers must treat both
   * as done and never let a failure here fail the revoke it belongs to.
   */
  revoke(refreshToken: string): Promise<boolean>;
}

export interface McpBridgeSessionRevokeDeps {
  /** A publishable-key client; must be dedicated (a refresh leaves a session on it). */
  publicClient?: SupabaseClient<never> | null;
}

export function createMcpBridgeSessionRevoker(
  deps: McpBridgeSessionRevokeDeps = {}
): McpBridgeSessionRevoker {
  return {
    async revoke(refreshToken) {
      if (!refreshToken) return false;

      const publicClient = deps.publicClient ?? createPublicClient();
      // A missing URL/key is a deploy misconfiguration, not a session to revoke.
      if (!publicClient) return false;

      try {
        const { data, error } = await publicClient.auth.refreshSession({
          refresh_token: refreshToken,
        });
        if (error || !data.session?.access_token) {
          // Already unusable (signed out, expired, superseded): nothing to do,
          // and nothing to report as a failure — the session is dead either way.
          logger.warn('[MCP:BRIDGE] bridge session was already gone before sign-out', {
            message: error?.message,
          });
          return false;
        }

        const { error: signOutError } = await publicClient.auth.signOut({ scope: 'local' });
        if (signOutError) {
          logger.warn('[MCP:BRIDGE] could not sign out a revoked grant bridge session', {
            message: signOutError.message,
          });
          return false;
        }
        return true;
      } catch (err) {
        logger.warn('[MCP:BRIDGE] failed to sign out a revoked grant bridge session', { err });
        return false;
      }
    },
  };
}

export function createMcpBridgeSessionMinter(
  deps: McpBridgeSessionDeps = {}
): McpBridgeSessionMinter {
  return {
    async mint(email) {
      if (!email) return null;

      const publicClient = deps.publicClient ?? createPublicClient();
      if (!publicClient) return null;

      try {
        const admin = deps.admin ?? getAdminSupabase();
        const { data: link, error: linkError } = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email,
        });
        const tokenHash = link?.properties?.hashed_token;
        if (linkError || !tokenHash) return null;

        const { data: verified, error: verifyError } = await publicClient.auth.verifyOtp({
          type: 'magiclink',
          token_hash: tokenHash,
        });
        const refreshToken = verified?.session?.refresh_token;
        if (verifyError || !refreshToken) return null;

        return { refreshToken };
      } catch (err) {
        logger.error('[MCP:BRIDGE] could not mint a bridge session', { err });
        return null;
      }
    },
  };
}

/**
 * A throwaway publishable-key client. Callers must not share one: `verifyOtp`
 * and `refreshSession` both leave their session on the client, so a shared
 * instance would start answering later "public" reads as whichever user last
 * touched it.
 */
function createPublicClient(): SupabaseClient<never> | null {
  const url = env.supabaseUrl;
  const publishableKey = env.supabasePublishableKey;
  if (!url || !publishableKey) return null;
  return createClient<never>(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
