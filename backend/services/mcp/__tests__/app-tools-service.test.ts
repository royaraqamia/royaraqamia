import { describe, expect, it, vi } from 'vitest';

import type { McpRemoteClient } from '@/backend/clients/mcp-remote';
import type {
  McpConnectionRecord,
  McpConnectionToolRecord,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import type { McpAccessTokenService } from '@/backend/services/mcp/marketplace/access-token-service';
import { createMcpAppToolsService } from '@/backend/services/mcp/marketplace/app-tools-service';
import { McpRemoteError } from '@/backend/shared/domain/mcp-remote';

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
  } = {}
) {
  const connection = { ...CONNECTION, ...overrides.connection };
  const tools = overrides.tools ?? TOOLS;
  const patches: Array<Record<string, unknown>> = [];

  const repository = {
    getConnection: async (userId: string, id: string) =>
      userId === connection.user_id && id === connection.id ? { ...connection } : null,
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
        accessToken: 'access-1',
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
      expect.objectContaining({ accessToken: 'access-2' })
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
});
