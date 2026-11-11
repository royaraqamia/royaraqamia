import { describe, expect, it, vi } from 'vitest';

import type { McpIconClient } from '@/backend/clients/mcp-icon';
import type {
  McpCatalogServerRecord,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import { createMcpIconService } from '../marketplace/icon-service';

/**
 * The icon proxy's door: a row's mark is served only while the row is one the
 * store would draw. The URL is the row's, never the caller's, so the proxy cannot
 * become a way to fetch a host of somebody else's choosing.
 */

const VERIFIED: McpCatalogServerRecord = {
  registry_name: 'com.vercel/vercel-mcp',
  title: 'Vercel',
  description: 'An MCP server for Vercel',
  name_ar: null,
  description_ar: null,
  remote_url: 'https://mcp.vercel.com',
  remote_override: null,
  status: 'active',
  blocked_at: null,
  blocked_reason: null,
  registry_icon_url: 'https://mcp.vercel.com/icons/vercel-light.svg',
  registry_icon_mime: 'image/svg+xml',
  probe_icon_url: null,
  probe_icon_mime: null,
  verified_at: '2026-11-14T00:00:00.000Z',
  connectable: true,
  connectable_reason: null,
  probed_at: '2026-11-14T00:00:00.000Z',
};

function repositoryWith(server: McpCatalogServerRecord | null): McpMarketplaceRepository {
  return {
    getCatalogServer: async () => server,
  } as unknown as McpMarketplaceRepository;
}

function fakeIcons(): McpIconClient & { fetch: ReturnType<typeof vi.fn> } {
  return {
    fetch: vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), mime: 'image/svg+xml' })),
  };
}

describe('the icon service', () => {
  it('fetches the stored mark of a verified, active, unblocked row', async () => {
    const icons = fakeIcons();
    const service = createMcpIconService({ repository: repositoryWith(VERIFIED), icons });

    await expect(service.get('com.vercel/vercel-mcp')).resolves.toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      mime: 'image/svg+xml',
    });
    expect(icons.fetch).toHaveBeenCalledWith('https://mcp.vercel.com/icons/vercel-light.svg');
  });

  it.each([
    ['an unverified row', { verified_at: null }],
    ['a blocked row', { blocked_at: '2026-11-14T00:00:00.000Z' }],
    ['a retired row', { status: 'deleted' }],
    ['a row with no mark', { registry_icon_url: null, probe_icon_url: null }],
  ])('answers nothing for %s', async (_label, overrides) => {
    const icons = fakeIcons();
    const service = createMcpIconService({
      repository: repositoryWith({ ...VERIFIED, ...overrides }),
      icons,
    });

    await expect(service.get('com.vercel/vercel-mcp')).resolves.toBeNull();
    expect(icons.fetch).not.toHaveBeenCalled();
  });

  it('answers nothing for a name the catalogue does not hold', async () => {
    const icons = fakeIcons();
    const service = createMcpIconService({ repository: repositoryWith(null), icons });

    await expect(service.get('gone/nowhere')).resolves.toBeNull();
    expect(icons.fetch).not.toHaveBeenCalled();
  });
});
