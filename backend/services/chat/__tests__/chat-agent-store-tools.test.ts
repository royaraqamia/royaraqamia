import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  chatAgentTool,
  chatAgentToolDefinitions,
  type ChatAgentToolContext,
} from '@/backend/services/chat/chat-agent-tools';
import type { McpAppTool } from '@/backend/services/mcp/marketplace/app-tools-service';
import { CHAT_AGENT_TOOLS, chatAgentActionSentence } from '@/shared/contracts/chat-agent-actions';
import type { McpConnection } from '@/shared/contracts/mcp-marketplace';

/**
 * The store's hands (issue #1436). The mocks are the three services the tools
 * call through `backend/config/mcp`: the connection list and switches, the
 * consent start, and the flat tool catalog. Nothing here opens a socket.
 */
const store = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  disconnect: vi.fn(),
  start: vi.fn(),
  catalog: vi.fn(),
  search: vi.fn(),
}));

vi.mock('@/backend/config/mcp', () => ({
  createDefaultMcpConnectionService: () => ({
    list: store.list,
    update: store.update,
    disconnect: store.disconnect,
  }),
  createDefaultMcpConnectService: () => ({ start: store.start }),
  createDefaultMcpAppToolsService: () => ({ catalog: store.catalog }),
  createDefaultMcpCatalogService: () => ({ search: store.search }),
  mcpCallbackUrl: () => 'https://example.test/mcp/callback',
}));

function context(): ChatAgentToolContext {
  return { userId: 'member-1', supabase: {} as never, ip: '127.0.0.1' };
}

function connection(patch: Partial<McpConnection> = {}): McpConnection {
  return {
    id: 'conn-1',
    registryName: 'notion',
    displayName: 'Notion',
    enabled: true,
    permissionLevel: 'ask',
    status: 'active',
    authMode: 'oauth',
    toolCount: 3,
    connectedAt: '2026-11-01T00:00:00.000Z',
    lastUsedAt: null,
    lastError: null,
    ...patch,
  };
}

function catalogTool(patch: Partial<McpAppTool> = {}): McpAppTool {
  return {
    connectionId: 'conn-1',
    appName: 'Notion',
    toolName: 'search',
    description: 'Search pages',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    permissionLevel: 'ask',
    ...patch,
  };
}

function noSecret(value: unknown): void {
  const text = JSON.stringify(value).toLocaleLowerCase();
  for (const secret of [
    'access_token',
    'refresh_token',
    'api_key',
    'client_secret',
    'consent_code',
  ]) {
    expect(text).not.toContain(secret);
  }
}

