import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { McpDiscovery, McpRemoteClient, McpRemoteTool } from '@/backend/clients/mcp-remote';
import type {
  McpCatalogServerRecord,
  McpConnectAttemptRecord,
  McpConnectionCredentialsRecord,
  McpConnectionRecord,
  McpConnectionToolRecord,
  McpMarketplaceRepository,
  McpToolInput,
} from '@/backend/repositories/mcp/marketplace-repository';
import { createMcpConnectService, McpConnectError } from '../marketplace/connect-service';

/**
 * The connect flow, driven against an in-memory store and a fake network.
 *
 * What these tests pin is the part a reviewer cannot check by reading the happy
 * path: that the slot is asked about only for a *new* connection, that a second
 * start reuses one registration instead of registering twice, that the attempt
 * row holds no plaintext, and that a failed tool read keeps the grant the member
 * already consented to.
 */

vi.mock('@/backend/config/plans', () => ({
  createUsageService: () => ({ caps: async () => ({ plan: 'pro', unlimited: true, caps: {} }) }),
  createPlanGate: () => ({ cap: async () => undefined }),
}));

const CATALOG: McpCatalogServerRecord = {
  registry_name: 'io.example/notion',
  title: 'Notion',
  description: 'Pages and databases',
  name_ar: null,
  description_ar: null,
  remote_url: 'https://mcp.notion.example/mcp',
  status: 'active',
  blocked_at: null,
  blocked_reason: null,
  icon_url: null,
  verified_at: '2026-11-14T00:00:00.000Z',
  connectable: true,
  connectable_reason: null,
  probed_at: '2026-11-14T00:00:00.000Z',
};

const DISCOVERY: McpDiscovery = {
  resource: 'https://mcp.notion.example/mcp',
  authorizationServer: 'https://auth.notion.example',
  authorizationEndpoint: 'https://auth.notion.example/authorize',
  tokenEndpoint: 'https://auth.notion.example/token',
  registrationEndpoint: 'https://auth.notion.example/register',
  scopes: ['read'],
  logoUrl: null,
  metadata: {
    issuer: 'https://auth.notion.example',
    authorization_endpoint: 'https://auth.notion.example/authorize',
    token_endpoint: 'https://auth.notion.example/token',
  } as McpDiscovery['metadata'],
};

