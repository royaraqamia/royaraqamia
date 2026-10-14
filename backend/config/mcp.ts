import {
  createMcpConnectionService,
  type McpConnectionService,
} from '@/backend/services/mcp/connections';
import { createMcpOAuthProvider } from '@/backend/services/mcp/oauth-provider';

/**
 * Composition root for the account area's MCP surface.
 *
 * The OAuth routes in `app/mcp/*` still build a provider inline; this is where
 * wiring added after them belongs, so the connection service has one owner.
 */
export function createDefaultMcpConnectionService(): McpConnectionService {
  return createMcpConnectionService({ provider: createMcpOAuthProvider() });
}
