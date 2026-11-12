import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getMcpConnection: vi.fn(),
  startMcpConnection: vi.fn(),
  updateMcpConnection: vi.fn(),
  disconnectMcpConnection: vi.fn(),
  setMcpConnectionTool: vi.fn(),
  replaceMcpConnectionKey: vi.fn(),
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
  authMode: 'oauth',
  status: 'needs_reauth',
  toolCount: 0,
  connectedAt: '2026-11-21T10:00:00.000Z',
  lastUsedAt: null,
  lastError: 'انتهت صلاحية الوصول إلى التطبيق.',
  scopes: [],
  tools: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMcpConnection.mockResolvedValue(DEAD_GRANT);
  mocks.startMcpConnection.mockResolvedValue({
    kind: 'authorize',
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

  it('draws no second reconnect control while the grant is dead', async () => {
    mocks.getMcpConnection.mockResolvedValue({ ...DEAD_GRANT, status: 'active', lastError: null });

    render(<McpConnectionView connectionId="connection-1" connected={false} />);

    await screen.findByRole('heading', { level: 1 });
    // One repair per state: a well connection widens, it does not "reconnect".
    expect(screen.queryByRole('button', { name: 'أعد الربط' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'توسيع الصلاحيات' })).toBeInTheDocument();
  });
});

describe('the grant a connection was given (#1230)', () => {
  const NARROW = {
    ...DEAD_GRANT,
    status: 'active' as const,
    lastError: null,
    scopes: ['database:read', 'projects:read'],
  };

  it('draws the permissions the provider issued, as it named them', async () => {
    mocks.getMcpConnection.mockResolvedValue(NARROW);

    render(<McpConnectionView connectionId="connection-1" connected={false} />);

    expect(await screen.findByText('database:read')).toBeInTheDocument();
    expect(screen.getByText('projects:read')).toBeInTheDocument();
  });

  it('shows the refusal the app answered, and offers the wider consent beside it', async () => {
    mocks.getMcpConnection.mockResolvedValue({
      ...NARROW,
      lastError:
        'هذا التطبيق يحتاج صلاحية «database:write» لأداء هذه العملية، ولم تُمنح عند الربط.',
    });

    render(<McpConnectionView connectionId="connection-1" connected={false} />);

    expect(
      await screen.findByText(
        'هذا التطبيق يحتاج صلاحية «database:write» لأداء هذه العملية، ولم تُمنح عند الربط.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'توسيع الصلاحيات' }));

    expect(mocks.startMcpConnection).toHaveBeenCalledWith('io.example/notion');
  });

  it('says the grant is unread rather than drawing an empty list as a fact', async () => {
    mocks.getMcpConnection.mockResolvedValue({ ...NARROW, scopes: [] });

    render(<McpConnectionView connectionId="connection-1" connected={false} />);

    expect(
      await screen.findByText('لم نسجّل صلاحيات هذا الربط. أعد الربط لتُقرأ من التطبيق.')
    ).toBeInTheDocument();
  });
});
