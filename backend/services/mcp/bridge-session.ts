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

export function createMcpBridgeSessionMinter(
  deps: McpBridgeSessionDeps = {}
): McpBridgeSessionMinter {
  return {
    async mint(email) {
      if (!email) return null;

      const publicClient = deps.publicClient ?? createVerificationClient();
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

function createVerificationClient(): SupabaseClient<never> | null {
  const url = env.supabaseUrl;
  const publishableKey = env.supabasePublishableKey;
  if (!url || !publishableKey) return null;
  return createClient<never>(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
