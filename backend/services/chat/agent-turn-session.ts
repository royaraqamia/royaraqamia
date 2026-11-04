import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/backend/config/env';
import { getAdminSupabase } from '@/backend/config/supabase';
import type { Database } from '@/backend/models/database.types';
import {
  createMcpBridgeSessionMinter,
  createMcpBridgeSessionRevoker,
} from '@/backend/services/mcp/bridge-session';
import { logger } from '@/backend/shared/logger';

/**
 * The session a resumed turn acts as.
 *
 * A worker has no cookies, and it must not borrow the member's: Supabase rotates
 * refresh tokens and revokes the family on reuse, so a copied token signs the
 * member out of the site the moment the worker refreshes (`docs/security.md`,
 * ADR-0023's amendment). The MCP server already solved this — mint an independent
 * session with an admin magic-link OTP and exchange it — so the turn reuses that,
 * and gives it back when the turn is done.
 *
 * Nothing is persisted: the session lives in this process for the length of one
 * turn. That is why `agent_turns` carries no session column.
 */
export interface AgentTurnSession {
  supabase: SupabaseClient<Database>;
  /** Signs the minted session out. Best effort: a failure is logged, not thrown. */
  release(): Promise<void>;
}

export interface AgentTurnSessionDeps {
  /** Answers the member's address, which is what a magic link is minted for. */
  emailOf(userId: string): Promise<string | null>;
  mint(email: string): Promise<{ refreshToken: string } | null>;
  revoke(refreshToken: string): Promise<boolean>;
}

export async function openAgentTurnSession(
  userId: string,
  deps: Partial<AgentTurnSessionDeps> = {}
): Promise<AgentTurnSession | null> {
  const url = env.supabaseUrl;
  const publishableKey = env.supabasePublishableKey;
  // A missing key is a deploy misconfiguration, not a turn to fail: leave the row
  // running so the next wake tries again.
  if (!url || !publishableKey) return null;

  const emailOf =
    deps.emailOf ??
    (async (id: string) => {
      const { data, error } = await getAdminSupabase().auth.admin.getUserById(id);
      if (error || !data.user?.email) return null;
      return data.user.email;
    });

  const mint = deps.mint ?? ((email: string) => createMcpBridgeSessionMinter().mint(email));
  const revoke = deps.revoke ?? ((token: string) => createMcpBridgeSessionRevoker().revoke(token));

  const email = await emailOf(userId).catch(() => null);
  if (!email) return null;

  const minted = await mint(email);
  if (!minted?.refreshToken) return null;

  const client = createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data, error } = await client.auth.refreshSession({
      refresh_token: minted.refreshToken,
    });
    if (error || !data.session?.access_token) {
      logger.warn('Assistant turn session could not be refreshed', { message: error?.message });
      await revoke(minted.refreshToken).catch(() => false);
      return null;
    }

    const live = data.session.refresh_token ?? minted.refreshToken;
    return {
      supabase: client,
      release: async () => {
        await revoke(live).catch(() => false);
      },
    };
  } catch (error) {
    logger.warn('Assistant turn session could not be opened', { error: String(error) });
    await revoke(minted.refreshToken).catch(() => false);
    return null;
  }
}
