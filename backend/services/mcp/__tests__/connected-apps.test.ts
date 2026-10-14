import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createMcpConnectedAppService } from '../connected-apps';
import type { McpOAuthProvider } from '../oauth-provider';

/**
 * The account area's service: it shapes grants for display and decides what a
 * disconnect means. The provider owns tokens, so it is mocked here.
 */

function makeProvider() {
  return {
    listUserGrants: vi.fn(),
    revokeUserClient: vi.fn(),
    revokeAllUserTokens: vi.fn(),
  };
}

function makeService(provider: ReturnType<typeof makeProvider>) {
  return createMcpConnectedAppService({ provider: provider as unknown as McpOAuthProvider });
}

const GRANT = {
  client_id: 'client-1',
  client_name: 'Claude Code',
  connected_at: '2026-09-01T10:00:00.000Z',
  last_used_at: '2026-10-13T10:00:00.000Z',
};

describe('createMcpConnectedAppService.list', () => {
  let provider: ReturnType<typeof makeProvider>;

  beforeEach(() => {
    provider = makeProvider();
    provider.listUserGrants.mockResolvedValue([]);
  });

  it('maps a grant to the contract shape, dropping the token row', async () => {
    provider.listUserGrants.mockResolvedValue([GRANT]);

    await expect(makeService(provider).list('user-1')).resolves.toEqual([
      {
        clientId: 'client-1',
        clientName: 'Claude Code',
        connectedAt: '2026-09-01T10:00:00.000Z',
        lastUsedAt: '2026-10-13T10:00:00.000Z',
      },
    ]);
  });

  it('carries an unnamed client through as a null name', async () => {
    provider.listUserGrants.mockResolvedValue([{ ...GRANT, client_name: null }]);

    const [connectedApp] = await makeService(provider).list('user-1');

    expect(connectedApp?.clientName).toBeNull();
  });

  it('orders by most recent activity', async () => {
    provider.listUserGrants.mockResolvedValue([
      { ...GRANT, client_id: 'old', last_used_at: '2026-10-01T10:00:00.000Z' },
      { ...GRANT, client_id: 'new', last_used_at: '2026-10-13T10:00:00.000Z' },
    ]);

    const connectedApps = await makeService(provider).list('user-1');

    expect(connectedApps.map((c) => c.clientId)).toEqual(['new', 'old']);
  });

  it('sorts a never-used grant by when it connected instead of last', async () => {
    provider.listUserGrants.mockResolvedValue([
      {
        ...GRANT,
        client_id: 'quiet',
        last_used_at: null,
        connected_at: '2026-10-13T09:00:00.000Z',
      },
      { ...GRANT, client_id: 'used', last_used_at: '2026-10-01T10:00:00.000Z' },
    ]);

    const connectedApps = await makeService(provider).list('user-1');

    expect(connectedApps.map((c) => c.clientId)).toEqual(['quiet', 'used']);
  });

  it('propagates a repository failure instead of reporting an empty list', async () => {
    provider.listUserGrants.mockRejectedValue(new Error('db down'));

    await expect(makeService(provider).list('user-1')).rejects.toThrow('db down');
  });
});

describe('createMcpConnectedAppService.disconnect', () => {
  it('disconnects exactly one client', async () => {
    const provider = makeProvider();

    await makeService(provider).disconnect('user-1', 'client-1');

    expect(provider.revokeUserClient).toHaveBeenCalledWith('user-1', 'client-1');
    expect(provider.revokeAllUserTokens).not.toHaveBeenCalled();
  });

  it('propagates a failure so the caller can refuse to report success', async () => {
    const provider = makeProvider();
    provider.revokeUserClient.mockRejectedValue(new Error('shred failed'));

    await expect(makeService(provider).disconnect('user-1', 'client-1')).rejects.toThrow(
      'shred failed'
    );
  });
});

describe('createMcpConnectedAppService.disconnectAll', () => {
  it('revokes every MCP token the user holds', async () => {
    const provider = makeProvider();

    await makeService(provider).disconnectAll('user-1');

    expect(provider.revokeAllUserTokens).toHaveBeenCalledWith('user-1');
    expect(provider.revokeUserClient).not.toHaveBeenCalled();
  });
});
