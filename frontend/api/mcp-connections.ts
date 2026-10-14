import type {
  McpConnection,
  McpConnectionActionResult,
  McpConnectionListResult,
} from '@/shared/contracts/mcp-connections';
import { request } from '@/frontend/transport/http';

/**
 * The signed-in visitor's connected MCP clients, and the two ways to cut one
 * loose.
 *
 * Unlike `getMyRetainers`, a failed read is *not* degraded to an empty list: on
 * a security surface "nothing is connected" and "we could not tell you" must not
 * look the same. The caller renders the error instead.
 */

export async function getMcpConnections(): Promise<McpConnection[]> {
  const result = await request<McpConnectionListResult>('/api/me/mcp/connections', {
    cache: 'no-store',
  });
  return result.data ?? [];
}

export async function disconnectMcpConnection(
  clientId: string
): Promise<McpConnectionActionResult> {
  return disconnect(`/api/me/mcp/connections/${encodeURIComponent(clientId)}`);
}

export async function disconnectAllMcpConnections(): Promise<McpConnectionActionResult> {
  return disconnect('/api/me/mcp/connections');
}

async function disconnect(url: string): Promise<McpConnectionActionResult> {
  try {
    return await request<McpConnectionActionResult>(url, { method: 'DELETE' });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}
