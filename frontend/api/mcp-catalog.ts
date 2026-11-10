import type { McpCatalogAdminPage, McpCatalogAdminUpdate } from '@/shared/contracts/mcp-catalog';
import { request } from '@/frontend/transport/http';

/**
 * The Admin Console's catalogue API (ADR-0155, phase 2 / #1223).
 *
 * A failed read throws to the caller, like every admin list: "no rows" and "we
 * could not ask" must not look the same on a takedown screen.
 */

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
