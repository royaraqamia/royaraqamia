import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getMcpConnectedApps: vi.fn(),
  disconnectMcpConnectedApp: vi.fn(),
  disconnectAllMcpConnectedApps: vi.fn(),
}));

vi.mock('@/frontend/api/mcp-connected-apps', () => mocks);

import { McpConnectedAppsView } from '../mcp-connected-apps-view';

const CLAUDE = {
  clientId: 'client-1',
  clientName: 'Claude Code',
  connectedAt: '2026-09-01T10:00:00.000Z',
  lastUsedAt: '2026-10-13T10:00:00.000Z',
};

const OPENCODE = {
  clientId: 'client-2',
  clientName: 'OpenCode',
  connectedAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: null,
};

/* Radix dialog measures with ResizeObserver; jsdom does not ship it. */
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMcpConnectedApps.mockResolvedValue([CLAUDE, OPENCODE]);
  mocks.disconnectMcpConnectedApp.mockResolvedValue({ success: true });
  mocks.disconnectAllMcpConnectedApps.mockResolvedValue({ success: true });
});

afterEach(cleanup);

describe('McpConnectedAppsView', () => {
  it('lists the connected clients with their activity', async () => {
    render(<McpConnectedAppsView />);

    expect(await screen.findByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('OpenCode')).toBeInTheDocument();

    const activity = screen.getAllByText(/آخر استخدام:/);
    expect(activity).toHaveLength(2);
    expect(activity[0]).not.toHaveTextContent('لم يُستخدم بعد');
    expect(activity[1]).toHaveTextContent('لم يُستخدم بعد');
    expect(screen.getByRole('button', { name: 'فصل كل التَّطبيقات' })).toBeInTheDocument();
  });

  it('falls back to a generic name for an unnamed client', async () => {
    mocks.getMcpConnectedApps.mockResolvedValue([{ ...CLAUDE, clientName: null }]);

    render(<McpConnectedAppsView />);

    expect(await screen.findByText('تطبيق MCP')).toBeInTheDocument();
  });

  it('shows an empty state that points at the MCP guide', async () => {
    mocks.getMcpConnectedApps.mockResolvedValue([]);

    render(<McpConnectedAppsView />);

    expect(await screen.findByText('لا توجد تطبيقات متَّصلة')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ربط تطبيق جديد/ })).toHaveAttribute(
      'href',
      '/mcp/guide'
    );
    expect(screen.queryByRole('button', { name: 'فصل كل التَّطبيقات' })).not.toBeInTheDocument();
  });

  it('disconnects one client only after the user confirms', async () => {
    render(<McpConnectedAppsView />);

    fireEvent.click(await screen.findByRole('button', { name: 'فصل Claude Code' }));
    expect(mocks.disconnectMcpConnectedApp).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'فصل' }));

    await waitFor(() => expect(mocks.disconnectMcpConnectedApp).toHaveBeenCalledWith('client-1'));
    expect(mocks.disconnectAllMcpConnectedApps).not.toHaveBeenCalled();
    // The list is re-read from the server rather than filtered locally.
    await waitFor(() => expect(mocks.getMcpConnectedApps).toHaveBeenCalledTimes(2));
  });

  it('surfaces a failed disconnect instead of pretending it worked', async () => {
    mocks.disconnectMcpConnectedApp.mockResolvedValue({
      success: false,
      error: 'الخدمة غير متاحة',
    });
    render(<McpConnectedAppsView />);

    fireEvent.click(await screen.findByRole('button', { name: 'فصل Claude Code' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'فصل' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('الخدمة غير متاحة');
    expect(mocks.getMcpConnectedApps).toHaveBeenCalledTimes(1);
  });

  it('disconnects every client when that is confirmed', async () => {
    render(<McpConnectedAppsView />);

    fireEvent.click(await screen.findByRole('button', { name: 'فصل كل التَّطبيقات' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'فصل الكل' }));

    await waitFor(() => expect(mocks.disconnectAllMcpConnectedApps).toHaveBeenCalled());
    expect(mocks.disconnectMcpConnectedApp).not.toHaveBeenCalled();
  });

  it('offers a retry when the list cannot be read', async () => {
    mocks.getMcpConnectedApps.mockRejectedValue(new Error('غير مصرح'));
    render(<McpConnectedAppsView />);

    expect(await screen.findByText('تعذّر تحميل التَّطبيقات المتَّصلة.')).toBeInTheDocument();

    mocks.getMcpConnectedApps.mockResolvedValue([CLAUDE]);
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    expect(await screen.findByText('Claude Code')).toBeInTheDocument();
  });
});
