'use client';

import { McpConnectedAppsView } from '@/frontend/ui/account/mcp-connected-apps-view';

/**
 * The clients connected to our MCP server, as one panel of the apps surface.
 *
 * The view itself is the account screen's, shared rather than copied: this is
 * only the shape the surface needs — a query and no second page heading.
 */
export function InboundTab({ query }: { query: string }) {
  return <McpConnectedAppsView heading={false} query={query} />;
}
