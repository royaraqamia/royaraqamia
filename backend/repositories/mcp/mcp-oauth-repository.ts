import { getAdminSupabase } from '@/backend/config/supabase';

/**
 * Persistence for the MCP OAuth stores (clients, authorization codes, tokens).
 * Backed by the service-role Supabase client — these tables are RLS-locked to
 * service_role only (see 20260819120000_create_mcp_oauth_tables.sql).
 *
 * All token/code secrets are stored SHA-256-hashed; `session_enc` holds the
 * AES-256-GCM-encrypted Supabase refresh token used to build the user-scoped
 * data client for a session.
 *
 * Revoking a token is also a *shred*: the revoked row stops carrying
 * `session_enc`. A disconnected grant must not leave the encrypted bridge
 * session lying around for a future database dump to replay, and nothing reads
 * `session_enc` after `revoked_at` is set. Rotation therefore has to read the
 * ciphertext it passes forward *before* it revokes the rows it replaces.
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

/**
 * One connected MCP client, folded from the live token rows of a single user.
 * `client_id` is the token rows' value — the client registration's row id, not
 * the `client_id` text the client registered with. `client_name` is filled from
 * the registration so the account surface never reads the clients table itself.
 */
export interface McpUserGrantRecord {
  client_id: string;
  client_name: string | null;
  connected_at: string;
  last_used_at: string | null;
}

/** The columns `listUserGrants` folds; the rest of a token row never leaves here. */
interface GrantRow {
  client_id: string;
  kind: 'access' | 'refresh';
  created_at: string;
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
  /**
   * Atomically claim an authorization code for single use. Returns `true` only
   * for the caller that flipped `used_at` from null; concurrent callers get
   * `false` (RFC 6749 §4.1.2 one-time-use guarantee).
   */
  markAuthCodeUsed(id: string): Promise<boolean>;

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
  updateTokenSessionEnc(id: string, sessionEnc: string): Promise<void>;
  revokeToken(id: string): Promise<void>;
  revokeAllUserTokens(userId: string): Promise<void>;
  /**
   * The bridge ciphertexts a user's live rows hold, so a live revoke can sign
   * out the sessions it is about to strand. Must be read *before* revoking:
   * revoking shreds `session_enc` in the same update.
   *
   * `clientId` narrows to one grant. Revoked rows are absent by construction —
   * they no longer carry a ciphertext.
   */
  listUserSessionEncs(userId: string, clientId?: string): Promise<string[]>;
  /**
   * The user's live grants, one row per connected client. A grant is live while
   * it holds at least one unrevoked, unexpired *refresh* token: access rows come
   * and go with their 1h TTL and the daily sweep, the refresh row is the grant.
   *
   * `last_used_at` comes from the access row, because that is the only row the
   * data plane stamps (`resolveMcpContext` touches the row a bearer token
   * resolves to, and only access rows resolve). Read the refresh rows for the
   * grant's existence and the access rows for its use.
   */
  listUserGrants(userId: string, now: Date): Promise<McpUserGrantRecord[]>;
  /** Shred every token the user holds for one client — a per-client disconnect. */
  revokeUserClientTokens(userId: string, clientId: string): Promise<void>;
  /**
   * Drop one client's live authorization codes. A code exchanges for a fresh
   * token pair and carries a bridge ciphertext of its own, so a disconnect that
   * leaves it behind lets the grant resurrect inside its 10-minute TTL.
   */
  deleteUserClientAuthCodes(userId: string, clientId: string): Promise<void>;
  /** Drop every live authorization code the user holds — a full disconnect. */
  deleteUserAuthCodes(userId: string): Promise<void>;
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
      const { data, error } = await (supabase as any)
        .from(AUTH_CODES_TABLE)
        .update({ used_at: new Date().toISOString() })
        .eq('id', id)
        .is('used_at', null)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      return data !== null;
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

    async updateTokenSessionEnc(id, sessionEnc) {
      const { error } = await (supabase as any)
        .from(TOKENS_TABLE)
        .update({ session_enc: sessionEnc })
        .eq('id', id);
      if (error) throw error;
    },

    async revokeToken(id) {
      // Revoking shreds the bridge ciphertext — see the module note.
      const { error } = await (supabase as any)
        .from(TOKENS_TABLE)
        .update({ revoked_at: new Date().toISOString(), session_enc: null })
        .eq('id', id);
      if (error) throw error;
    },

