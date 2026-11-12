import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getMcpConnections: vi.fn(),
  startMcpConnection: vi.fn(),
  searchMcpCatalog: vi.fn(),
}));

vi.mock('@/frontend/api/mcp-connections', () => mocks);
vi.mock('@/frontend/api/mcp-catalog', () => mocks);

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

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
  authMode: 'oauth',
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
      authMode: 'oauth',
      probeAuthMode: 'oauth',
      connectable: true,
      connectableReason: null,
      publishedAt: null,
      requestedScopes: [],
    },
    {
      registryName: 'ac.snag/snag',
      title: 'Snag',
      description: 'A server the member has not connected',
      nameAr: null,
      authMode: 'oauth',
      probeAuthMode: null,
      connectable: null,
      connectableReason: null,
      publishedAt: null,
      requestedScopes: ['database:read', 'projects:read'],
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

describe('McpMarketplaceView — the ask before the consent (#1230)', () => {
  it('names the permissions we will request, in the member’s language', async () => {
    mocks.startMcpConnection.mockResolvedValue({
      kind: 'authorize',
      authorizeUrl: 'https://auth.example/go',
    });

    render(<McpMarketplaceView tab="external" connect={null} />);

    fireEvent.click(await screen.findByRole('button', { name: 'ربط' }));

    expect(
      await screen.findByText('سيطلب نور هذه الصلاحيات من التطبيق عند الربط:')
    ).toBeInTheDocument();
    expect(screen.getByText('database:read · projects:read')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'متابعة' }));

    await waitFor(() => expect(mocks.startMcpConnection).toHaveBeenCalledWith('ac.snag/snag'));
  });

  it('says the app decides when the row asks for nothing', async () => {
    const row = CATALOGUE.servers[1];
    mocks.searchMcpCatalog.mockResolvedValue({
      servers: [{ ...row, requestedScopes: [] }],
      nextCursor: null,
    });

    render(<McpMarketplaceView tab="external" connect={null} />);

    fireEvent.click(await screen.findByRole('button', { name: 'ربط' }));

    expect(
      await screen.findByText('لا نطلب صلاحيات محدّدة: التطبيق يمنح ما يراه مناسبًا عند الموافقة.')
    ).toBeInTheDocument();
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

/**
 * The two modes that never leave the site (#1269): a row that needs no account
 * links from the same dialog, and a key row asks for the key there rather than
 * sending the member to a consent screen that does not exist.
 */
describe('linking a row that does not use OAuth (#1269)', () => {
  const NO_AUTH = {
    ...CATALOGUE.servers[1],
    registryName: 'com.cloudflare.mcp/docs',
    title: 'Cloudflare Docs',
    authMode: 'none',
    probeAuthMode: 'none',
    requestedScopes: [],
  };

  const KEYED = {
    ...CATALOGUE.servers[1],
    registryName: 'com.postman/mcp',
    title: 'Postman',
    authMode: 'api_key',
    probeAuthMode: 'oauth',
    requestedScopes: [],
  };

  it('links a no-auth row without a consent screen, and opens its screen', async () => {
    mocks.searchMcpCatalog.mockResolvedValue({ servers: [NO_AUTH], nextCursor: null });
    mocks.startMcpConnection.mockResolvedValue({
      kind: 'connected',
      connectionId: 'connection-9',
    });

    render(<McpMarketplaceView tab="external" connect={null} />);

    fireEvent.click(await screen.findByRole('button', { name: 'ربط' }));
    expect(
      await screen.findByText('هذا التطبيق لا يحتاج حساباً ولا مفتاحاً: نور يستدعي أدواته مباشرة.')
    ).toBeInTheDocument();

    const confirms = screen.getAllByRole('button', { name: 'ربط' });
    fireEvent.click(confirms[confirms.length - 1]!);

    await waitFor(() =>
      expect(mocks.startMcpConnection).toHaveBeenCalledWith('com.cloudflare.mcp/docs')
    );
    expect(router.push).toHaveBeenCalledWith('/mcp/apps/connection-9?connect=done');
  });

  it('asks for the key before linking an api_key row, and sends it once', async () => {
    mocks.searchMcpCatalog.mockResolvedValue({ servers: [KEYED], nextCursor: null });
    mocks.startMcpConnection.mockResolvedValue({
      kind: 'connected',
      connectionId: 'connection-8',
    });

    render(<McpMarketplaceView tab="external" connect={null} />);

    fireEvent.click(await screen.findByRole('button', { name: 'ربط' }));

    const input = await screen.findByLabelText('المفتاح');
    fireEvent.change(input, { target: { value: 'pm-live-1' } });

    const confirms = screen.getAllByRole('button', { name: 'ربط' });
    fireEvent.click(confirms[confirms.length - 1]!);

    await waitFor(() =>
      expect(mocks.startMcpConnection).toHaveBeenCalledWith('com.postman/mcp', {
        apiKey: 'pm-live-1',
      })
    );
  });

  it('does not send an empty key', async () => {
    mocks.searchMcpCatalog.mockResolvedValue({ servers: [KEYED], nextCursor: null });

    render(<McpMarketplaceView tab="external" connect={null} />);

    fireEvent.click(await screen.findByRole('button', { name: 'ربط' }));
    const confirms = screen.getAllByRole('button', { name: 'ربط' });
    fireEvent.click(confirms[confirms.length - 1]!);

    expect(await screen.findByText('أدخل المفتاح أولاً.')).toBeInTheDocument();
    expect(mocks.startMcpConnection).not.toHaveBeenCalled();
  });
});
