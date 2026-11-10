import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getMcpConnections: vi.fn(),
  startMcpConnection: vi.fn(),
  searchMcpCatalog: vi.fn(),
}));

vi.mock('@/frontend/api/mcp-connections', () => mocks);
vi.mock('@/frontend/api/mcp-catalog', () => mocks);

const session = vi.hoisted(() => ({ useSession: vi.fn() }));

vi.mock('@/frontend/state/session-provider', () => session);

import { McpMarketplaceView } from '../mcp/marketplace-view';
import { resetAppsCache } from '@/frontend/ui/apps/apps-cache';

const SUPABASE = {
  id: 'connection-1',
  registryName: 'com.supabase/mcp',
  displayName: 'Supabase',
  enabled: true,
  permissionLevel: 'all',
  status: 'active',
  toolCount: 36,
  connectedAt: '2026-11-10T10:43:34.000Z',
  lastUsedAt: null,
  lastError: null,
};

const CATALOGUE = {
  servers: [
    {
      registryName: 'com.supabase/mcp',
      title: 'Supabase',
      description: 'MCP server for interacting with the Supabase platform',
      nameAr: null,
      connectable: true,
      connectableReason: null,
      publishedAt: null,
    },
    {
      registryName: 'ac.snag/snag',
      title: 'Snag',
      description: 'A server the member has not connected',
      nameAr: null,
      connectable: null,
      connectableReason: null,
      publishedAt: null,
    },
  ],
  nextCursor: null,
};

/** One search whose answer this test decides when to give. */
function pending(): { promise: Promise<typeof CATALOGUE>; release: () => void } {
  let release: (page: typeof CATALOGUE) => void = () => {};
  const promise = new Promise<typeof CATALOGUE>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release(CATALOGUE) };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAppsCache();
  mocks.getMcpConnections.mockResolvedValue([SUPABASE]);
  mocks.searchMcpCatalog.mockResolvedValue(CATALOGUE);
  session.useSession.mockReturnValue({ user: { id: 'user-1' }, isLoading: false });
});

afterEach(cleanup);

describe('McpMarketplaceView — the catalogue row', () => {
  it('manages a server the member already connected instead of offering it again', async () => {
    render(<McpMarketplaceView tab="external" connect={null} />);

    const manage = await screen.findByRole('link', { name: 'إدارة Supabase' });
    expect(manage).toHaveAttribute('href', '/mcp/apps/connection-1');

    // The linked row states the connection; only the unlinked one asks to connect.
    expect(screen.getAllByText('متصل')).toHaveLength(2);
    expect(screen.queryByText('قابل للربط')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'ربط' })).toHaveLength(1);
  });
});

describe('McpMarketplaceView — the search state', () => {
  it('holds the skeleton, not a search sentence, while the first page loads', async () => {
    const first = pending();
    mocks.searchMcpCatalog.mockImplementationOnce(() => first.promise);

    render(<McpMarketplaceView tab="external" connect={null} />);

    expect((await screen.findAllByLabelText('جاري التحميل...')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    first.release();
    expect(await screen.findByText('Snag')).toBeInTheDocument();
  });

  it('names a search, and a refresh over an empty box, in their own words', async () => {
    const second = pending();
    const third = pending();
    mocks.searchMcpCatalog
      .mockResolvedValueOnce(CATALOGUE)
      .mockImplementationOnce(() => second.promise)
      .mockImplementationOnce(() => third.promise);

    render(<McpMarketplaceView tab="external" connect={null} />);
    await screen.findByText('Snag');

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'supa' } });

    expect(await screen.findByText('جاري البحث...')).toBeInTheDocument();
    // The answer that is still on screen is dimmed while its replacement is read.
    await waitFor(() => expect(document.querySelector('div[aria-busy="true"]')).not.toBeNull());

    second.release();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());

    fireEvent.change(input, { target: { value: '' } });

    expect(await screen.findByText('جاري تحديث القائمة...')).toBeInTheDocument();
    third.release();
  });
});
