import type {
  McpConnectedApp,
  McpConnectedAppActionResult,
  McpConnectedAppListResult,
} from '@/shared/contracts/mcp-connected-apps';
import { request } from '@/frontend/transport/http';

/**
 * The signed-in visitor's connected MCP clients, and the two ways to cut one
 * loose.
 *
 * A failed read is thrown to the caller like every account view's getter since
 * #448: on a security surface "nothing is connected" and "we could not tell
 * you" must not look the same. The view renders the difference.
 */

export async function getMcpConnectedApps(): Promise<McpConnectedApp[]> {
  const result = await request<McpConnectedAppListResult>('/api/me/mcp/connected-apps', {
    cache: 'no-store',
  });
  return result.data ?? [];
}

export async function disconnectMcpConnectedApp(
  clientId: string
): Promise<McpConnectedAppActionResult> {
  return disconnect(`/api/me/mcp/connected-apps/${encodeURIComponent(clientId)}`);
}

export async function disconnectAllMcpConnectedApps(): Promise<McpConnectedAppActionResult> {
  return disconnect('/api/me/mcp/connected-apps');
}

async function disconnect(url: string): Promise<McpConnectedAppActionResult> {
  try {
    return await request<McpConnectedAppActionResult>(url, { method: 'DELETE' });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}