describe('the MCP store from the assistant (issue #1436)', () => {
  beforeEach(() => {
    store.list.mockReset().mockResolvedValue([connection()]);
    store.update.mockReset().mockResolvedValue(true);
    store.disconnect.mockReset().mockResolvedValue(true);
    store.start.mockReset().mockResolvedValue({ kind: 'connected', connectionId: 'conn-1' });
    store.catalog
      .mockReset()
      .mockResolvedValue([
        catalogTool(),
        catalogTool({ toolName: 'create_page', description: 'Add a page', readOnly: false }),
      ]);
    store.search.mockReset().mockResolvedValue({
      servers: [
        { registryName: 'notion', title: 'Notion', nameAr: null },
        { registryName: 'linear', title: 'Linear', nameAr: null },
      ],
      nextCursor: null,
    });
  });

  it('declares the five hands once, with the tiers the decision assigns', () => {
    expect(chatAgentTool('list_apps')?.tier).toBe(0);
    expect(chatAgentTool('list_app_tools')?.tier).toBe(0);
    expect(chatAgentTool('connect_app')?.tier).toBe(2);
    expect(chatAgentTool('disconnect_app')?.tier).toBe(2);
    expect(chatAgentTool('revoke_app')?.tier).toBe(3);
    for (const name of [
      'list_apps',
      'list_app_tools',
      'connect_app',
      'disconnect_app',
      'revoke_app',
    ]) {
      expect(
        chatAgentToolDefinitions().filter((entry) => entry.function.name === name)
      ).toHaveLength(1);
    }
  });

  it('answers "what apps are connected" with names and tool counts, never a credential', async () => {
    store.list.mockResolvedValue([
      connection(),
      connection({ id: 'conn-2', registryName: 'linear', displayName: null, toolCount: 1 }),
    ]);

    const answer = await chatAgentTool('list_apps')!.run({}, context());

    expect(answer).toEqual({
      apps: [
        { name: 'Notion', tool_count: 3 },
        { name: 'linear', tool_count: 1 },
      ],
      total: 2,
    });
    noSecret(answer);
  });

  it('answers an empty store with an empty list rather than a guess', async () => {
    store.list.mockResolvedValue([]);
    expect(await chatAgentTool('list_apps')!.run({}, context())).toEqual({ apps: [], total: 0 });
  });

  it('lists the tools of the app the member named, on their own connection', async () => {
    store.catalog.mockResolvedValue([
      catalogTool(),
      catalogTool({ toolName: 'create_page', description: 'Add a page', readOnly: false }),
      catalogTool({ connectionId: 'conn-2', toolName: 'other' }),
    ]);

    const answer = await chatAgentTool('list_app_tools')!.run({ name: 'Notion' }, context());

    expect(answer).toEqual({
      app: 'Notion',
      tools: [
        { name: 'search', description: 'Search pages', read_only: true },
        { name: 'create_page', description: 'Add a page', read_only: false },
      ],
    });
    noSecret(answer);
  });

  it('refuses an app that is not the member’s, and an ambiguous name', async () => {
    expect(await chatAgentTool('list_app_tools')!.run({ name: 'other' }, context())).toEqual({
      error: 'لم أجد تطبيقاً بهذا الاسم.',
    });
    store.list.mockResolvedValue([
      connection(),
      connection({ id: 'conn-2', displayName: 'Notion' }),
    ]);
    expect(await chatAgentTool('disconnect_app')!.run({ name: 'Notion' }, context())).toEqual({
      error: 'يوجد أكثر من تطبيق بهذا الاسم. استخدم الاسم المعروض في «تطبيقاتنا».',
    });
    expect(store.update).not.toHaveBeenCalled();
  });

  it('starts a consent with our own callback and returns the link, never the code', async () => {
    const authorizeUrl = 'https://provider.test/authorize?state=opaque&scope=read';
    store.start.mockResolvedValue({ kind: 'authorize', authorizeUrl });

    // The member speaks in the store's title; `start` is called with the row's
    // stable registry name, never with a name guessed from the question.
    const answer = await chatAgentTool('connect_app')!.run({ name: 'Notion' }, context());

    expect(store.start).toHaveBeenCalledWith({
      userId: 'member-1',
      registryName: 'notion',
      redirectUri: 'https://example.test/mcp/callback',
    });
    expect(answer).toEqual({ app: 'Notion', consent_url: authorizeUrl });
    expect(Object.keys(answer as object)).not.toContain('code');
    noSecret(answer);
  });

  it('refuses to start a consent for a name the store does not carry', async () => {
    expect(await chatAgentTool('connect_app')!.run({ name: 'unknown' }, context())).toEqual({
      error: 'لم أجد تطبيقاً بهذا الاسم في المتجر.',
    });
    expect(store.start).not.toHaveBeenCalled();
  });

  it('never lets a tool accept a credential or a consent code as an argument', () => {
    for (const name of ['connect_app', 'disconnect_app', 'revoke_app']) {
      const schema = chatAgentTool(name)!.schema;
      expect(schema.safeParse({ name: 'notion', api_key: 'secret' }).success).toBe(false);
      expect(schema.safeParse({ name: 'notion', code: 'secret' }).success).toBe(false);
    }
  });

  it('makes disconnect a tier-2 card that stops the app without deleting it', async () => {
    const answer = await chatAgentTool('disconnect_app')!.run({ name: 'Notion' }, context());

    expect(store.update).toHaveBeenCalledWith('member-1', 'conn-1', { enabled: false });
    expect(store.disconnect).not.toHaveBeenCalled();
    expect(answer).toEqual({ app: 'Notion', enabled: false });
    expect(CHAT_AGENT_TOOLS.disconnect_app.kind).toBe('write');
    const sentence = chatAgentActionSentence('disconnect_app', { name: 'Notion' });
    expect(sentence).toContain('Notion');
    noSecret({ sentence });
  });

  it('makes revoke a tier-3 card whose typed target is the app’s own name', async () => {
    // The registry name resolves the row, but the typed target on a destructive
    // card must be the name the member actually reads on it.
    store.list.mockResolvedValue([
      connection({ displayName: 'Notion Docs', registryName: 'notion-docs' }),
    ]);

    const wrong = await chatAgentTool('revoke_app')!.run({ name: 'notion-docs' }, context());
    expect(wrong).toEqual({ error: 'اسم التطبيق غير مطابق.' });
    expect(store.disconnect).not.toHaveBeenCalled();

    const answer = await chatAgentTool('revoke_app')!.run({ name: 'Notion Docs' }, context());
    expect(store.disconnect).toHaveBeenCalledWith('member-1', 'conn-1');
    expect(answer).toEqual({ app: 'Notion Docs', revoked: true });
    const sentence = chatAgentActionSentence('revoke_app', { name: 'Notion Docs' });
    expect(sentence).toContain('Notion Docs');
    noSecret({ sentence });
  });

  it('names the app on the connect card without carrying the consent link', () => {
    const sentence = chatAgentActionSentence('connect_app', { name: 'notion' });
    expect(sentence).toContain('notion');
    expect(sentence).not.toContain('http');
    expect(sentence).not.toContain('state');
  });
});
