import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { McpRemoteClient } from '@/backend/clients/mcp-remote';
import type {
  McpConnectionCredentialsRecord,
  McpConnectionRecord,
  McpConnectionToolRecord,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import type { McpAccessTokenService } from '@/backend/services/mcp/marketplace/access-token-service';
import { createMcpAppToolsService } from '@/backend/services/mcp/marketplace/app-tools-service';
import { McpRemoteError } from '@/backend/shared/domain/mcp-remote';
import { encryptSecret } from '@/backend/shared/mcp-token-crypto';

/**
 * One call on a stranger's server, as the member (#1225).
 *
 * What these pin is what a screen cannot: that a switched-off tool is refused at
 * the call and not only in the declaration list, that `reads` is enforced where
 * the socket opens, that a token the server rejects is refreshed once before it
 * is called a revocation, and that the card's "last used" moves on a completed
 * call.
 */

const CONNECTION: McpConnectionRecord = {
  id: 'conn-1',
  user_id: 'user-1',
  registry_name: 'io.example/notion',
  server_url: 'https://mcp.notion.example/mcp',
  display_name: 'Notion',
  enabled: true,
  permission_level: 'ask',
  status: 'active',
  auth_mode: 'oauth',
  tool_count: 2,
  connected_at: '2026-11-21T10:00:00.000Z',
  last_used_at: null,
  last_synced_at: null,
  last_error: null,
};

const TOOLS: McpConnectionToolRecord[] = [
  {
    connection_id: 'conn-1',
    tool_name: 'search',
    description: 'Search pages',
    input_schema: { type: 'object' },
    read_only: true,
    enabled: true,
    last_seen_at: '2026-11-21T10:00:00.000Z',
  },
  {
    connection_id: 'conn-1',
    tool_name: 'create_page',
    description: 'Create a page',
    input_schema: { type: 'object' },
    read_only: false,
    enabled: true,
    last_seen_at: '2026-11-21T10:00:00.000Z',
  },
];

function fakeRepository(
  overrides: {
    connection?: Partial<McpConnectionRecord>;
    tools?: McpConnectionToolRecord[];
    credentials?: McpConnectionCredentialsRecord | null;
  } = {}
) {
  const connection = { ...CONNECTION, ...overrides.connection };
  const tools = overrides.tools ?? TOOLS;
  const patches: Array<Record<string, unknown>> = [];

  const repository = {
    getConnection: async (userId: string, id: string) =>
      userId === connection.user_id && id === connection.id ? { ...connection } : null,
    getCredentials: async (id: string) =>
      id === connection.id ? (overrides.credentials ?? null) : null,
    listTools: async () => tools.map((tool) => ({ ...tool })),
    updateConnection: async (_id: string, patch: Record<string, unknown>) => {
      patches.push(patch);
    },
    listConnections: async (userId: string) =>
      userId === connection.user_id ? [{ ...connection }] : [],
    listUsableTools: async (userId: string) =>
      userId === connection.user_id
        ? tools
            .filter((tool) => tool.enabled)
            .map((tool) => ({ connection: { ...connection }, tool: { ...tool } }))
        : [],
  } as unknown as McpMarketplaceRepository;

  return { repository, patches, connection };
}

function fakeTokens(): McpAccessTokenService & { accessToken: ReturnType<typeof vi.fn> } {
  return { accessToken: vi.fn(async () => 'access-1') } as unknown as McpAccessTokenService & {
    accessToken: ReturnType<typeof vi.fn>;
  };
}

function fakeRemote(overrides: Partial<McpRemoteClient> = {}): McpRemoteClient {
  return {
    callTool: vi.fn(async () => ({ isError: false, content: [], structured: null })),
    ...overrides,
  } as unknown as McpRemoteClient;
}

function service(
  options: {
    repository?: ReturnType<typeof fakeRepository>;
    remote?: McpRemoteClient;
    tokens?: ReturnType<typeof fakeTokens>;
  } = {}
) {
  const repository = options.repository ?? fakeRepository();
  const remote = options.remote ?? fakeRemote();
  const tokens = options.tokens ?? fakeTokens();
  return {
    ...repository,
    remote,
    tokens,
    apps: createMcpAppToolsService({
      repository: repository.repository,
      remote,
      tokens,
      now: () => new Date('2026-11-21T12:00:00.000Z'),
    }),
  };
}

const CALL = {
  userId: 'user-1',
  connectionId: 'conn-1',
  toolName: 'search',
  args: { query: 'خطة' },
};

describe('one call on a connected app', () => {
  it('uses the member’s token and moves the card’s last-used stamp', async () => {
    const { apps, remote, tokens, patches } = service();

    await apps.call(CALL);

    expect(tokens.accessToken).toHaveBeenCalledWith(expect.objectContaining({ id: 'conn-1' }));
    expect(remote.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: CONNECTION.server_url,
        auth: { kind: 'bearer', token: 'access-1' },
        name: 'search',
        args: { query: 'خطة' },
      })
    );
    expect(patches).toContainEqual({ last_used_at: '2026-11-21T12:00:00.000Z' });
  });

  it('refuses another member’s connection', async () => {
    const { apps } = service();

    await expect(apps.call({ ...CALL, userId: 'user-2' })).rejects.toMatchObject({
      failure: 'protocol',
    });
  });

  it('refuses a tool the member switched off', async () => {
    const repository = fakeRepository({
      tools: TOOLS.map((tool) => ({ ...tool, enabled: false })),
    });
    const { apps } = service({ repository });

    await expect(apps.call(CALL)).rejects.toMatchObject({ failure: 'protocol' });
  });

  it('refuses a tool the connection never advertised', async () => {
    const { apps } = service();

    await expect(apps.call({ ...CALL, toolName: 'delete_everything' })).rejects.toMatchObject({
      failure: 'protocol',
    });
  });

  it('refuses a write from a turn on a reads-only connection, and allows the member’s own tap', async () => {
    const repository = fakeRepository({ connection: { permission_level: 'reads' } });
    const { apps, remote } = service({ repository });

    await expect(apps.call({ ...CALL, toolName: 'create_page' })).rejects.toMatchObject({
      failure: 'protocol',
    });
    expect(remote.callTool).not.toHaveBeenCalled();

    await apps.call({ ...CALL, toolName: 'create_page', intent: 'confirmed' });
    expect(remote.callTool).toHaveBeenCalledTimes(1);
  });

  it('refuses a connection that is waiting for the member to reconnect', async () => {
    const repository = fakeRepository({ connection: { status: 'needs_reauth' } });
    const { apps } = service({ repository });

    await expect(apps.call(CALL)).rejects.toMatchObject({ failure: 'reauth' });
  });
});

