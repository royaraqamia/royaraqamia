import { getAdminSupabase } from '@/backend/config/supabase';

/**
 * Persistence for the MCP OAuth stores (clients, authorization codes, tokens).
 * Backed by the service-role Supabase client — these tables are RLS-locked to
 * service_role only (see 20260819120000_create_mcp_oauth_tables.sql).
 *
 * All token/code secrets are stored SHA-256-hashed; `session_enc` holds the
 * AES-256-GCM-encrypted Supabase refresh token used to build the user-scoped
 * data client for a session.
 */

export interface McpOAuthClientRecord {
  id: string;
  client_id: string;
  client_secret_hash: string | null;
  client_name: string | null;
  redirect_uris: string[];
  scopes: string[];
  created_at: string;
  expires_at: string | null;
}

export interface McpAuthCodeRecord {
  id: string;
  code_hash: string;
  client_id: string;
  user_id: string;
  code_challenge: string;
  challenge_method: string;
  redirect_uri: string;
  scope: string[];
  session_enc: string | null;
  expires_at: string;
  used_at: string | null;
}

export interface McpTokenRecord {
  id: string;
  token_hash: string;
  kind: 'access' | 'refresh';
  client_id: string;
  user_id: string;
  scope: string[];
  session_enc: string | null;
  refresh_token_hash: string | null;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

const CLIENTS_TABLE = 'mcp_oauth_clients';
const AUTH_CODES_TABLE = 'mcp_oauth_auth_codes';
const TOKENS_TABLE = 'mcp_oauth_tokens';

export interface McpOAuthRepository {
  getClient(clientId: string): Promise<McpOAuthClientRecord | null>;
  createClient(input: {
    clientId: string;
    clientSecretHash: string | null;
    clientName: string | null;
    redirectUris: string[];
    scopes: string[];
    expiresAt: Date | null;
  }): Promise<McpOAuthClientRecord>;

  saveAuthCode(input: {
    codeHash: string;
    clientId: string;
    userId: string;
    codeChallenge: string;
    challengeMethod: string;
    redirectUri: string;
    scope: string[];
    sessionEnc: string | null;
    expiresAt: Date;
  }): Promise<void>;
  getAuthCode(codeHash: string): Promise<McpAuthCodeRecord | null>;
  markAuthCodeUsed(id: string): Promise<void>;

  createToken(input: {
    tokenHash: string;
    kind: 'access' | 'refresh';
    clientId: string;
    userId: string;
    scope: string[];
    sessionEnc: string | null;
    refreshTokenHash: string | null;
    expiresAt: Date;
  }): Promise<void>;
  getTokenByHash(tokenHash: string): Promise<McpTokenRecord | null>;
  getAccessTokenByRefreshHash(refreshTokenHash: string): Promise<McpTokenRecord | null>;
  touchTokenLastUsed(id: string): Promise<void>;
  revokeToken(id: string): Promise<void>;
  revokeAllUserTokens(userId: string): Promise<void>;
  deleteExpired(now: Date): Promise<void>;
}

export function createMcpOAuthRepository(supabase = getAdminSupabase()): McpOAuthRepository {
  return {
    async getClient(clientId) {
      const { data } = await (supabase as any)
        .from(CLIENTS_TABLE)
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();
      if (!data) return null;
      return data as McpOAuthClientRecord;
    },

    async createClient(input) {
      const { data, error } = await (supabase as any)
        .from(CLIENTS_TABLE)
        .insert({
          client_id: input.clientId,
          client_secret_hash: input.clientSecretHash,
          client_name: input.clientName,
          redirect_uris: input.redirectUris,
          scopes: input.scopes,
          expires_at: input.expiresAt?.toISOString() ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as McpOAuthClientRecord;
    },

    async saveAuthCode(input) {
      const { error } = await (supabase as any).from(AUTH_CODES_TABLE).insert({
        code_hash: input.codeHash,
        client_id: input.clientId,
        user_id: input.userId,
        code_challenge: input.codeChallenge,
        challenge_method: input.challengeMethod,
        redirect_uri: input.redirectUri,
        scope: input.scope,
        session_enc: input.sessionEnc,
        expires_at: input.expiresAt.toISOString(),
      });
      if (error) throw error;
    },

    async getAuthCode(codeHash) {
      const { data } = await (supabase as any)
        .from(AUTH_CODES_TABLE)
        .select('*')
        .eq('code_hash', codeHash)
        .maybeSingle();
      if (!data) return null;
      return data as McpAuthCodeRecord;
    },

    async markAuthCodeUsed(id) {
      const { error } = await (supabase as any)
        .from(AUTH_CODES_TABLE)
        .update({ used_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },

    async createToken(input) {
      const { error } = await (supabase as any).from(TOKENS_TABLE).insert({
        token_hash: input.tokenHash,
        kind: input.kind,
        client_id: input.clientId,
        user_id: input.userId,
        scope: input.scope,
        session_enc: input.sessionEnc,
        refresh_token_hash: input.refreshTokenHash,
        expires_at: input.expiresAt.toISOString(),
      });
      if (error) throw error;
    },

    async getTokenByHash(tokenHash) {
      const { data } = await (supabase as any)
        .from(TOKENS_TABLE)
        .select('*')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (!data) return null;
      return data as McpTokenRecord;
    },

    async getAccessTokenByRefreshHash(refreshTokenHash) {
      const { data } = await (supabase as any)
        .from(TOKENS_TABLE)
        .select('*')
        .eq('kind', 'access')
        .eq('refresh_token_hash', refreshTokenHash)
        .maybeSingle();
      if (!data) return null;
      return data as McpTokenRecord;
    },

    async touchTokenLastUsed(id) {
      const { error } = await (supabase as any)
        .from(TOKENS_TABLE)
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },

    async revokeToken(id) {
      const { error } = await (supabase as any)
        .from(TOKENS_TABLE)
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },

    async revokeAllUserTokens(userId) {
      const { error } = await (supabase as any)
        .from(TOKENS_TABLE)
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
    },

    async deleteExpired(now) {
      const { error } = await (supabase as any)
        .from(TOKENS_TABLE)
        .delete()
        .or(`revoked_at.is.not.null,expires_at.lt.${now.toISOString()}`);
      if (error) throw error;
    },
  };
}
