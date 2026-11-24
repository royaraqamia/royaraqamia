import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  chatAgentTool,
  chatAgentToolDefinitions,
  type ChatAgentToolContext,
} from '@/backend/services/chat/chat-agent-tools';
import { createMcpConnectedAppService } from '@/backend/services/mcp/connected-apps';
import { createMcpOAuthProvider } from '@/backend/services/mcp/oauth-provider';
import { hashToken } from '@/backend/shared/mcp-token-crypto';
import type {
  McpOAuthClientRecord,
  McpOAuthRepository,
  McpTokenRecord,
  McpUserGrantRecord,
} from '@/backend/repositories/mcp/mcp-oauth-repository';
import type { McpConnectedApp } from '@/shared/contracts/mcp-connected-apps';
import { CHAT_AGENT_TOOLS, chatAgentActionSentence } from '@/shared/contracts/chat-agent-actions';

/**
 * The inbound clients' hands (issue #1437). The tools read the very service the
 * apps sheet's third tab reads, so the mock is that service — one source of
 * truth, and a test that cannot pass with a second, narrower view of a grant.
 */
const inbound = vi.hoisted(() => ({
  service: null as unknown,
  list: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('@/backend/config/mcp', () => ({
  createDefaultMcpConnectedAppService: () => inbound.service,
}));

function context(): ChatAgentToolContext {
  return { userId: 'member-1', supabase: {} as never, ip: '127.0.0.1' };
}

function grant(patch: Partial<McpConnectedApp> = {}): McpConnectedApp {
  return {
    clientId: 'client-1',
    clientName: 'Claude Code',
    connectedAt: '2026-11-01T00:00:00.000Z',
    lastUsedAt: '2026-11-13T10:00:00.000Z',
    scopes: ['community.read', 'notes.read'],
    ...patch,
  };
}

function noSecret(value: unknown): void {
  const text = JSON.stringify(value).toLocaleLowerCase();
  for (const secret of [
    'access_token',
    'refresh_token',
    'client_secret',
    'session_enc',
    'clientid',
    'token_hash',
  ]) {
    expect(text).not.toContain(secret);
  }
}

describe('the inbound MCP clients from the assistant (issue #1437)', () => {
  beforeEach(() => {
    inbound.service = { list: inbound.list, disconnect: inbound.disconnect };
    inbound.list.mockReset().mockResolvedValue([grant()]);
    inbound.disconnect.mockReset().mockResolvedValue(undefined);
  });

  it('declares the two hands once, at the tiers the decision assigns', () => {
    expect(chatAgentTool('list_inbound_clients')?.tier).toBe(0);
    expect(chatAgentTool('list_inbound_clients')?.kind).toBe('read');
    expect(chatAgentTool('revoke_inbound_client')?.tier).toBe(3);
    expect(chatAgentTool('revoke_inbound_client')?.kind).toBe('write');
    for (const name of ['list_inbound_clients', 'revoke_inbound_client']) {
      expect(
        chatAgentToolDefinitions().filter((entry) => entry.function.name === name)
      ).toHaveLength(1);
      expect(CHAT_AGENT_TOOLS[name as keyof typeof CHAT_AGENT_TOOLS]).toBeDefined();
    }
  });

  it('lists the same grants the tab reads, with name, scopes and last use', async () => {
    const tab = [
      grant(),
      grant({
        clientId: 'client-2',
        clientName: null,
        connectedAt: '2026-11-02T00:00:00.000Z',
        lastUsedAt: null,
        scopes: [],
      }),
    ];
    inbound.list.mockResolvedValue(tab);

    const answer = await chatAgentTool('list_inbound_clients')!.run({}, context());

    expect(inbound.list).toHaveBeenCalledWith('member-1');
    expect(inbound.disconnect).not.toHaveBeenCalled();
    expect(answer).toEqual({
      clients: [
        {
          name: 'Claude Code',
          scopes: ['community.read', 'notes.read'],
          last_used_at: '2026-11-13T10:00:00.000Z',
          connected_at: '2026-11-01T00:00:00.000Z',
        },
        {
          name: null,
          scopes: [],
          last_used_at: null,
          connected_at: '2026-11-02T00:00:00.000Z',
        },
      ],
      total: 2,
    });
    noSecret(answer);
  });

  it('answers a member with no clients with an empty list', async () => {
    inbound.list.mockResolvedValue([]);
    expect(await chatAgentTool('list_inbound_clients')!.run({}, context())).toEqual({
      clients: [],
      total: 0,
    });
  });

  it('never lets a revoke take a token, a refresh token or a client secret', () => {
    const schema = chatAgentTool('revoke_inbound_client')!.schema;
    for (const extra of [
      { token: 'secret' },
      { access_token: 'secret' },
      { refresh_token: 'secret' },
      { client_secret: 'secret' },
      { scope: 'admin' },
      { clientId: 'client-1' },
    ]) {
      expect(schema.safeParse({ name: 'Claude Code', ...extra }).success).toBe(false);
    }
  });

  it('refuses a client that is not the member’s, and an ambiguous name', async () => {
    expect(await chatAgentTool('revoke_inbound_client')!.run({ name: 'other' }, context())).toEqual(
      {
        error: 'لم أجد عميلاً متصلاً بهذا الاسم.',
      }
    );
    inbound.list.mockResolvedValue([grant(), grant({ clientId: 'client-2' })]);
    expect(
      await chatAgentTool('revoke_inbound_client')!.run({ name: 'Claude Code' }, context())
    ).toEqual({
      error: 'يوجد أكثر من عميل متصل بهذا الاسم. استخدم الاسم المعروض في تبويب العملاء الواردين.',
    });
    expect(inbound.disconnect).not.toHaveBeenCalled();
  });

  it('makes revoke a tier-3 card whose typed target is the client’s own name', async () => {
    inbound.list.mockResolvedValue([
      grant({ clientName: 'Claude Code Desktop', clientId: 'client-9' }),
    ]);

    const wrong = await chatAgentTool('revoke_inbound_client')!.run(
      { name: 'claude-code' },
      context()
    );
    expect(wrong).toEqual({ error: 'لم أجد عميلاً متصلاً بهذا الاسم.' });

    // The card names the displayed client, case-insensitively, and revokes that
    // row alone — never the id the model might otherwise guess.
    const answer = await chatAgentTool('revoke_inbound_client')!.run(
      { name: 'claude code desktop' },
      context()
    );
    expect(inbound.disconnect).toHaveBeenCalledWith('member-1', 'client-9');
    expect(answer).toEqual({ client: 'Claude Code Desktop', revoked: true });

    const sentence = chatAgentActionSentence('revoke_inbound_client', {
      name: 'Claude Code Desktop',
    });
    expect(sentence).toContain('Claude Code Desktop');
    noSecret({ sentence });
  });

  it('refuses to revoke by name a client whose registration was pruned', async () => {
    inbound.list.mockResolvedValue([grant({ clientName: null })]);
    expect(
      await chatAgentTool('revoke_inbound_client')!.run({ name: 'client-1' }, context())
    ).toEqual({ error: 'لم أجد عميلاً متصلاً بهذا الاسم.' });
    expect(inbound.disconnect).not.toHaveBeenCalled();
  });

  it('names the client on the card without carrying a credential', () => {
    const sentence = chatAgentActionSentence('revoke_inbound_client', { name: 'Claude Code' });
    expect(sentence).toContain('Claude Code');
    expect(sentence).not.toContain('http');
    noSecret({ sentence });
  });
});

/**
 * The acceptance's last clause, end to end: the revoke card calls the same
 * disconnect the tab does, and the *next* request from that client is refused
 * with `invalid_grant`. A stateful in-memory store stands in for Postgres; no
 * socket and no real credential is involved.
 */
describe('the next call after a revoke (issue #1437)', () => {
  const client: McpOAuthClientRecord = {
    id: 'client-1',
    client_id: 'public-client-1',
    client_secret_hash: null,
    client_name: 'Claude Code',
    redirect_uris: ['https://client.test/callback'],
    scopes: ['notes.read'],
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
  };

  function makeStore() {
    const refreshHash = hashToken('refresh-1');
    const accessHash = hashToken('access-1');
    const refresh: McpTokenRecord = {
      id: 'tok-refresh',
      token_hash: refreshHash,
      kind: 'refresh',
      client_id: 'client-1',
      user_id: 'member-1',
      scope: ['notes.read'],
      session_enc: null,
      refresh_token_hash: null,
      expires_at: '2027-01-01T00:00:00.000Z',
      revoked_at: null,
      last_used_at: null,
    };
    const access: McpTokenRecord = {
      ...refresh,
      id: 'tok-access',
      token_hash: accessHash,
      kind: 'access',
    };
    const rows = new Map([
      [refreshHash, { ...refresh }],
      [accessHash, { ...access }],
    ]);
    const grantRow: McpUserGrantRecord = {
      client_id: 'client-1',
      client_name: 'Claude Code',
      connected_at: '2026-11-01T00:00:00.000Z',
      last_used_at: '2026-11-13T10:00:00.000Z',
      scopes: ['notes.read'],
    };
    const repo = {
      getTokenByHash: vi.fn(async (hash: string) => rows.get(hash) ?? null),
      listUserGrants: vi.fn(async () => [grantRow]),
      listUserSessionEncs: vi.fn(async () => []),
      revokeUserClientTokens: vi.fn(async (userId: string, clientId: string) => {
        for (const row of rows.values()) {
          if (row.user_id === userId && row.client_id === clientId) {
            row.revoked_at = '2026-11-14T00:00:00.000Z';
            row.session_enc = null;
          }
        }
      }),
      deleteUserClientAuthCodes: vi.fn(async () => undefined),
    };
    return { repo: repo as unknown as McpOAuthRepository, rows, refreshHash, accessHash };
  }

  it('revokes by the name on the card and answers the client invalid_grant', async () => {
    const { repo } = makeStore();
    const provider = createMcpOAuthProvider({ repo, bridgeSessions: { revoke: vi.fn() } });
    inbound.service = createMcpConnectedAppService({ provider });

    // Before the revoke the grant is live: this is the client's next call.
    await expect(provider.verifyAccessToken('access-1')).resolves.toMatchObject({
      userId: 'member-1',
    });

    const answer = await chatAgentTool('revoke_inbound_client')!.run(
      { name: 'Claude Code' },
      context()
    );
    expect(answer).toEqual({ client: 'Claude Code', revoked: true });
    noSecret(answer);

    // The same client, same credentials, immediately afterwards: its access
    // token verifies to nothing and its refresh is refused with invalid_grant.
    await expect(provider.verifyAccessToken('access-1')).resolves.toBeNull();
    await expect(
      provider.refreshAccessToken({ refreshToken: 'refresh-1', client })
    ).rejects.toMatchObject({ code: 'invalid_grant' });
  });
});