describe('a token the server refuses', () => {
  it('is refreshed once, and the call is retried with the new one', async () => {
    const tokens = fakeTokens();
    tokens.accessToken.mockResolvedValueOnce('access-1').mockResolvedValueOnce('access-2');

    let attempt = 0;
    const remote = fakeRemote({
      callTool: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new McpRemoteError('unauthorized', 'رفض التطبيق صلاحية الوصول الحالية.');
        }
        return { isError: false, content: [], structured: null };
      }),
    });

    const { apps, patches } = service({ remote, tokens });

    await apps.call(CALL);

    expect(tokens.accessToken).toHaveBeenLastCalledWith(expect.anything(), { force: true });
    expect(remote.callTool).toHaveBeenLastCalledWith(
      expect.objectContaining({ auth: { kind: 'bearer', token: 'access-2' } })
    );
    expect(patches.some((patch) => patch.status === 'needs_reauth')).toBe(false);
  });

  it('becomes needs_reauth when the fresh token is refused too', async () => {
    const remote = fakeRemote({
      callTool: vi.fn(async () => {
        throw new McpRemoteError('unauthorized', 'رفض التطبيق صلاحية الوصول الحالية.');
      }),
    });
    const { apps, patches } = service({ remote });

    await expect(apps.call(CALL)).rejects.toMatchObject({ failure: 'reauth' });
    expect(patches).toContainEqual(expect.objectContaining({ status: 'needs_reauth' }));
  });
});

describe('a tool the grant does not cover (#1230)', () => {
  it('is refused with the permission named, and the grant is not called dead', async () => {
    const tokens = fakeTokens();
    const remote = fakeRemote({
      callTool: vi.fn(async () => {
        throw new McpRemoteError(
          'scope',
          'هذا التطبيق يحتاج صلاحية «database:write» لأداء هذه العملية.',
          undefined,
          'database:write'
        );
      }),
    });
    const { apps, patches } = service({ remote, tokens });

    await expect(apps.call(CALL)).rejects.toMatchObject({
      failure: 'scope',
      missingScope: 'database:write',
    });

    // No refresh is spent: the same grant would come back, and the row keeps
    // its state — the connection is alive and merely narrow.
    expect(tokens.accessToken).toHaveBeenCalledTimes(1);
    expect(patches.some((patch) => patch.status === 'needs_reauth')).toBe(false);
    expect(patches).toContainEqual({
      last_error: 'هذا التطبيق يحتاج صلاحية «database:write» لأداء هذه العملية.',
    });
  });
});

