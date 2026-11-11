import type {
  McpCatalogAdminPage,
  McpCatalogAdminUpdate,
  McpCatalogPage,
} from '@/shared/contracts/mcp-catalog';
import { request } from '@/frontend/transport/http';

/**
 * The marketplace's catalogue reads (ADR-0155).
 *
 * A failed read throws to the caller, like every list built on a stranger's
 * data: "no rows" and "we could not ask" must not look the same on a screen.
 */

/** One page of the catalogue the marketplace draws, signed in. */
export async function searchMcpCatalog(params: {
  q?: string;
  cursor?: string | null;
}): Promise<McpCatalogPage> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.cursor) search.set('cursor', params.cursor);
  const suffix = search.toString();

  const result = await request<{ success: boolean; data: McpCatalogPage }>(
    `/api/mcp/marketplace/servers${suffix ? `?${suffix}` : ''}`,
    { cache: 'no-store' }
  );
  return result.data;
}

export async function getAdminMcpCatalog(params: {
  q?: string;
  cursor?: string | null;
}): Promise<McpCatalogAdminPage> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.cursor) search.set('cursor', params.cursor);
  const suffix = search.toString();

  const result = await request<{ success: boolean; data: McpCatalogAdminPage }>(
    `/api/admin/mcp/catalog${suffix ? `?${suffix}` : ''}`,
    { cache: 'no-store' }
  );
  return result.data;
}

export async function updateAdminMcpCatalogRow(input: McpCatalogAdminUpdate): Promise<void> {
  await request('/api/admin/mcp/catalog', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** Measure one row now; the Admin Console re-reads it afterwards. */
export async function probeAdminMcpCatalogRow(registryName: string): Promise<void> {
  await request('/api/admin/mcp/catalog/probe', {
    method: 'POST',
    body: JSON.stringify({ registryName }),
  });
}
