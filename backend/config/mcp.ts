import {
  createMcpConnectedAppService,
  type McpConnectedAppService,
} from '@/backend/services/mcp/connected-apps';
import { createMcpOAuthProvider } from '@/backend/services/mcp/oauth-provider';

/**
 * Composition root for the account area's MCP surface.
 *
 * The OAuth routes in `app/mcp/*` still build a provider inline; this is where
 * wiring added after them belongs, so the connected-apps service has one owner.
 */
export function createDefaultMcpConnectedAppService(): McpConnectedAppService {
  return createMcpConnectedAppService({ provider: createMcpOAuthProvider() });
}
