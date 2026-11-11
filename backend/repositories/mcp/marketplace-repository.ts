import { getAdminSupabase } from '@/backend/config/supabase';
import type { Database, Json } from '@/backend/models/database.types';
import { catalogSearchPattern, decodeCatalogCursor, encodeCatalogCursor } from './catalog-cursor';

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
const CATALOG_SYNC_TABLE = 'mcp_catalog_sync_state';
const CONNECTIONS_TABLE = 'mcp_connections';
const CREDENTIALS_TABLE = 'mcp_connection_credentials';
const TOOLS_TABLE = 'mcp_connection_tools';
const ATTEMPTS_TABLE = 'mcp_connect_attempts';
const REGISTRATIONS_TABLE = 'mcp_oauth_client_registrations';

/** What the connect flow needs to know about a catalogue row before it starts. */
export interface McpCatalogServerRecord {
  registry_name: string;
  title: string | null;
  description: string | null;
  name_ar: string | null;
  description_ar: string | null;
  remote_url: string;
  /** The admin's choice of remote; `null` follows the registry's first one. */
  remote_override: string | null;
  status: string;
  blocked_at: string | null;
  blocked_reason: string | null;
  /** The two measured sources, and the mark we ship or an admin chose. */
  registry_icon_url: string | null;
  registry_icon_mime: string | null;
  probe_icon_url: string | null;
  probe_icon_mime: string | null;
  /** A same-origin path or an https URL; wins over both measured sources. */
  icon_override: string | null;
  /** The admin's vouch; a row without one is not in the store. */
  verified_at: string | null;
  /** The measured verdict; `null` is "nobody has asked yet". */
  connectable: boolean | null;
  connectable_reason: string | null;
  probed_at: string | null;
}

/** One registry row, reduced to the columns the mirror keeps. */
export interface McpCatalogUpsertRow {
  registryName: string;
  title: string | null;
  description: string | null;
  version: string | null;
  remoteUrl: string;
  iconUrl: string | null;
  iconMime: string | null;
  status: 'active' | 'deprecated' | 'deleted';
  publishedAt: string | null;
  registryUpdatedAt: string | null;
  raw: Json | null;
}

/** A catalogue row as a list draws it, member or admin. */
export interface McpCatalogListRow {
  registry_name: string;
  title: string | null;
  title_override: string | null;
  description: string | null;
  name_ar: string | null;
  description_ar: string | null;
  remote_url: string;
  /** The admin's choice of remote; `null` follows the registry's first one. */
  remote_override: string | null;
  status: string;
  version: string | null;
  published_at: string | null;
  fetched_at: string;
  registry_icon_url: string | null;
  registry_icon_mime: string | null;
  probe_icon_url: string | null;
  probe_icon_mime: string | null;
  /** A mark we ship ourselves, same-origin; wins over both captured sources. */
  icon_override: string | null;
  featured_rank: number | null;
  verified_at: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  connectable: boolean | null;
  connectable_reason: string | null;
  probed_at: string | null;
  /** The registry document, only selected for the Admin Console. */
  raw?: Json | null;
}

/** What a probe needs: the address, and whether the verdict is due. */
export interface McpCatalogAddressRecord {
  registry_name: string;
  remote_url: string;
  /** The address the admin chose, when it differs from the registry's. */
  remote_override: string | null;
  probed_at: string | null;
  blocked_at: string | null;
  status: string;
}

/** How far a pass through the registry got, and what the last run did. */
export interface McpCatalogSyncStateRecord {
  cursor: string | null;
  pass_started_at: string | null;
  pass_completed_at: string | null;
  pass_rows: number;
  last_run_at: string | null;
  last_run_rows: number;
  last_error: string | null;
}

/** The columns a list selects; one list, two audiences. */
const CATALOG_LIST_COLUMNS =
  'registry_name, title, title_override, description, name_ar, description_ar, remote_url, remote_override, status, version, published_at, fetched_at, registry_icon_url, registry_icon_mime, probe_icon_url, probe_icon_mime, icon_override, featured_rank, verified_at, blocked_at, blocked_reason, connectable, connectable_reason, probed_at';

/**
 * The Admin Console also picks a remote out of the registry document, so it is
 * the only list that selects `raw`; a member's page already pays for the rows
 * it draws and does not need a second copy of the registry's own JSON.
 */