    async revokeAllUserTokens(userId) {
      const { error } = await (supabase as any)
        .from(TOKENS_TABLE)
        .update({ revoked_at: new Date().toISOString(), session_enc: null })
        .eq('user_id', userId);
      if (error) throw error;
    },

    async listUserSessionEncs(userId, clientId) {
      // `session_enc is not null` is what makes this the live set, whatever else
      // the rows have been through: revoking and retiring both shred it.
      let query = (supabase as any)
        .from(TOKENS_TABLE)
        .select('session_enc')
        .eq('user_id', userId)
        .not('session_enc', 'is', null);
      if (clientId) query = query.eq('client_id', clientId);

      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as Array<{ session_enc: string | null }>)
        .map((row) => row.session_enc)
        .filter((sessionEnc): sessionEnc is string => typeof sessionEnc === 'string');
    },

    async listUserGrants(userId, now) {
      const { data, error } = await (supabase as any)
        .from(TOKENS_TABLE)
        .select('client_id, kind, created_at, last_used_at')
        .eq('user_id', userId)
        .is('revoked_at', null)
        .gt('expires_at', now.toISOString());
      if (error) throw error;

      const grants = foldGrants((data ?? []) as GrantRow[]);
      if (grants.length === 0) return grants;

      // The tokens table carries the client's *row id* in `client_id` (see
      // `issueTokenPair`), and no label, so the names come from a second read
      // keyed on that id. A client whose registration was pruned keeps its grant
      // and shows as unnamed rather than disappearing from a list it can still
      // reach.
      const { data: clients, error: clientsError } = await (supabase as any)
        .from(CLIENTS_TABLE)
        .select('id, client_name')
        .in(
          'id',
          grants.map((grant) => grant.client_id)
        );
      if (clientsError) throw clientsError;

      const names = new Map<string, string | null>(
        ((clients ?? []) as Array<{ id: string; client_name: string | null }>).map((client) => [
          client.id,
          client.client_name,
        ])
      );
      return grants.map((grant) => ({
        ...grant,
        client_name: names.get(grant.client_id) ?? null,
      }));
    },

    async revokeUserClientTokens(userId, clientId) {
      // Revoking shreds the bridge ciphertext — see the module note.
      const { error } = await (supabase as any)
        .from(TOKENS_TABLE)
        .update({ revoked_at: new Date().toISOString(), session_enc: null })
        .eq('user_id', userId)
        .eq('client_id', clientId);
      if (error) throw error;
    },

    async deleteUserClientAuthCodes(userId, clientId) {
      const { error } = await (supabase as any)
        .from(AUTH_CODES_TABLE)
        .delete()
        .eq('user_id', userId)
        .eq('client_id', clientId);
      if (error) throw error;
    },

    async deleteUserAuthCodes(userId) {
      const { error } = await (supabase as any)
        .from(AUTH_CODES_TABLE)
        .delete()
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

/**
 * One grant per client, from that client's live rows of both kinds.
 *
 * The refresh rows define the grant: a re-consent leaves the earlier one alive, so
 * a client can hold several, and the earliest `created_at` among them is when it
 * connected. The access rows carry the use: the data plane stamps only the row a
 * bearer token resolves to, and only access rows resolve, so the newest stamp on
 * any of the grant's live rows is when it was last seen. That stamp is at most as
 * old as the current access row, which is created without one and replaced on
 * every rotation — a grant that has just rotated reads as unused, which is true.
 *
 * Timestamps are compared as instants, never as strings: PostgREST renders
 * `timestamptz` with an offset, and ordering those lexicographically is only
 * right while every row happens to share one.
 */
function foldGrants(rows: GrantRow[]): McpUserGrantRecord[] {
  const grants = new Map<string, McpUserGrantRecord>();

  for (const row of rows) {
    if (row.kind !== 'refresh') continue;

    const existing = grants.get(row.client_id);
    if (!existing) {
      grants.set(row.client_id, {
        client_id: row.client_id,
        client_name: null,
        connected_at: row.created_at,
        last_used_at: null,
      });
      continue;
    }

    if (Date.parse(row.created_at) < Date.parse(existing.connected_at)) {
      existing.connected_at = row.created_at;
    }
  }

  for (const row of rows) {
    const grant = grants.get(row.client_id);
    const usedAt = row.last_used_at;
    if (!grant || usedAt === null) continue;

    const best = grant.last_used_at;
    if (best === null || Date.parse(usedAt) > Date.parse(best)) {
      grant.last_used_at = usedAt;
    }
  }

  return [...grants.values()];
}
