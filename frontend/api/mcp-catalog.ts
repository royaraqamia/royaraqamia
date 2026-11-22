import type {
  McpCatalogAdminPage,
  McpCatalogAdminUpdate,
  McpCatalogPage,
  McpCatalogRemoteOption,
  McpCatalogRemoteOptions,
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

/**
 * The registry's addresses, read only when the remote picker opens. The list
 * deliberately leaves them out so a page of 50 rows is not a 45 KB JSON body.
 */
export async function getAdminMcpCatalogRemoteOptions(
  registryName: string
): Promise<McpCatalogRemoteOption[]> {
  const search = new URLSearchParams({ registryName });
  const result = await request<{ success: boolean; data: McpCatalogRemoteOptions }>(
    `/api/admin/mcp/catalog/raw?${search.toString()}`,
    { cache: 'no-store' }
  );
  return result.data.remoteOptions;
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
