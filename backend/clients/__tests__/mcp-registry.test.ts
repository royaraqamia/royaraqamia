import { describe, expect, it, vi } from 'vitest';

import { createMcpRegistryClient } from '../mcp-registry';

/**
 * The registry's brand marks: a row can publish a vector and a raster, and the
 * store wants the one that looks right at 40px on a 2x screen. The rest of the
 * registry client is exercised through the catalogue service's fake; this pins
 * the choice, because a wrong one is a blurry square nobody notices in review.
 */

const PUBLIC = [{ address: '93.184.216.34' }];

function pageWithIcons(icons: unknown) {
  const fetchImpl = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          servers: [
            {
              server: {
                name: 'app.linear/linear',
                title: 'Linear',
                description: 'Issues',
                version: '1.0.0',
                remotes: [{ type: 'streamable-http', url: 'https://mcp.linear.app/mcp' }],
                icons,
              },
              _meta: {
                'io.modelcontextprotocol.registry/official': {
                  status: 'active',
                  isLatest: true,
                },
              },
            },
          ],
          metadata: {},
        }),
        { headers: { 'content-type': 'application/json' } }
      )
  );

  return createMcpRegistryClient({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    resolveHost: async () => PUBLIC,
  });
}

describe('the registry icon', () => {
  it('prefers a 256px PNG over the SVG beside it', async () => {
    const client = pageWithIcons([
      { src: 'https://static.linear.app/icon.svg', mimeType: 'image/svg+xml', sizes: ['any'] },
      { src: 'https://static.linear.app/icon-256.png', mimeType: 'image/png', sizes: ['256x256'] },
    ]);

    const page = await client.listPage();

    expect(page.entries[0]).toMatchObject({
      iconUrl: 'https://static.linear.app/icon-256.png',
      iconMime: 'image/png',
    });
  });

  it('falls back to the SVG when there is no raster', async () => {
    const client = pageWithIcons([
      { src: 'https://static.linear.app/icon.svg', mimeType: 'image/svg+xml', sizes: ['any'] },
    ]);

    const page = await client.listPage();

    expect(page.entries[0]).toMatchObject({
      iconUrl: 'https://static.linear.app/icon.svg',
      iconMime: 'image/svg+xml',
    });
  });

  it('keeps no mark from a plain-http URL or a type the proxy will not serve', async () => {
    const client = pageWithIcons([
      { src: 'http://static.linear.app/icon.png', mimeType: 'image/png' },
      { src: 'https://static.linear.app/icon.gif', mimeType: 'image/gif' },
    ]);

    const page = await client.listPage();

    expect(page.entries[0]).toMatchObject({ iconUrl: null, iconMime: null });
  });

  it('keeps a usable URL even when its mime is missing', async () => {
    const client = pageWithIcons([{ src: 'https://static.linear.app/icon.png' }]);

    const page = await client.listPage();

    expect(page.entries[0]).toMatchObject({
      iconUrl: 'https://static.linear.app/icon.png',
      iconMime: null,
    });
  });
});
