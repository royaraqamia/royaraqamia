import { getAdminSupabase } from '@/backend/config/supabase';
import type { Json } from '@/backend/models/database.types';

/**
 * Persistence for the outbound MCP marketplace (ADR-0155).
 *
 * Every table behind this file is service-role only, so the admin client is the
 * only client that may read one — `20261114110000_mcp_marketplace_foundation.sql`
 * revokes anon and authenticated and grants the service role. A member's row is
 * addressed by `user_id` in the query rather than by a policy, which is why every
 * read here takes the user id and filters on it: the database is not going to
 * refuse on our behalf.
 *
 * Ciphertexts cross this boundary as they are stored. Encryption and decryption
 * live in `backend/shared/mcp-token-crypto.ts` and are the service's job, so this
 * file never holds a plaintext token and never imports a key.
 */

const CATALOG_TABLE = 'mcp_catalog_servers';
const CONNECTIONS_TABLE = 'mcp_connections';
const CREDENTIALS_TABLE = 'mcp_connection_credentials';
const TOOLS_TABLE = 'mcp_connection_tools';
const ATTEMPTS_TABLE = 'mcp_connect_attempts';
const REGISTRATIONS_TABLE = 'mcp_oauth_client_registrations';

export interface McpCatalogServerRecord {
  registry_name: string;
  title: string | null;
  description: string | null;
  name_ar: string | null;
  description_ar: string | null;
  remote_url: string;
  status: string;
  blocked_at: string | null;
  blocked_reason: string | null;
}

export type McpConnectionStatus = 'active' | 'needs_reauth' | 'error' | 'revoked';
export type McpPermissionLevel = 'ask' | 'reads' | 'all';

export interface McpConnectionRecord {
  id: string;
  user_id: string;
  registry_name: string;
  server_url: string;
  display_name: string | null;
  enabled: boolean;
  permission_level: McpPermissionLevel;
  status: McpConnectionStatus;
  tool_count: number;
  connected_at: string;
  last_used_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
}

export interface McpConnectionCredentialsRecord {
  connection_id: string;
  authorization_server: string;
  token_endpoint: string;
  registration_kind: 'dcr' | 'static';
  client_id: string;
  client_secret_enc: string | null;
  access_token_enc: string;
  refresh_token_enc: string | null;
  scope: string | null;
  expires_at: string | null;
  issued_at: string;
  metadata: Json | null;
}

export interface McpConnectionToolRecord {
  connection_id: string;
  tool_name: string;
  description: string | null;
  input_schema: Json | null;
  read_only: boolean;
  enabled: boolean;
  last_seen_at: string;
}

/** What a `tools/list` answer becomes, before the repository touches it. */
export interface McpToolInput {
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
}

export interface McpConnectAttemptRecord {
  state_hash: string;
  user_id: string;
  registry_name: string;
  server_url: string;
  code_verifier_enc: string;
  redirect_uri: string;
  created_at: string;
  expires_at: string;
}

export interface McpClientRegistrationRecord {
  authorization_server: string;
  redirect_uri: string;
  client_id: string;
  client_secret_enc: string | null;
  registration_kind: 'dcr' | 'static';
}

export interface McpMarketplaceRepository {
  getCatalogServer(registryName: string): Promise<McpCatalogServerRecord | null>;

  /** The live connection for a member and a catalogue row, if there is one. */
  findLiveConnection(userId: string, registryName: string): Promise<McpConnectionRecord | null>;
  getConnection(userId: string, connectionId: string): Promise<McpConnectionRecord | null>;
  createConnection(input: {
    userId: string;
    registryName: string;
    serverUrl: string;
    displayName: string | null;
  }): Promise<McpConnectionRecord>;
  updateConnection(
    connectionId: string,
    patch: Partial<{
      display_name: string | null;
      enabled: boolean;
      permission_level: McpPermissionLevel;
      status: McpConnectionStatus;
      tool_count: number;
      last_used_at: string;
      last_synced_at: string;
      last_error: string | null;
    }>
  ): Promise<void>;

  /** One row per connection: a re-authorisation replaces it, never adds one. */
  saveCredentials(input: {
    connectionId: string;
    authorizationServer: string;
    tokenEndpoint: string;
    registrationKind: 'dcr' | 'static';
    clientId: string;
    clientSecretEnc: string | null;
    accessTokenEnc: string;
    refreshTokenEnc: string | null;
    scope: string | null;
    expiresAt: string | null;
    metadata: Json | null;
  }): Promise<void>;
  getCredentials(connectionId: string): Promise<McpConnectionCredentialsRecord | null>;

  /**
   * Upserts what `tools/list` answered. Tools the server no longer advertises are
   * left in place — `last_seen_at` stops moving — because deleting them would
   * delete the member's own switches on a server's bad day.
   */
  saveTools(connectionId: string, tools: McpToolInput[]): Promise<void>;
  listTools(connectionId: string): Promise<McpConnectionToolRecord[]>;

  /** Starts a handshake. The state is stored hashed; the verifier encrypted. */
  saveAttempt(input: {
    stateHash: string;
    userId: string;
    registryName: string;
    serverUrl: string;
    codeVerifierEnc: string;
    redirectUri: string;
    expiresAt: string;
  }): Promise<void>;
  /**
   * Claims an attempt atomically: the row is deleted and returned in one
   * statement, so two callbacks carrying the same state cannot both exchange a
   * code. An expired row is not claimable, and it is gone either way — the
   * sweep's work is done here for the rows anyone actually touches.
   */
  claimAttempt(stateHash: string, now: string): Promise<McpConnectAttemptRecord | null>;