function fakeRepository(overrides: Partial<McpMarketplaceRepository> = {}) {
  const connections = new Map<string, McpConnectionRecord>();
  const credentials = new Map<string, McpConnectionCredentialsRecord>();
  const tools = new Map<string, McpConnectionToolRecord[]>();
  const attempts = new Map<string, McpConnectAttemptRecord>();
  const registrations = new Map<string, { client_id: string; client_secret_enc: string | null }>();

  const repository: McpMarketplaceRepository = {
    getCatalogServer: async () => CATALOG,
    findLiveConnection: async (userId, registryName) =>
      [...connections.values()].find(
        (row) =>
          row.user_id === userId && row.registry_name === registryName && row.status !== 'revoked'
      ) ?? null,
    getConnection: async (userId, id) => {
      const row = connections.get(id);
      return row && row.user_id === userId ? row : null;
    },
    listConnections: async (userId) =>
      [...connections.values()].filter((row) => row.user_id === userId && row.status !== 'revoked'),
    deleteConnection: async (userId, id) => {
      const row = connections.get(id);
      if (!row || row.user_id !== userId) return false;
      connections.delete(id);
      return true;
    },
    setToolEnabled: async (id, toolName, enabled) => {
      const found = tools.get(id) ?? [];
      const tool = found.find((candidate) => candidate.tool_name === toolName);
      if (!tool) return false;
      tools.set(
        id,
        found.map((candidate) =>
          candidate.tool_name === toolName ? { ...candidate, enabled } : candidate
        )
      );
      return true;
    },
    createConnection: async ({ userId, registryName, serverUrl, displayName }) => {
      const row: McpConnectionRecord = {
        id: `conn-${connections.size + 1}`,
        user_id: userId,
        registry_name: registryName,
        server_url: serverUrl,
        display_name: displayName,
        enabled: true,
        permission_level: 'ask',
        status: 'active',
        tool_count: 0,
        connected_at: '2026-11-14T00:00:00.000Z',
        last_used_at: null,
        last_synced_at: null,
        last_error: null,
      };
      connections.set(row.id, row);
      return row;
    },
    updateConnection: async (id, patch) => {
      const row = connections.get(id);
      if (row) connections.set(id, { ...row, ...patch });
    },
    saveCredentials: async (input) => {
      credentials.set(input.connectionId, {
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
        issued_at: '2026-11-14T00:00:00.000Z',
        metadata: input.metadata,
      });
    },
    getCredentials: async (id) => credentials.get(id) ?? null,
    saveTools: async (id, list: McpToolInput[]) => {
      tools.set(
        id,
        list.map((tool) => ({
          connection_id: id,
          tool_name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as unknown as McpConnectionToolRecord['input_schema'],
          read_only: tool.readOnly,
          enabled: true,
          last_seen_at: '2026-11-14T00:00:00.000Z',
        }))
      );
    },
    listTools: async (id) => tools.get(id) ?? [],
    saveAttempt: async (input) => {
      attempts.set(input.stateHash, {
        state_hash: input.stateHash,
        user_id: input.userId,
        registry_name: input.registryName,
        server_url: input.serverUrl,
        code_verifier_enc: input.codeVerifierEnc,
        redirect_uri: input.redirectUri,
        created_at: '2026-11-14T00:00:00.000Z',
        expires_at: input.expiresAt,
      });
    },
    claimAttempt: async (stateHash) => {
      const row = attempts.get(stateHash) ?? null;
      attempts.delete(stateHash);
      return row;
    },
    getRegistration: async (server) => {
      const found = registrations.get(server);
      return found
        ? {
            authorization_server: server,
            redirect_uri: REDIRECT,
            ...found,
            registration_kind: 'dcr',
          }
        : null;
    },
    saveRegistration: async (input) => {
      registrations.set(input.authorization_server, {
        client_id: input.client_id,
        client_secret_enc: input.client_secret_enc,
      });
    },
    // The catalogue's own methods: this flow does not touch them, but the
    // repository interface carries both halves of the marketplace.
    upsertCatalogServers: async () => undefined,
    markCatalogServersDeleted: async () => 0,
    retireCatalogServers: async () => undefined,
    countCatalogServers: async () => 0,
    listCatalogServers: async () => ({ rows: [], nextCursor: null }),
    getCatalogAddresses: async () => [],
    listVerifiedAddresses: async () => [],
    saveCatalogProbe: async () => undefined,
    updateCatalogServer: async () => undefined,
    verifyLaunchSet: async () => 0,
    setTitleOverrideIfEmpty: async () => undefined,
    getCatalogSyncState: async () => ({
      cursor: null,
      pass_started_at: null,
      pass_completed_at: null,
      pass_rows: 0,
      last_run_at: null,
      last_run_rows: 0,
      last_error: null,
    }),
    saveCatalogSyncState: async () => undefined,
    ...overrides,
  };

  return { repository, connections, credentials, tools, attempts, registrations };
}

const REDIRECT = 'https://royaraqamia.com/mcp/callback';

const TOOLS: McpRemoteTool[] = [
  { name: 'search', description: 'Search pages', inputSchema: { type: 'object' }, readOnly: true },
  {
    name: 'create_page',
    description: 'Create a page',
    inputSchema: { type: 'object' },
    readOnly: false,
  },
];