const CATALOG_ADMIN_LIST_COLUMNS =
  'registry_name, title, title_override, description, name_ar, description_ar, remote_url, remote_override, status, version, published_at, fetched_at, registry_icon_url, registry_icon_mime, probe_icon_url, probe_icon_mime, icon_override, featured_rank, verified_at, blocked_at, blocked_reason, connectable, connectable_reason, probed_at, raw';

/**
 * PostgREST takes the rows in the body and the names in the URL, so both are
 * chunked: a full pass is tens of thousands of rows and neither a 30k-element
 * `in()` nor one 30k-row upsert fits in one request.
 */
const CATALOG_UPSERT_BATCH = 200;
const CATALOG_LOOKUP_BATCH = 150;

/**
 * A curated store is small. Drawing it in one query keeps the order pair
 * (`featured_rank`, `registry_name`) honest without a two-key cursor; a
 * directory that outgrows this needs pagination, not a bigger number.
 */
const STORE_MAX_ROWS = 200;

/** The mirror's insert shape, so a payload typo is a type error rather than a 400. */
type CatalogInsert = Database['public']['Tables']['mcp_catalog_servers']['Insert'];

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
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
  /** The caller spending the refresh token, or `null` when nobody is. */
  refresh_claimed_at: string | null;
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
  /**
   * The scope set the client was registered for, space-delimited and `''` when
   * it named none. It is part of the identity of the registration, not a note:
   * a provider that fixes the grant at registration (measured: Supabase) cannot
   * be widened by a second consent through the same client (#1230).
   */
  scope: string;
}

export interface McpMarketplaceRepository {
  getCatalogServer(registryName: string): Promise<McpCatalogServerRecord | null>;

  // ---- the catalogue mirror (phase 2, #1223) ----

  /**
   * Upserts one batch of registry rows by `registry_name`.
   *
   * The registry's own columns move; ours do not. `name_ar`, `description_ar`,
   * `blocked_at` and `blocked_reason` are an admin's work and are never in the
   * payload, so a sync cannot undo a takedown or a translation. A row whose
   * `remote_url` changed loses its verdict in the same write — the address is
   * what the probe measured, so a moved address is an unmeasured one.
   */
  upsertCatalogServers(rows: McpCatalogUpsertRow[]): Promise<void>;

  /**
   * Marks the rows a completed pass did not return as `deleted`.
   *
   * Never a delete: a live connection references the row, and a registry reset
   * must not take a member's grant with it. `seenBefore` is the pass's start.
   */
  markCatalogServersDeleted(seenBefore: string): Promise<number>;

  /** Retires named rows: the registry served them as `deleted` without an address. */
  retireCatalogServers(registryNames: string[]): Promise<void>;

  /** Rows the store still lists; a pass that saw far fewer is an outage. */
  countCatalogServers(): Promise<number>;

  /** One keyset page; `includeHidden` is the Admin Console's takedown list. */
  listCatalogServers(input: {
    q: string;
    cursor: string | null;
    limit: number;
    includeHidden: boolean;
    /**
     * The member's store: verified, connectable, active and unblocked, in store
     * order. The Admin Console passes `false` and sees everything but deleted.
     */
    storeOnly: boolean;
  }): Promise<{ rows: McpCatalogListRow[]; nextCursor: string | null }>;

  /** The addresses behind a page's rows, for the on-demand probe. */
  getCatalogAddresses(registryNames: string[]): Promise<McpCatalogAddressRecord[]>;

  /**
   * Verified rows whose verdict is due again. The store must stop offering a
   * server that went down even when no member draws it, so the sync re-probes
   * these rather than waiting for a screen.
   */
  listVerifiedAddresses(limit: number): Promise<McpCatalogAddressRecord[]>;

  saveCatalogProbe(
    registryName: string,
    probe: {
      connectable: boolean;
      reason: string | null;
      probedAt: string;
      iconUrl: string | null;
      iconMime: string | null;
    }
  ): Promise<void>;

