import type { Metadata } from 'next';

import { McpCatalogAdminView } from '@/frontend/ui/admin/mcp/catalog-admin-view';
import { MCP_CATALOG_ADMIN_COPY } from '@/shared/contracts/mcp-catalog';

export const metadata: Metadata = {
  title: MCP_CATALOG_ADMIN_COPY.title,
  description: MCP_CATALOG_ADMIN_COPY.description,
};

// The Admin Console layout owns authentication, so this page is only its title
// and its view (ADR-0155, phase 2 / #1223).
export default function AdminMcpMarketplacePage() {
  return <McpCatalogAdminView />;
}
