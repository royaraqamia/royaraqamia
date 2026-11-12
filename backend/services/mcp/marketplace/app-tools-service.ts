import type { McpRemoteClient } from '@/backend/clients/mcp-remote';
import type {
  McpConnectionRecord,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import type { McpAccessTokenService } from '@/backend/services/mcp/marketplace/access-token-service';
import { McpRemoteError, type McpRequestAuth } from '@/backend/shared/domain/mcp-remote';
import { decryptSecret } from '@/backend/shared/mcp-token-crypto';
import { logger } from '@/backend/shared/logger';
import type { McpPermissionLevel } from '@/shared/contracts/mcp-marketplace';

/**
 * The tools of the apps we do not own, as the assistant may use them (#1225).
 *
 * This is the half that knows about members and permissions; the turn's half —
 * names, scoring, declarations — lives in `backend/services/chat/chat-app-tools`
 * and never touches a socket or a row. Everything a turn needs about a remote
 * tool arrives here as one flat record, so the chat layer needs no idea that
 * connections, credentials and permission levels exist.
 *
 * Three rules, each enforced where the call happens rather than where the
 * screen draws it:
 *
 * - **The member's own connection, or nothing.** Every read filters on
 *   `user_id`, and the tables are service-role only, so the database will not
 *   refuse on our behalf.
 * - **A switched-off tool is not callable.** The per-tool switch and the
 *   connection's own switch are checked here, not only in the declaration list:
 *   a model that names a tool we did not declare gets the same answer.
 * - **`reads` means reads.** The level is checked at the call as well as in the
 *   declarations, because a tool result is untrusted and a level is not
 *   something a stranger's answer may change.
 */

/** One remote tool, as the turn's planner needs it. */
export interface McpAppTool {
  connectionId: string;
  /** The name the member reads: the server's own, or their rename. */
  appName: string;
  toolName: string;
  description: string | null;
  /** The server's own JSON Schema, declared to the model as it was given. */
  inputSchema: Record<string, unknown> | null;
  /** `annotations.readOnlyHint`, and false when the server says nothing. */
  readOnly: boolean;
  permissionLevel: McpPermissionLevel;
}

export interface McpAppToolsService {
  /** Every usable tool of every usable connection the member holds. */
  catalog(userId: string): Promise<McpAppTool[]>;
  /**
   * One call, as the member, with a token that is refreshed when it is spent.
   * The answer is the server's own; nothing here interprets it.
   *
   * `intent` is who asked: a turn may only run what the connection's level
   * allows, while a confirmed card is the member's own decision and runs even a
   * write on an `ask` connection — the card *is* the asking.
   */
  call(input: {
    userId: string;
    connectionId: string;
    toolName: string;
    args: Record<string, unknown>;
    intent?: 'turn' | 'confirmed';
    signal?: AbortSignal;
  }): Promise<unknown>;
  /** Display names for connections a card was written against, by id. */
  names(userId: string, connectionIds: string[]): Promise<Map<string, string>>;
  /**
   * How many apps the member has connected, for the composer's meter (#1226).
   * A revoked connection is not one: it holds no slot and cannot be called.
   */
  connectedCount(userId: string): Promise<number>;
}

interface AppToolsDependencies {
  repository: McpMarketplaceRepository;
  remote: McpRemoteClient;
  tokens: McpAccessTokenService;
  now?: () => Date;
}

const NOT_CONNECTED = 'هذا التطبيق لم يعد متصلاً. أعد ربطه من «تطبيقاتنا».';
const TOOL_UNAVAILABLE = 'هذه الأداة غير متاحة في التطبيق الآن.';
const READ_ONLY_LEVEL = 'هذا التطبيق مضبوط على القراءة فقط، ولا يمكنه تنفيذ هذا الإجراء.';
/** A key connection whose stored key is gone: the repair is a new key (#1269). */
const KEY_MISSING = 'لم نعد نحتفظ بمفتاح هذا التطبيق. أدخل مفتاحاً جديداً من «تطبيقاتنا».';
/** The server refused the key it was given: it was revoked or rotated there. */
const KEY_REFUSED = 'رفض التطبيق المفتاح المحفوظ. أدخل مفتاحاً جديداً من «تطبيقاتنا».';
/** A no-auth connection that now asks for a credential: the server changed. */
const NO_AUTH_REFUSED =
  'هذا التطبيق صار يطلب بيانات اعتماد، ولم يكن يطلبها عند الربط. أعد ربطه من «تطبيقاتنا».';

/** The name a member reads for a connection. */
function appNameOf(connection: McpConnectionRecord): string {
  return connection.display_name?.trim() || connection.registry_name;
}

/**
 * Whether the level lets a tool run from a turn.
 *
 * `reads` is the member's own narrowing: the app may be read and nothing else.
 * `ask` runs what the server declares read-only and cards the rest, and `all`
 * is the explicit widening — a write the member already allowed per app.
 */
function levelAllows(level: McpPermissionLevel, readOnly: boolean): boolean {
  if (level === 'all') return true;
  return readOnly;
}

export function createMcpAppToolsService({
  repository,
  remote,
  tokens,
  now = () => new Date(),
}: AppToolsDependencies): McpAppToolsService {
  /** The connection, or the sentence that says why it is not callable. */
  async function usableConnection(userId: string, connectionId: string) {
    const connection = await repository.getConnection(userId, connectionId);
    if (!connection || !connection.enabled || connection.status === 'revoked') {
      throw new McpRemoteError('protocol', NOT_CONNECTED);
    }
    if (connection.status === 'needs_reauth') {
      throw new McpRemoteError('reauth', NOT_CONNECTED);
    }
    return connection;
  }

  /** Marks the connection as one the member has to connect again. */
  async function needsReauth(connectionId: string, message: string): Promise<void> {
    await repository.updateConnection(connectionId, {
      status: 'needs_reauth',
      last_error: message,
    });
  }

  /**
   * The credential one call carries, resolved from the connection's own mode
   * (#1269): a refreshed token, the member's key, or nothing at all.
   *
   * The key is decrypted for the length of the call and never logged; a key
   * connection with no stored ciphertext is a re-entry, not a retry.
   */
  async function requestAuth(
    connection: McpConnectionRecord,
    { forceRefreshed = false }: { forceRefreshed?: boolean } = {}
  ): Promise<McpRequestAuth> {
    if (connection.auth_mode === 'none') return { kind: 'none' };

    if (connection.auth_mode === 'api_key') {
      const credentials = await repository.getCredentials(connection.id);
      if (!credentials?.api_key_enc) throw new McpRemoteError('reauth', KEY_MISSING);
      const key = decryptSecret(credentials.api_key_enc);
      const prefix = credentials.api_key_prefix?.trim();
      return {
        kind: 'api_key',
        header: credentials.api_key_header?.trim() || 'Authorization',
        value: prefix ? `${prefix} ${key}` : key,
      };
    }

    return {
      kind: 'bearer',
      // Only a forced refresh passes the option, so a normal call keeps the
      // shape the token service was always called with.
      token: forceRefreshed
        ? await tokens.accessToken(connection, { force: true })
        : await tokens.accessToken(connection),
    };
  }

  return {
    async catalog(userId) {
      const rows = await repository.listUsableTools(userId);
      return rows.map(({ connection, tool }) => ({
        connectionId: connection.id,
        appName: appNameOf(connection),
        toolName: tool.tool_name,
        description: tool.description,
        inputSchema:
          typeof tool.input_schema === 'object' && tool.input_schema !== null
            ? (tool.input_schema as Record<string, unknown>)
            : null,
        readOnly: tool.read_only,
        permissionLevel: connection.permission_level,
      }));
    },

    async call({ userId, connectionId, toolName, args, intent = 'turn', signal }) {
      const connection = await usableConnection(userId, connectionId);

      const tools = await repository.listTools(connection.id);
      const tool = tools.find((candidate) => candidate.tool_name === toolName);
      if (!tool || !tool.enabled) {
        throw new McpRemoteError('protocol', TOOL_UNAVAILABLE);
      }
      if (intent === 'turn' && !levelAllows(connection.permission_level, tool.read_only)) {
        throw new McpRemoteError('protocol', READ_ONLY_LEVEL);
      }

      let auth: McpRequestAuth;
      try {
        auth = await requestAuth(connection);
      } catch (error) {
        // A connection whose credential is gone (a key that was never stored, a
        // token row that vanished) is the same state as a refused grant: the
        // member has to repair it, and the screen must say so (#1269).
        if (error instanceof McpRemoteError && error.failure === 'reauth') {
          await needsReauth(connection.id, error.message);
        }
        throw error;
      }
      let result: Awaited<ReturnType<McpRemoteClient['callTool']>>;
      try {
        result = await remote.callTool({
          serverUrl: connection.server_url,
          auth,
          name: tool.tool_name,
          args,
          ...(signal ? { signal } : {}),
        });
      } catch (error) {
        // A scope the grant never had is a fact about the consent, not about
        // the token: the row keeps its state and gains the sentence naming the
        // permission, so the screen can offer the wider consent the member has
        // to approve. Refreshing here would only spend a refresh to be refused
        // again, and marking it `needs_reauth` would say the grant is dead when
        // it is alive and merely narrow.
        if (error instanceof McpRemoteError && error.failure === 'scope') {
          await repository
            .updateConnection(connection.id, { last_error: error.message })
            .catch((writeError: unknown) => {
              logger.warn('MCP marketplace: scope refusal not recorded', {
                connectionId: connection.id,
                error: String(writeError),
              });
            });
          throw error;
        }

        // A token the server refused may simply be one we thought was valid:
        // spend a refresh and ask once more, and only then call it a revocation.
        if (!(error instanceof McpRemoteError) || error.failure !== 'unauthorized') throw error;

        /*
          Only an OAuth token is refreshable (#1269). A key and a no-auth
          connection have nothing to spend, so a refusal is the member's repair:
          a new key in the first case, a re-link in the second.
        */
        if (connection.auth_mode !== 'oauth') {
          const sentence = connection.auth_mode === 'api_key' ? KEY_REFUSED : NO_AUTH_REFUSED;
          await needsReauth(connection.id, sentence);
          throw new McpRemoteError('reauth', sentence, error);
        }

        try {
          auth = await requestAuth(connection, { forceRefreshed: true });
          result = await remote.callTool({
            serverUrl: connection.server_url,
            auth,
            name: tool.tool_name,
            args,
            ...(signal ? { signal } : {}),
          });
        } catch (retryError) {
          if (retryError instanceof McpRemoteError && retryError.failure === 'reauth') {
            throw retryError;
          }
          if (retryError instanceof McpRemoteError && retryError.failure === 'unauthorized') {
            await needsReauth(connection.id, NOT_CONNECTED);
            throw new McpRemoteError('reauth', NOT_CONNECTED, retryError);
          }
          throw retryError;
        }
      }

      // The card's "last used" is this stamp, and it moves on every completed
      // call — including one the server answered with `isError`, because the
      // app was reached either way.
      await repository
        .updateConnection(connection.id, { last_used_at: now().toISOString() })
        .catch((error: unknown) => {
          logger.warn('MCP marketplace: last-used stamp failed', {
            connectionId: connection.id,
            error: String(error),
          });
        });

      return result;
    },

    async names(userId, connectionIds) {
      const wanted = new Set(connectionIds);
      if (wanted.size === 0) return new Map();

      const connections = await repository.listConnections(userId);
      return new Map(
        connections
          .filter((connection) => wanted.has(connection.id))
          .map((connection) => [connection.id, appNameOf(connection)] as const)
      );
    },

    async connectedCount(userId) {
      // The same rule the owned-item pool counts by (ADR-0155): a revoked row
      // frees its slot, and nothing else is excluded.
      const connections = await repository.listConnections(userId);
      return connections.filter((connection) => connection.status !== 'revoked').length;
    },
  };
}
