import type { McpConnectedApp } from '@/shared/contracts/mcp-connected-apps';
import { createMcpOAuthProvider, type McpOAuthProvider } from './oauth-provider';

/**
 * The account area's view of a user's MCP grants.
 *
 * The OAuth provider owns tokens; this owns what the account surface *shows* and
 * what "disconnect" means for one client, so the controller stays a transport
 * adapter and no UI ever sees a token row.
 *
 * A grant is live until every token it holds is revoked or swept. Disconnecting
 * one client must not touch the user's other clients, their browser session, or
 * their Supabase session: revocation shreds the stored bridge ciphertext
 * (ADR 0023), which is what makes the disconnected client unable to act, while
 * signing out of the site remains a separate, bigger hammer.
 */

export interface McpConnectedAppsDeps {
  provider?: McpOAuthProvider;
}

export interface McpConnectedAppService {
  /** The user's live grants, most recently used first. */
  list(userId: string): Promise<McpConnectedApp[]>;
  /** Disconnect one client. Unknown or already-disconnected clients no-op. */
  disconnect(userId: string, clientId: string): Promise<void>;
  /** Disconnect every MCP client the user has connected. */
  disconnectAll(userId: string): Promise<void>;
}

export function createMcpConnectedAppService(
  deps: McpConnectedAppsDeps = {}
): McpConnectedAppService {
  const provider = deps.provider ?? createMcpOAuthProvider();

  return {
    async list(userId) {
      const grants = await provider.listUserGrants(userId);
      return grants
        .map((grant) => ({
          clientId: grant.client_id,
          clientName: grant.client_name,
          connectedAt: grant.connected_at,
          lastUsedAt: grant.last_used_at,
        }))
        .sort(byMostRecentlyUsed);
    },

    async disconnect(userId, clientId) {
      await provider.revokeUserClient(userId, clientId);
    },

    async disconnectAll(userId) {
      await provider.revokeAllUserTokens(userId);
    },
  };
}

/**
 * Newest activity first, falling back to when the grant connected: a client the
 * user just authorized belongs at the top even before it has made a call, and a
 * grant that has never been used must not sort as if it were infinitely old.
 */
function byMostRecentlyUsed(a: McpConnectedApp, b: McpConnectedApp): number {
  return activityAt(b) - activityAt(a);
}

function activityAt(connectedApp: McpConnectedApp): number {
  const at = connectedApp.lastUsedAt ?? connectedApp.connectedAt;
  const parsed = Date.parse(at);
  return Number.isNaN(parsed) ? 0 : parsed;
}