  /** The takedown switch, the overrides, and the store's admission. */
  updateCatalogServer(
    registryName: string,
    patch: Partial<{
      blocked_at: string | null;
      blocked_reason: string | null;
      name_ar: string | null;
      description_ar: string | null;
      verified_at: string | null;
      verification_withdrawn_at: string | null;
      featured_rank: number | null;
      title_override: string | null;
      icon_override: string | null;
      remote_override: string | null;
      connectable: boolean | null;
      connectable_reason: string | null;
      probed_at: string | null;
      probe_icon_url: string | null;
      probe_icon_mime: string | null;
    }>
  ): Promise<void>;

  /** The launch set's brand names, written only where nobody wrote one first. */
  setTitleOverrideIfEmpty(registryName: string, title: string): Promise<void>;

  /**
   * The curated brand mark, written only where nobody has one: the same seam as
   * the title, so a later admin edit or a code change is not overwritten by the
   * sync that runs every day.
   */
  setIconOverrideIfEmpty(registryName: string, icon: string): Promise<void>;

  /**
   * The launch set's bootstrap: verify the named rows unless an admin already
   * withdrew the vouch. It is a no-op after the first run for every row that
   * still exists, and it never verifies a blocked or retired row.
   */
  verifyLaunchSet(registryNames: string[], verifiedAt: string): Promise<number>;

  getCatalogSyncState(): Promise<McpCatalogSyncStateRecord>;
  saveCatalogSyncState(patch: Partial<McpCatalogSyncStateRecord>): Promise<void>;

  /** The live connection for a member and a catalogue row, if there is one. */
  findLiveConnection(userId: string, registryName: string): Promise<McpConnectionRecord | null>;
  getConnection(userId: string, connectionId: string): Promise<McpConnectionRecord | null>;

  /**
   * Every connection the member holds that has not been revoked, newest first.
   *
   * It filters on `user_id` for the same reason every read here does: the
   * table is service-role only, so the database is not going to refuse on our
   * behalf.
   */
  listConnections(userId: string): Promise<McpConnectionRecord[]>;

  /**
   * Removes a connection the member owns. The credentials and the tools go with
   * it (`on delete cascade`); a row the member does not own is not touched.
   */
  deleteConnection(userId: string, connectionId: string): Promise<boolean>;

  /** One tool's switch. A name the connection does not advertise changes nothing. */
  setToolEnabled(connectionId: string, toolName: string, enabled: boolean): Promise<boolean>;
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
   * Claims the right to spend one refresh token, atomically.
   *
   * The write is conditional on nobody else holding the claim, so two callers
   * that notice the same expiring token cannot both exchange the same refresh
   * token — a provider that rotates answers the second with `invalid_grant`,
   * which reads to the member as a revocation they never made. A claim older
   * than `staleBefore` is abandoned by a caller that died mid-refresh, and may
   * be taken. `null` means another caller holds it.
   */
  claimRefresh(
    connectionId: string,
    now: string,
    staleBefore: string
  ): Promise<McpConnectionCredentialsRecord | null>;

  /** Gives the claim back after a refresh that produced nothing. */
  releaseRefresh(connectionId: string): Promise<void>;

  /**
   * Upserts what `tools/list` answered. Tools the server no longer advertises are
   * left in place — `last_seen_at` stops moving — because deleting them would
   * delete the member's own switches on a server's bad day.
   */
  saveTools(connectionId: string, tools: McpToolInput[]): Promise<void>;
  listTools(connectionId: string): Promise<McpConnectionToolRecord[]>;

