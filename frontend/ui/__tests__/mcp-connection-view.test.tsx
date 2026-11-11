import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getMcpConnection: vi.fn(),
  startMcpConnection: vi.fn(),
  updateMcpConnection: vi.fn(),
  disconnectMcpConnection: vi.fn(),
  setMcpConnectionTool: vi.fn(),
}));

vi.mock('@/frontend/api/mcp-connections', () => mocks);
vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ user: { id: 'user-1' }, isLoading: false }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { McpConnectionView } from '../mcp/connection-view';

/**
 * The one repair a dead grant has (#1227): the apps screen says «أعد الربط» and
 * the button starts the same consent flow again, on the connection the member
 * already holds — so a cap is not the reason they cannot reconnect.
 */

const DEAD_GRANT = {
  id: 'connection-1',
  registryName: 'io.example/notion',
  displayName: 'Notion',
  enabled: true,
  permissionLevel: 'ask',
  status: 'needs_reauth',
  toolCount: 0,
  connectedAt: '2026-11-21T10:00:00.000Z',
  lastUsedAt: null,
  lastError: 'انتهت صلاحية الوصول إلى التطبيق.',
  tools: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMcpConnection.mockResolvedValue(DEAD_GRANT);
  mocks.startMcpConnection.mockResolvedValue({
    authorizeUrl: 'https://auth.example/authorize?state=abc',
  });
});

afterEach(cleanup);

describe('a connection whose grant expired', () => {
  it('says so, and starts the consent flow again in one click', async () => {
    render(<McpConnectionView connectionId="connection-1" connected={false} />);

    expect(
      await screen.findByText(
        'انتهت صلاحية الوصول إلى التطبيق. أعد الربط ليستطيع نور استدعاء أدواته.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'أعد الربط' }));

    // The same connection, not a second one: `start` finds the live row and
    // reuses its slot.
    expect(mocks.startMcpConnection).toHaveBeenCalledWith('io.example/notion');
  });

  it('draws no reconnect button while the connection is well', async () => {
    mocks.getMcpConnection.mockResolvedValue({ ...DEAD_GRANT, status: 'active', lastError: null });

    render(<McpConnectionView connectionId="connection-1" connected={false} />);

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'أعد الربط' })).not.toBeInTheDocument();
  });
});
