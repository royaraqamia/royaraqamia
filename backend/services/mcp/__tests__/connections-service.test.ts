import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  McpConnectionCredentialsRecord,
  McpConnectionRecord,
  McpConnectionToolRecord,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import type { McpRemoteClient } from '@/backend/clients/mcp-remote';
import { encryptSecret } from '@/backend/shared/mcp-token-crypto';
import { createMcpConnectionService } from '../marketplace/connections-service';

/**
 * The outbound list and the post-connect screen, against an in-memory store.
 *
 * What these pin is what a screenshot cannot: that a member never reaches
 * another member's row, that a disconnect deletes locally even when the
 * provider refuses to revoke, and that a tool the server stopped advertising is
 * stale rather than gone.
 */

const USER = 'user-1';
const CONNECTION_ID = 'connection-1';

function connection(overrides: Partial<McpConnectionRecord> = {}): McpConnectionRecord {
  return {
    id: CONNECTION_ID,
    user_id: USER,
    registry_name: 'ac.example/mcp',
    server_url: 'https://mcp.example.com',
    display_name: 'Example',
    enabled: true,
    permission_level: 'ask',
    status: 'active',
    tool_count: 2,
    connected_at: '2026-11-01T10:00:00.000Z',
    last_used_at: null,
    last_synced_at: '2026-11-10T10:00:00.000Z',
    last_error: null,
    ...overrides,
  };
}

function tool(overrides: Partial<McpConnectionToolRecord> = {}): McpConnectionToolRecord {
  return {
    connection_id: CONNECTION_ID,
    tool_name: 'search',
    description: 'Search the workspace',
    input_schema: null,
    read_only: true,
    enabled: true,
    last_seen_at: '2026-11-10T10:00:00.000Z',
    ...overrides,
  };
}

function fakeRepository(
  seed: {
    connections?: McpConnectionRecord[];
    tools?: McpConnectionToolRecord[];
    credentials?: McpConnectionCredentialsRecord | null;
  } = {}
) {
  const connections = new Map((seed.connections ?? [connection()]).map((row) => [row.id, row]));
  const tools = new Map<string, McpConnectionToolRecord[]>([
    [CONNECTION_ID, seed.tools ?? [tool()]],
  ]);
  const updates: Array<{ connectionId: string; patch: unknown }> = [];

  const repository: McpMarketplaceRepository = {
    getCatalogServer: async () => null,
    findLiveConnection: async () => null,
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
      if (!found.some((candidate) => candidate.tool_name === toolName)) return false;
      tools.set(
        id,
        found.map((candidate) =>
          candidate.tool_name === toolName ? { ...candidate, enabled } : candidate
        )
      );
      return true;
    },
    createConnection: async () => {
      throw new Error('not used');
    },
    updateConnection: async (connectionId, patch) => {
      updates.push({ connectionId, patch });
    },
    saveCredentials: async () => undefined,
    getCredentials: async () => seed.credentials ?? null,
    saveTools: async () => undefined,
    listTools: async (id) => tools.get(id) ?? [],
    saveAttempt: async () => undefined,
    claimAttempt: async () => null,
    getRegistration: async () => null,
    saveRegistration: async () => undefined,
    upsertCatalogServers: async () => undefined,
    markCatalogServersDeleted: async () => 0,
    retireCatalogServers: async () => undefined,
    countCatalogServers: async () => 0,
    listCatalogServers: async () => ({ rows: [], nextCursor: null }),
    getCatalogAddresses: async () => [],
    saveCatalogProbe: async () => undefined,
    updateCatalogServer: async () => undefined,
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
  };

  return { repository, connections, tools, updates };
}

function fakeRemote(overrides: Partial<McpRemoteClient> = {}): McpRemoteClient {
  return {
    discover: vi.fn(),
    probeConnectable: vi.fn(),
    register: vi.fn(),
    authorizeUrl: vi.fn(),
    exchange: vi.fn(),
    refresh: vi.fn(),
    revoke: vi.fn(async () => false),
    listTools: vi.fn(),
    ...overrides,
  } as McpRemoteClient;
}