  /**
   * Every tool of every connection the member could use right now: the
   * connection is enabled and not revoked, and the tool is switched on.
   *
   * Two queries rather than a join, because the tool table is keyed by
   * connection and the pair is small — a member holds tens of connections, not
   * thousands, and the assistant reads this once per turn.
   */
  listUsableTools(
    userId: string
  ): Promise<Array<{ connection: McpConnectionRecord; tool: McpConnectionToolRecord }>>;

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
          'registry_name, title, description, name_ar, description_ar, remote_url, remote_override, status, blocked_at, blocked_reason, registry_icon_url, registry_icon_mime, probe_icon_url, probe_icon_mime, icon_override, verified_at, connectable, connectable_reason, probed_at'
        )
        .eq('registry_name', registryName)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async upsertCatalogServers(rows) {
      if (rows.length === 0) return;

      const fetchedAt = new Date().toISOString();
      const names = rows.map((row) => row.registryName);

      // Which rows are new or moved? Those lose their verdict; every other row
      // keeps it, so a sync never erases a measurement it did not make. The
      // address that was measured is the effective one: an admin's override
      // means the registry moving its own entry does not move what we probe.
      const known = new Map<string, { url: string; override: string | null }>();
      for (const batch of chunk(names, CATALOG_LOOKUP_BATCH)) {
        const { data, error } = await supabase
          .from(CATALOG_TABLE)
          .select('registry_name, remote_url, remote_override')
          .in('registry_name', batch);
        if (error) throw error;
        for (const row of data ?? []) {
          known.set(row.registry_name as string, {
            url: row.remote_url as string,
            override: (row.remote_override as string | null) ?? null,
          });
        }
      }

      const effective = (url: string, override: string | null): string => override ?? url;

      const base = (row: McpCatalogUpsertRow): CatalogInsert => ({
        registry_name: row.registryName,
        title: row.title,
        description: row.description,
        version: row.version,
        remote_url: row.remoteUrl,
        transport: 'streamable-http',
        // The registry's mark lives in its own columns: the probe's `logo_uri`
        // must survive the next sync, and the service prefers the probe's.
        registry_icon_url: row.iconUrl,
        registry_icon_mime: row.iconMime,
        status: row.status,
        published_at: row.publishedAt,
        registry_updated_at: row.registryUpdatedAt,
        fetched_at: fetchedAt,
        raw: row.raw,
      });

      // A row nobody has mirrored yet is new, and a new address is unmeasured.
      const wasMeasured = (row: McpCatalogUpsertRow): boolean => {
        const previous = known.get(row.registryName);
        if (!previous) return false;
        return (
          effective(previous.url, previous.override) === effective(row.remoteUrl, previous.override)
        );
      };

      const unmoved = rows.filter(wasMeasured);
      const moved = rows.filter((row) => !wasMeasured(row));

      const writes: CatalogInsert[] = unmoved.map(base);
      writes.push(
        ...moved.map((row): CatalogInsert => ({
          ...base(row),
          connectable: null,
          connectable_reason: null,
          probed_at: null,
          // The mark was measured at the old address, so it goes with the
          // verdict; the registry's own icon is rewritten above either way.
          probe_icon_url: null,
          probe_icon_mime: null,
        }))
      );

      for (const batch of chunk(writes, CATALOG_UPSERT_BATCH)) {
        const { error } = await supabase
          .from(CATALOG_TABLE)
          .upsert(batch, { onConflict: 'registry_name' });
        if (error) throw error;
      }
    },

    async markCatalogServersDeleted(seenBefore) {
      const { data, error } = await supabase
        .from(CATALOG_TABLE)
        .update({ status: 'deleted' })
        .lt('fetched_at', seenBefore)
        .neq('status', 'deleted')
        .select('registry_name');
      if (error) throw error;
      return (data ?? []).length;
    },

    async retireCatalogServers(registryNames) {
      if (registryNames.length === 0) return;
      for (const batch of chunk(registryNames, CATALOG_LOOKUP_BATCH)) {
        const { error } = await supabase
          .from(CATALOG_TABLE)
          .update({ status: 'deleted' })
          .in('registry_name', batch);
        if (error) throw error;
      }
    },

    async countCatalogServers() {
      const { count, error } = await supabase
        .from(CATALOG_TABLE)
        .select('registry_name', { count: 'exact', head: true })
        .neq('status', 'deleted');
      if (error) throw error;
      return count ?? 0;
    },

    async listCatalogServers({ q, cursor, limit, includeHidden, storeOnly }) {
      /*
        The store is a curated directory, not a paginated catalogue: at most a
        couple of hundred rows, ordered by the admin's rank and then the registry
        key. That is one `order=` pair and no keyset cursor, which is why the
        table no longer needs a generated sort key.
      */
      // The column list is a string rather than a literal on purpose: the admin
      // list is the store's list plus `raw`, and a union of two literals is not
      // something PostgREST's select typer can read.
      const columns: string = storeOnly ? CATALOG_LIST_COLUMNS : CATALOG_ADMIN_LIST_COLUMNS;
      let builder = supabase
        .from(CATALOG_TABLE)
        .select(columns)
        .limit(storeOnly ? STORE_MAX_ROWS : limit + 1);

      if (storeOnly) {
        builder = builder
          .order('featured_rank', { ascending: true, nullsFirst: false })
          .order('registry_name', { ascending: true });
      } else {
        builder = builder.order('registry_name', { ascending: true });
      }

      if (includeHidden) {
        // The takedown list shows the rows a member could meet — blocked and
        // deprecated included — but not the ones the registry retired, which no
        // screen can draw and no decision can restore.
        builder = builder.neq('status', 'deleted');
      } else {
        builder = builder.eq('status', 'active').is('blocked_at', null);
      }

      // The store's admission rule, in the query rather than the render: a row
      // nobody verified, or one the probe says cannot be connected, is not a row
      // a member may meet.
      if (storeOnly) {
        builder = builder.not('verified_at', 'is', null).eq('connectable', true);
      }

      const term = q.trim();
      if (term) builder = builder.ilike('search_text', `%${catalogSearchPattern(term)}%`);

      if (!storeOnly) {
        const after = cursor ? decodeCatalogCursor(cursor) : null;
        if (after) builder = builder.gt('registry_name', after);
      }

      const { data, error } = await builder;
      if (error) throw error;

      // A non-literal select is `GenericStringError` to PostgREST's typer; the
      // columns above are the contract, and the shapes below are the row types.
      const rows = (data ?? []) as unknown as McpCatalogListRow[];
      if (storeOnly) return { rows, nextCursor: null };

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page[page.length - 1];

      return {
        rows: page,
        nextCursor: hasMore && last ? encodeCatalogCursor(last.registry_name) : null,
      };
    },

    async listVerifiedAddresses(limit) {
      const { data, error } = await supabase
        .from(CATALOG_TABLE)
        .select('registry_name, remote_url, remote_override, probed_at, blocked_at, status')
        .eq('status', 'active')
        .is('blocked_at', null)
        .not('verified_at', 'is', null)
        .order('probed_at', { ascending: true, nullsFirst: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as McpCatalogAddressRecord[];
    },

    async getCatalogAddresses(registryNames) {
      if (registryNames.length === 0) return [];

      const found: McpCatalogAddressRecord[] = [];
      for (const batch of chunk(registryNames, CATALOG_LOOKUP_BATCH)) {
        const { data, error } = await supabase
          .from(CATALOG_TABLE)
          .select('registry_name, remote_url, remote_override, probed_at, blocked_at, status')
          .in('registry_name', batch);
        if (error) throw error;
        found.push(...((data ?? []) as McpCatalogAddressRecord[]));
      }
      return found;
    },

    async saveCatalogProbe(registryName, probe) {
      const { error } = await supabase
        .from(CATALOG_TABLE)
        .update({
          connectable: probe.connectable,
          connectable_reason: probe.reason,
          probed_at: probe.probedAt,
          // Always written, including `null`: a server that stopped publishing
          // a mark should fall back to the registry's icon, not keep a stale one.
          probe_icon_url: probe.iconUrl,
          probe_icon_mime: probe.iconMime,
        })
        .eq('registry_name', registryName);
      if (error) throw error;
    },

    async updateCatalogServer(registryName, patch) {
      const { error } = await supabase
        .from(CATALOG_TABLE)
        .update(patch)
        .eq('registry_name', registryName);
      if (error) throw error;
    },

    async setTitleOverrideIfEmpty(registryName, title) {
      const { error } = await supabase
        .from(CATALOG_TABLE)
        .update({ title_override: title })
        .eq('registry_name', registryName)
        .is('title_override', null);
      if (error) throw error;
    },

    async setIconOverrideIfEmpty(registryName, icon) {
      const { error } = await supabase
        .from(CATALOG_TABLE)
        .update({ icon_override: icon })
        .eq('registry_name', registryName)
        .is('icon_override', null);
      if (error) throw error;
    },

    async verifyLaunchSet(registryNames, verifiedAt) {
      if (registryNames.length === 0) return 0;

      const { data, error } = await supabase
        .from(CATALOG_TABLE)
        .update({ verified_at: verifiedAt })
        .in('registry_name', registryNames)
        .is('verified_at', null)
        .is('verification_withdrawn_at', null)
        .eq('status', 'active')
        .is('blocked_at', null)
        .select('registry_name');
      if (error) throw error;
      return (data ?? []).length;
    },

    async getCatalogSyncState() {
      const { data, error } = await supabase
        .from(CATALOG_SYNC_TABLE)
        .select('*')
        .eq('id', 'registry')
        .maybeSingle();
      if (error) throw error;

      const row = data as (McpCatalogSyncStateRecord & { id: string }) | null;
      return {
        cursor: row?.cursor ?? null,
        pass_started_at: row?.pass_started_at ?? null,
        pass_completed_at: row?.pass_completed_at ?? null,
        pass_rows: row?.pass_rows ?? 0,
        last_run_at: row?.last_run_at ?? null,
        last_run_rows: row?.last_run_rows ?? 0,
        last_error: row?.last_error ?? null,
      };
    },

    async saveCatalogSyncState(patch) {
      const { error } = await supabase
        .from(CATALOG_SYNC_TABLE)
        .upsert({ id: 'registry', ...patch }, { onConflict: 'id' });
      if (error) throw error;
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

    async listConnections(userId) {
      const { data, error } = await supabase
        .from(CONNECTIONS_TABLE)
        .select('*')
        .eq('user_id', userId)
        .neq('status', 'revoked')
        .order('connected_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as McpConnectionRecord[];
    },

    async deleteConnection(userId, connectionId) {
      const { data, error } = await supabase
        .from(CONNECTIONS_TABLE)
        .delete()
        .eq('user_id', userId)
        .eq('id', connectionId)
        .select('id');
      if (error) throw error;
      return (data ?? []).length > 0;
    },

    async setToolEnabled(connectionId, toolName, enabled) {
      const { data, error } = await supabase
        .from(TOOLS_TABLE)
        .update({ enabled })
        .eq('connection_id', connectionId)
        .eq('tool_name', toolName)
        .select('tool_name');
      if (error) throw error;
      return (data ?? []).length > 0;
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
          // The write that replaces the tokens is also the release of the
          // claim: whoever claimed the refresh is done with it either way, and
          // a claim left behind would make the next caller wait for the stale
          // window before it could refresh at all.
          refresh_claimed_at: null,
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

    async claimRefresh(connectionId, now, staleBefore) {
      // One statement: the filter is part of the write, so a second caller's
      // update matches no row and it learns that from an empty answer.
      const { data, error } = await supabase
        .from(CREDENTIALS_TABLE)
        .update({ refresh_claimed_at: now })
        .eq('connection_id', connectionId)
        .or(`refresh_claimed_at.is.null,refresh_claimed_at.lt.${staleBefore}`)
        .select()
        .maybeSingle();
      if (error) throw error;
      return (data as McpConnectionCredentialsRecord | null) ?? null;
    },

    async releaseRefresh(connectionId) {
      const { error } = await supabase
        .from(CREDENTIALS_TABLE)
        .update({ refresh_claimed_at: null })
        .eq('connection_id', connectionId);
      if (error) throw error;
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

    async listUsableTools(userId) {
      const { data: connections, error: connectionsError } = await supabase
        .from(CONNECTIONS_TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('enabled', true)
        .neq('status', 'revoked')
        // A connection waiting for the member's consent is not called: its
        // token is the one the provider already refused.
        .neq('status', 'needs_reauth')
        .order('id', { ascending: true });
      if (connectionsError) throw connectionsError;

      const rows = (connections ?? []) as McpConnectionRecord[];
      if (rows.length === 0) return [];

      const { data: tools, error: toolsError } = await supabase
        .from(TOOLS_TABLE)
        .select('*')
        .in(
          'connection_id',
          rows.map((row) => row.id)
        )
        .eq('enabled', true)
        .order('tool_name', { ascending: true });
      if (toolsError) throw toolsError;

      const byConnection = new Map(rows.map((row) => [row.id, row] as const));
      return ((tools ?? []) as McpConnectionToolRecord[]).flatMap((tool) => {
        const connection = byConnection.get(tool.connection_id);
        return connection ? [{ connection, tool }] : [];
      });
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
          'authorization_server, redirect_uri, client_id, client_secret_enc, registration_kind, scope'
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
          scope: input.scope,
        },
        { onConflict: 'authorization_server,redirect_uri' }
      );
      if (error) throw error;
    },
  };
}
