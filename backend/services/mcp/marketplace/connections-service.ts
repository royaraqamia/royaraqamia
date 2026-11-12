import type {
  McpConnectionRecord,
  McpConnectionToolRecord,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import type { McpRemoteClient } from '@/backend/clients/mcp-remote';
import type { AuthorizationServerMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { decryptSecret } from '@/backend/shared/mcp-token-crypto';
import { logger } from '@/backend/shared/logger';
import type {
  McpConnection,
  McpConnectionDetail,
  McpConnectionTool,
  McpConnectionUpdate,
} from '@/shared/contracts/mcp-marketplace';

/**
 * The outbound list, the post-connect screen, and the two ways a member limits
 * or ends a connection (ADR-0155, phase 3 / #1224).
 *
 * Three rules this file keeps:
 *
 * - **The row is the member's.** Every read and write takes `userId` and filters
 *   on it; an id that is not theirs is `null`, never another member's row.
 * - **Disconnecting always succeeds locally.** Provider revocation is
 *   best-effort: a server that never implemented RFC 7009, or one that is down,
 *   must not keep a member's app connected against their decision.
 * - **A stale tool is not a deleted one.** `tools/list` no longer advertising a
 *   tool ages it out rather than removing it, so the member's switch survives a
 *   server's bad day, and the screen can say the list changed since connect.
 */

export type McpToolUpdateResult = 'ok' | 'missing' | 'unknown_tool';

export interface McpConnectionService {
  list(userId: string): Promise<McpConnection[]>;
  detail(userId: string, connectionId: string): Promise<McpConnectionDetail | null>;
  /** Answers `false` when the id is not the member's; nothing is written then. */
  update(userId: string, connectionId: string, patch: McpConnectionUpdate): Promise<boolean>;
  /** Answers `false` when the id is not the member's; a failed provider revoke still deletes. */
  disconnect(userId: string, connectionId: string): Promise<boolean>;
  setTool(
    userId: string,
    connectionId: string,
    toolName: string,
    enabled: boolean
  ): Promise<McpToolUpdateResult>;
}

interface ConnectionServiceDependencies {
  repository: McpMarketplaceRepository;
  remote: McpRemoteClient;
}

/** The stored row as a list draws it. */
function toConnection(row: McpConnectionRecord): McpConnection {
  return {
    id: row.id,
    registryName: row.registry_name,
    displayName: row.display_name,
    enabled: row.enabled,
    permissionLevel: row.permission_level,
    status: row.status,
    authMode: row.auth_mode,
    toolCount: row.tool_count,
    connectedAt: row.connected_at,
    lastUsedAt: row.last_used_at,
    lastError: row.last_error,
  };
}

/**
 * A tool the last `tools/list` did not see is stale, not gone.
 *
 * The stamp is the newest `last_seen_at` among the connection's own tools, not
 * `last_synced_at`: the connection row is written a moment *after* the tool rows
 * (the flow saves tools, then the count and the stamp), so comparing against it
 * would mark every tool of a fresh list stale. The newest tool row and the sync
 * are the same write, which is the comparison that holds.
 *
 * `listEmpty` closes the one hole: a server that advertised nothing on its last
 * read leaves every older row untouched, so all of them are stale.
 */
function toTool(
  row: McpConnectionToolRecord,
  syncedAt: string,
  listEmpty: boolean
): McpConnectionTool {
  return {
    name: row.tool_name,
    description: row.description,
    readOnly: row.read_only,
    enabled: row.enabled,
    stale: listEmpty || row.last_seen_at < syncedAt,
  };
}

/** A stored metadata document, or `null` when the row predates keeping one. */
function authorizationMetadata(value: unknown): AuthorizationServerMetadata | null {
  if (value === null || typeof value !== 'object') return null;
  return value as AuthorizationServerMetadata;
}

export function createMcpConnectionService({
  repository,
  remote,
}: ConnectionServiceDependencies): McpConnectionService {
  /** Best-effort revocation: one provider, two tokens, and no exception escapes. */
  async function revokeAtProvider(connection: McpConnectionRecord) {
    try {
      const credentials = await repository.getCredentials(connection.id);
      // A key or a no-auth connection holds no OAuth token to revoke at a
      // provider: the local delete is the whole disconnect (#1269).
      if (!credentials || !credentials.access_token_enc || !credentials.client_id) return;

      const metadata = authorizationMetadata(credentials.metadata);
      if (!metadata) return;

      const client = {
        clientId: credentials.client_id,
        clientSecret: credentials.client_secret_enc
          ? decryptSecret(credentials.client_secret_enc)
          : null,
      };
      const tokens: Array<{ token: string; hint: 'access_token' | 'refresh_token' }> = [
        { token: decryptSecret(credentials.access_token_enc), hint: 'access_token' },
      ];
      if (credentials.refresh_token_enc) {
        tokens.push({ token: decryptSecret(credentials.refresh_token_enc), hint: 'refresh_token' });
      }

      for (const { token, hint } of tokens) {
        try {
          await remote.revoke({ metadata, client, token, tokenTypeHint: hint });
        } catch (error) {
          logger.warn('MCP marketplace: provider revocation failed', {
            connectionId: connection.id,
            hint,
            error: String(error),
          });
        }
      }
    } catch (error) {
      // A credential that cannot be read is still not a reason to keep the
      // connection: the member asked for it to go.
      logger.warn('MCP marketplace: credentials unreadable at disconnect', {
        connectionId: connection.id,
        error: String(error),
      });
    }
  }

  return {
    async list(userId) {
      const rows = await repository.listConnections(userId);
      return rows.map(toConnection);
    },

    async detail(userId, connectionId) {
      const connection = await repository.getConnection(userId, connectionId);
      if (!connection) return null;

      const [tools, credentials] = await Promise.all([
        repository.listTools(connection.id),
        repository.getCredentials(connection.id),
      ]);
      const syncedAt = tools.reduce(
        (latest, tool) => (tool.last_seen_at > latest ? tool.last_seen_at : latest),
        ''
      );
      return {
        ...toConnection(connection),
        // The provider's own words, split on the separator RFC 6749 uses. Read
        // from the credential row rather than the connection: the grant belongs
        // to the token that was issued, and a reconnect replaces both.
        scopes: (credentials?.scope ?? '').split(/\s+/).filter(Boolean),
        tools: tools.map((tool) => toTool(tool, syncedAt, connection.tool_count === 0)),
      };
    },

    async update(userId, connectionId, patch) {
      const connection = await repository.getConnection(userId, connectionId);
      if (!connection) return false;

      const write: Parameters<McpMarketplaceRepository['updateConnection']>[1] = {};
      if (patch.enabled !== undefined) write.enabled = patch.enabled;
      if (patch.permissionLevel !== undefined) write.permission_level = patch.permissionLevel;
      if (patch.displayName !== undefined) {
        write.display_name = patch.displayName?.trim() || null;
      }

      await repository.updateConnection(connection.id, write);
      return true;
    },

    async disconnect(userId, connectionId) {
      const connection = await repository.getConnection(userId, connectionId);
      if (!connection) return false;

      await revokeAtProvider(connection);
      // The member's decision is the local one: the row goes even when the
      // provider did not answer, and the cap frees with it.
      return repository.deleteConnection(userId, connection.id);
    },

    async setTool(userId, connectionId, toolName, enabled) {
      const connection = await repository.getConnection(userId, connectionId);
      if (!connection) return 'missing';

      const changed = await repository.setToolEnabled(connection.id, toolName, enabled);
      return changed ? 'ok' : 'unknown_tool';
    },
  };
}