describe('the member’s connections', () => {
  beforeEach(() => {
    process.env.MCP_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('revokes both tokens at the provider, then deletes', async () => {
    const revoke = vi.fn<(input: Parameters<McpRemoteClient['revoke']>[0]) => Promise<boolean>>(
      async () => true
    );
    const { repository, connections } = fakeRepository({
      credentials: {
        connection_id: CONNECTION_ID,
        authorization_server: 'https://auth.example.com',
        token_endpoint: 'https://auth.example.com/token',
        registration_kind: 'dcr',
        client_id: 'client-1',
        client_secret_enc: null,
        access_token_enc: encryptSecret('access-token'),
        refresh_token_enc: encryptSecret('refresh-token'),
        scope: null,
        expires_at: null,
        issued_at: '2026-11-01T10:00:00.000Z',
        metadata: {
          issuer: 'https://auth.example.com',
          revocation_endpoint: 'https://auth.example.com/revoke',
        } as never,
      },
    });
    const service = createMcpConnectionService({
      repository,
      remote: fakeRemote({ revoke }),
    });

    expect(await service.disconnect(USER, CONNECTION_ID)).toBe(true);

    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke.mock.calls.map(([input]) => input.token)).toEqual([
      'access-token',
      'refresh-token',
    ]);
    expect(revoke.mock.calls.map(([input]) => input.tokenTypeHint)).toEqual([
      'access_token',
      'refresh_token',
    ]);
    expect(connections.has(CONNECTION_ID)).toBe(false);
  });

  it('lists only the rows the member owns', async () => {
    const other = connection({ id: 'other', user_id: 'user-2' });
    const { repository } = fakeRepository({ connections: [connection(), other] });
    const service = createMcpConnectionService({ repository, remote: fakeRemote() });

    const listed = await service.list(USER);

    expect(listed.map((row) => row.id)).toEqual([CONNECTION_ID]);
  });

  it('marks a tool the last tool list did not see as stale, not gone', async () => {
    const { repository } = fakeRepository({
      tools: [
        tool({ tool_name: 'search', last_seen_at: '2026-11-10T10:00:00.000Z' }),
        tool({ tool_name: 'write', last_seen_at: '2026-11-09T10:00:00.000Z' }),
      ],
    });
    const service = createMcpConnectionService({ repository, remote: fakeRemote() });

    const detail = await service.detail(USER, CONNECTION_ID);

    expect(detail?.tools.map((entry) => [entry.name, entry.stale])).toEqual([
      ['search', false],
      ['write', true],
    ]);
  });

  it('does not call a fresh list stale because the connection was stamped a moment later', async () => {
    // The flow saves the tools, then writes the count and `last_synced_at`, so
    // the connection's stamp is always the later of the two. The comparison is
    // against the tools' own newest row, not against that stamp.
    const { repository } = fakeRepository({
      connections: [connection({ last_synced_at: '2026-11-10T10:00:01.000Z' })],
      tools: [tool({ last_seen_at: '2026-11-10T10:00:00.000Z' })],
    });
    const service = createMcpConnectionService({ repository, remote: fakeRemote() });

    const detail = await service.detail(USER, CONNECTION_ID);

    expect(detail?.tools[0]?.stale).toBe(false);
  });

  it('marks every old tool stale when the last read advertised none', async () => {
    const { repository } = fakeRepository({
      connections: [connection({ tool_count: 0 })],
      tools: [tool({ last_seen_at: '2026-11-10T10:00:00.000Z' })],
    });
    const service = createMcpConnectionService({ repository, remote: fakeRemote() });

    const detail = await service.detail(USER, CONNECTION_ID);

    expect(detail?.tools[0]?.stale).toBe(true);
  });

  it('answers nothing for a connection another member holds', async () => {
    const { repository } = fakeRepository({
      connections: [connection({ user_id: 'user-2' })],
    });
    const service = createMcpConnectionService({ repository, remote: fakeRemote() });

    expect(await service.detail(USER, CONNECTION_ID)).toBeNull();
    expect(await service.update(USER, CONNECTION_ID, { enabled: false })).toBe(false);
    expect(await service.disconnect(USER, CONNECTION_ID)).toBe(false);
    expect(await service.setTool(USER, CONNECTION_ID, 'search', false)).toBe('missing');
  });

  it('writes the three edits a member can make, and nothing else', async () => {
    const { repository, updates } = fakeRepository();
    const service = createMcpConnectionService({ repository, remote: fakeRemote() });

    await service.update(USER, CONNECTION_ID, {
      enabled: false,
      permissionLevel: 'reads',
      displayName: '  Workspace  ',
    });

    expect(updates).toEqual([
      {
        connectionId: CONNECTION_ID,
        patch: { enabled: false, permission_level: 'reads', display_name: 'Workspace' },
      },
    ]);
  });

  it('deletes locally even when the stored credential cannot be read', async () => {
    const revoke = vi.fn(async () => true);
    const { repository, connections } = fakeRepository({
      credentials: {
        connection_id: CONNECTION_ID,
        authorization_server: 'https://auth.example.com',
        token_endpoint: 'https://auth.example.com/token',
        registration_kind: 'dcr',
        client_id: 'client-1',
        client_secret_enc: null,
        // Ciphertext the test key cannot open: the provider call is impossible,
        // and the member's decision must still be the one that lands.
        access_token_enc: 'not-ciphertext',
        refresh_token_enc: null,
        scope: null,
        expires_at: null,
        issued_at: '2026-11-01T10:00:00.000Z',
        metadata: { issuer: 'https://auth.example.com' } as never,
      },
    });
    const service = createMcpConnectionService({
      repository,
      remote: fakeRemote({ revoke }),
    });

    expect(await service.disconnect(USER, CONNECTION_ID)).toBe(true);
    expect(connections.has(CONNECTION_ID)).toBe(false);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('deletes a connection that never stored credentials', async () => {
    const { repository, connections } = fakeRepository({ credentials: null });
    const service = createMcpConnectionService({ repository, remote: fakeRemote() });

    expect(await service.disconnect(USER, CONNECTION_ID)).toBe(true);
    expect(connections.has(CONNECTION_ID)).toBe(false);
  });

  it('drops a tool switch the connection does not advertise', async () => {
    const { repository, tools } = fakeRepository();
    const service = createMcpConnectionService({ repository, remote: fakeRemote() });

    expect(await service.setTool(USER, CONNECTION_ID, 'missing', false)).toBe('unknown_tool');
    expect(await service.setTool(USER, CONNECTION_ID, 'search', false)).toBe('ok');
    expect(tools.get(CONNECTION_ID)?.[0]?.enabled).toBe(false);
  });
});