function fakeRemote(overrides: Partial<McpRemoteClient> = {}): McpRemoteClient {
  return {
    discover: vi.fn(async () => DISCOVERY),
    register: vi.fn(async () => ({
      clientId: 'client-1',
      clientSecret: null,
      kind: 'dcr' as const,
    })),
    authorizeUrl: vi.fn(async ({ state }) => ({
      url: `https://auth.notion.example/authorize?state=${state}`,
      codeVerifier: 'verifier-1',
    })),
    exchange: vi.fn(async () => ({
      access_token: 'access-1',
      token_type: 'Bearer',
      refresh_token: 'refresh-1',
      expires_in: 3600,
    })),
    refresh: vi.fn(),
    revoke: vi.fn(async () => false),
    listTools: vi.fn(async () => TOOLS),
    probeConnectable: vi.fn(async () => ({
      connectable: true,
      reason: null,
      logoUrl: null,
      logoMime: null,
    })),
    ...overrides,
  } as McpRemoteClient;
}

beforeEach(() => {
  process.env.MCP_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
});

describe('start', () => {
  it('refuses a row that is not in the catalogue', async () => {
    const { repository } = fakeRepository({
      getCatalogServer: async () => null,
    });
    const service = createMcpConnectService({ repository, remote: fakeRemote() });

    await expect(
      service.start({ userId: 'user-1', registryName: 'gone/nowhere', redirectUri: REDIRECT })
    ).rejects.toMatchObject({ failure: 'unknown_app' });
  });

  it('refuses a blocked row', async () => {
    const { repository } = fakeRepository({
      getCatalogServer: async () => ({ ...CATALOG, blocked_at: '2026-11-14T00:00:00.000Z' }),
    });
    const service = createMcpConnectService({ repository, remote: fakeRemote() });

    await expect(
      service.start({
        userId: 'user-1',
        registryName: CATALOG.registry_name,
        redirectUri: REDIRECT,
      })
    ).rejects.toMatchObject({ failure: 'blocked' });
  });

  it('asks the cap only for a connection that would be new', async () => {
    const assertSlot = vi.fn(async () => undefined);
    const { repository } = fakeRepository();
    const service = createMcpConnectService({
      repository,
      remote: fakeRemote(),
      assertConnectionSlot: assertSlot,
    });

    await service.start({
      userId: 'user-1',
      registryName: CATALOG.registry_name,
      redirectUri: REDIRECT,
    });

    expect(assertSlot).toHaveBeenCalledTimes(1);
  });

  it('refuses at the cap with its own sentence', async () => {
    const { repository } = fakeRepository();
    const service = createMcpConnectService({
      repository,
      remote: fakeRemote(),
      assertConnectionSlot: async () => {
        throw new Error('cap');
      },
    });

    const error = await service
      .start({ userId: 'user-1', registryName: CATALOG.registry_name, redirectUri: REDIRECT })
      .catch((e) => e);

    expect(error).toBeInstanceOf(McpConnectError);
    expect(error.failure).toBe('plan_limit');
  });

  it('stores a hashed state and an encrypted verifier, never the plaintext', async () => {
    const { repository, attempts } = fakeRepository();
    const remote = fakeRemote();
    const service = createMcpConnectService({ repository, remote });

    const { authorizeUrl } = await service.start({
      userId: 'user-1',
      registryName: CATALOG.registry_name,
      redirectUri: REDIRECT,
    });

    const state = new URL(authorizeUrl).searchParams.get('state') ?? '';
    const row = [...attempts.values()][0]!;

    expect(row.state_hash).not.toBe(state);
    expect(row.code_verifier_enc).not.toBe('verifier-1');
    expect(row.code_verifier_enc).not.toContain('verifier-1');
    expect(row.redirect_uri).toBe(REDIRECT);
    expect(row.server_url).toBe(CATALOG.remote_url);
  });

  it('registers once and reuses that registration on the next start', async () => {
    const { repository } = fakeRepository();
    const remote = fakeRemote();
    const service = createMcpConnectService({ repository, remote });

    await service.start({
      userId: 'user-1',
      registryName: CATALOG.registry_name,
      redirectUri: REDIRECT,
    });
    await service.start({
      userId: 'user-1',
      registryName: CATALOG.registry_name,
      redirectUri: REDIRECT,
    });

    expect(remote.register).toHaveBeenCalledTimes(1);
  });

  it('refuses a server that offers no dynamic registration', async () => {
    const { repository } = fakeRepository();
    const remote = fakeRemote({
      discover: async () => ({ ...DISCOVERY, registrationEndpoint: null }),
    });
    const service = createMcpConnectService({ repository, remote });

    await expect(
      service.start({
        userId: 'user-1',
        registryName: CATALOG.registry_name,
        redirectUri: REDIRECT,
      })
    ).rejects.toMatchObject({ failure: 'registration' });
  });
});