describe('a connection that holds a key, or no credential at all (#1269)', () => {
  const keyCredentials = (): McpConnectionCredentialsRecord => ({
    connection_id: 'conn-1',
    authorization_server: null,
    token_endpoint: null,
    registration_kind: null,
    client_id: null,
    client_secret_enc: null,
    access_token_enc: null,
    refresh_token_enc: null,
    scope: null,
    expires_at: null,
    issued_at: '2026-11-21T10:00:00.000Z',
    metadata: null,
    api_key_enc: encryptSecret('sk-live-1'),
    api_key_header: 'X-API-Key',
    api_key_prefix: null,
    refresh_claimed_at: null,
  });

  beforeEach(() => {
    process.env.MCP_TOKEN_ENCRYPTION_KEY = 'b'.repeat(64);
  });

  it('sends the stored key in the catalogue’s header, and spends no token', async () => {
    const { apps, remote, tokens } = service({
      repository: fakeRepository({
        connection: { auth_mode: 'api_key' },
        credentials: keyCredentials(),
      }),
    });

    await apps.call(CALL);

    expect(tokens.accessToken).not.toHaveBeenCalled();
    expect(remote.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { kind: 'api_key', header: 'X-API-Key', value: 'sk-live-1' },
      })
    );
  });

  it('prefixes the key when the row names a scheme', async () => {
    const { apps, remote } = service({
      repository: fakeRepository({
        connection: { auth_mode: 'api_key' },
        credentials: {
          ...keyCredentials(),
          api_key_header: 'Authorization',
          api_key_prefix: 'Bearer',
        },
      }),
    });

    await apps.call(CALL);

    expect(remote.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { kind: 'api_key', header: 'Authorization', value: 'Bearer sk-live-1' },
      })
    );
  });

  it('asks for a new key when the ciphertext is gone, without calling the server', async () => {
    const { apps, remote, patches } = service({
      repository: fakeRepository({ connection: { auth_mode: 'api_key' } }),
    });

    await expect(apps.call(CALL)).rejects.toMatchObject({ failure: 'reauth' });
    expect(remote.callTool).not.toHaveBeenCalled();
    expect(patches).toContainEqual(expect.objectContaining({ status: 'needs_reauth' }));
  });

  it('sends no authorization at all for a no-auth connection', async () => {
    const { apps, remote, tokens } = service({
      repository: fakeRepository({ connection: { auth_mode: 'none' } }),
    });

    await apps.call(CALL);

    expect(tokens.accessToken).not.toHaveBeenCalled();
    expect(remote.callTool).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { kind: 'none' } })
    );
  });

  it('marks a refused key as a re-entry, not a refresh', async () => {
    const tokens = fakeTokens();
    const remote = fakeRemote({
      callTool: vi.fn(async () => {
        throw new McpRemoteError('unauthorized', 'رفض التطبيق صلاحية الوصول الحالية.');
      }),
    });
    const { apps, patches } = service({
      repository: fakeRepository({
        connection: { auth_mode: 'api_key' },
        credentials: keyCredentials(),
      }),
      remote,
      tokens,
    });

    await expect(apps.call(CALL)).rejects.toMatchObject({ failure: 'reauth' });

    // A key has nothing to refresh: one attempt, then the member's repair.
    expect(remote.callTool).toHaveBeenCalledTimes(1);
    expect(tokens.accessToken).not.toHaveBeenCalled();
    expect(patches).toContainEqual(expect.objectContaining({ status: 'needs_reauth' }));
  });
});

describe('the catalog a turn plans from', () => {
  it('is the member’s usable tools, with the app’s own name', async () => {
    const { apps } = service();

    const catalog = await apps.catalog('user-1');

    expect(catalog.map((tool) => tool.toolName)).toEqual(['search', 'create_page']);
    expect(catalog.every((tool) => tool.appName === 'Notion')).toBe(true);
    expect(catalog[0]?.permissionLevel).toBe('ask');
  });

  it('names a connection the member renamed, and none for a stranger', async () => {
    const { apps } = service({
      repository: fakeRepository({ connection: { display_name: 'مساحتي' } }),
    });

    await expect(apps.names('user-1', ['conn-1'])).resolves.toEqual(
      new Map([['conn-1', 'مساحتي']])
    );
    await expect(apps.names('user-2', ['conn-1'])).resolves.toEqual(new Map());
  });

  it('counts a live app for the composer’s meter and not a revoked one (#1226)', async () => {
    const live = service();
    await expect(live.apps.connectedCount('user-1')).resolves.toBe(1);
    await expect(live.apps.connectedCount('user-2')).resolves.toBe(0);

    const revoked = service({ repository: fakeRepository({ connection: { status: 'revoked' } }) });
    await expect(revoked.apps.connectedCount('user-1')).resolves.toBe(0);
  });
});