  getRegistration(
    authorizationServer: string,
    redirectUri: string
  ): Promise<McpClientRegistrationRecord | null>;
  saveRegistration(input: McpClientRegistrationRecord): Promise<void>;
}

export function createMcpMarketplaceRepository(
  supabase = getAdminSupabase()
): McpMarketplaceRepository {
  return {
    async getCatalogServer(registryName) {
      const { data, error } = await supabase
        .from(CATALOG_TABLE)
        .select(
          'registry_name, title, description, name_ar, description_ar, remote_url, status, blocked_at, blocked_reason'
        )
        .eq('registry_name', registryName)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async findLiveConnection(userId, registryName) {
      const { data, error } = await supabase
        .from(CONNECTIONS_TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('registry_name', registryName)
        .neq('status', 'revoked')
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as McpConnectionRecord | null) ?? null;
    },

    async getConnection(userId, connectionId) {
      const { data, error } = await supabase
        .from(CONNECTIONS_TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('id', connectionId)
        .maybeSingle();
      if (error) throw error;
      return (data as McpConnectionRecord | null) ?? null;
    },

    async createConnection({ userId, registryName, serverUrl, displayName }) {
      const { data, error } = await supabase
        .from(CONNECTIONS_TABLE)
        .insert({
          user_id: userId,
          registry_name: registryName,
          server_url: serverUrl,
          display_name: displayName,
        })
        .select()
        .single();
      if (error) throw error;
      return data as McpConnectionRecord;
    },

    async updateConnection(connectionId, patch) {
      const { error } = await supabase.from(CONNECTIONS_TABLE).update(patch).eq('id', connectionId);
      if (error) throw error;
    },

    async saveCredentials(input) {
      const { error } = await supabase.from(CREDENTIALS_TABLE).upsert(
        {
          connection_id: input.connectionId,
          authorization_server: input.authorizationServer,
          token_endpoint: input.tokenEndpoint,
          registration_kind: input.registrationKind,
          client_id: input.clientId,
          client_secret_enc: input.clientSecretEnc,
          access_token_enc: input.accessTokenEnc,
          refresh_token_enc: input.refreshTokenEnc,
          scope: input.scope,
          expires_at: input.expiresAt,
          metadata: input.metadata,
          issued_at: new Date().toISOString(),
        },
        { onConflict: 'connection_id' }
      );
      if (error) throw error;
    },

    async getCredentials(connectionId) {
      const { data, error } = await supabase
        .from(CREDENTIALS_TABLE)
        .select('*')
        .eq('connection_id', connectionId)
        .maybeSingle();
      if (error) throw error;
      return (data as McpConnectionCredentialsRecord | null) ?? null;
    },

    async saveTools(connectionId, tools) {
      if (tools.length === 0) return;

      const seenAt = new Date().toISOString();
      const { error } = await supabase.from(TOOLS_TABLE).upsert(
        tools.map((tool) => ({
          connection_id: connectionId,
          tool_name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Json,
          read_only: tool.readOnly,
          last_seen_at: seenAt,
        })),
        { onConflict: 'connection_id,tool_name' }
      );
      if (error) throw error;
    },

    async listTools(connectionId) {
      const { data, error } = await supabase
        .from(TOOLS_TABLE)
        .select('*')
        .eq('connection_id', connectionId)
        .order('tool_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as McpConnectionToolRecord[];
    },

    async saveAttempt(input) {
      const { error } = await supabase.from(ATTEMPTS_TABLE).insert({
        state_hash: input.stateHash,
        user_id: input.userId,
        registry_name: input.registryName,
        server_url: input.serverUrl,
        code_verifier_enc: input.codeVerifierEnc,
        redirect_uri: input.redirectUri,
        expires_at: input.expiresAt,
      });
      if (error) throw error;
    },

    async claimAttempt(stateHash, now) {
      // One statement: PostgREST returns the rows a `delete` removed, so the
      // row is claimed and consumed together and a replay finds nothing.
      const { data, error } = await supabase
        .from(ATTEMPTS_TABLE)
        .delete()
        .eq('state_hash', stateHash)
        .gt('expires_at', now)
        .select()
        .maybeSingle();
      if (error) throw error;
      return (data as McpConnectAttemptRecord | null) ?? null;
    },

    async getRegistration(authorizationServer, redirectUri) {
      const { data, error } = await supabase
        .from(REGISTRATIONS_TABLE)
        .select(
          'authorization_server, redirect_uri, client_id, client_secret_enc, registration_kind'
        )
        .eq('authorization_server', authorizationServer)
        .eq('redirect_uri', redirectUri)
        .maybeSingle();
      if (error) throw error;
      return (data as McpClientRegistrationRecord | null) ?? null;
    },

    async saveRegistration(input) {
      const { error } = await supabase.from(REGISTRATIONS_TABLE).upsert(
        {
          authorization_server: input.authorization_server,
          redirect_uri: input.redirect_uri,
          client_id: input.client_id,
          client_secret_enc: input.client_secret_enc,
          registration_kind: input.registration_kind,
        },
        { onConflict: 'authorization_server,redirect_uri' }
      );
      if (error) throw error;
    },
  };
}