describe('complete', () => {
  async function started() {
    const fake = fakeRepository();
    const remote = fakeRemote();
    const service = createMcpConnectService({ repository: fake.repository, remote });
    const { authorizeUrl } = await service.start({
      userId: 'user-1',
      registryName: CATALOG.registry_name,
      redirectUri: REDIRECT,
    });
    return {
      ...fake,
      remote,
      service,
      state: new URL(authorizeUrl).searchParams.get('state') ?? '',
    };
  }

  it('refuses a state that was already claimed', async () => {
    const { service, state } = await started();

    await service.complete({ userId: 'user-1', state, code: 'code-1' });
    await expect(
      service.complete({ userId: 'user-1', state, code: 'code-1' })
    ).rejects.toMatchObject({ failure: 'expired_state' });
  });

  it('refuses another member’s state', async () => {
    const { service, state } = await started();

    await expect(
      service.complete({ userId: 'user-2', state, code: 'code-1' })
    ).rejects.toMatchObject({ failure: 'expired_state' });
  });

  it('creates the connection, stores ciphertext, and records the tools', async () => {
    const { service, state, connections, credentials, tools } = await started();

    const { connectionId } = await service.complete({ userId: 'user-1', state, code: 'code-1' });

    const connection = connections.get(connectionId)!;
    expect(connection.display_name).toBe('Notion');
    expect(connection.status).toBe('active');
    expect(connection.tool_count).toBe(2);
    expect(connection.last_synced_at).toBeTruthy();

    const stored = credentials.get(connectionId)!;
    expect(stored.access_token_enc).not.toContain('access-1');
    expect(stored.refresh_token_enc).not.toContain('refresh-1');
    expect(stored.expires_at).toBeTruthy();

    const rows = tools.get(connectionId)!;
    expect(rows.map((row) => row.tool_name)).toEqual(['search', 'create_page']);
    expect(rows[0]?.read_only).toBe(true);
    expect(rows[1]?.read_only).toBe(false);
  });

  it('re-authorising the same server reuses the connection instead of adding one', async () => {
    const first = await started();
    await first.service.complete({ userId: 'user-1', state: first.state, code: 'code-1' });

    // A second handshake for the same member and row.
    const { authorizeUrl } = await first.service.start({
      userId: 'user-1',
      registryName: CATALOG.registry_name,
      redirectUri: REDIRECT,
    });
    const state = new URL(authorizeUrl).searchParams.get('state') ?? '';
    const { connectionId } = await first.service.complete({
      userId: 'user-1',
      state,
      code: 'code-2',
    });

    expect(first.connections.size).toBe(1);
    expect(connectionId).toBe('conn-1');
  });

  it('keeps the grant when the tool list fails, and says so on the row', async () => {
    const fake = fakeRepository();
    const remote = fakeRemote({
      listTools: async () => {
        throw new Error('boom');
      },
    });
    const service = createMcpConnectService({ repository: fake.repository, remote });

    const { authorizeUrl } = await service.start({
      userId: 'user-1',
      registryName: CATALOG.registry_name,
      redirectUri: REDIRECT,
    });
    const state = new URL(authorizeUrl).searchParams.get('state') ?? '';

    const { connectionId } = await service.complete({ userId: 'user-1', state, code: 'code-1' });

    const connection = fake.connections.get(connectionId)!;
    expect(connection.status).toBe('error');
    expect(connection.last_error).toBeTruthy();
    expect(fake.credentials.get(connectionId)?.access_token_enc).toBeTruthy();
  });
});
