import type {
  McpConnection,
  McpConnectionActionResult,
  McpConnectionDetail,
  McpConnectionDetailResult,
  McpConnectionListResult,
  McpConnectionToolUpdate,
  McpConnectionUpdate,
} from '@/shared/contracts/mcp-marketplace';
import { request } from '@/frontend/transport/http';

/**
 * The signed-in member's outbound apps (ADR-0155, phase 3 / #1224).
 *
 * Reads throw to the caller, like every account view's getter since #448: on a
 * permissions screen "nothing is connected" and "we could not tell you" must not
 * look the same, and only the caller can draw the difference. Writes answer with
 * the same `{ success, error }` shape the server uses, so a refusal's sentence
 * crosses unchanged.
 */

export async function getMcpConnections(): Promise<McpConnection[]> {
  const result = await request<McpConnectionListResult>('/api/me/mcp/connections', {
    cache: 'no-store',
  });
  return result.data ?? [];
}

export async function getMcpConnection(connectionId: string): Promise<McpConnectionDetail> {
  const result = await request<McpConnectionDetailResult>(
    `/api/me/mcp/connections/${encodeURIComponent(connectionId)}`,
    { cache: 'no-store' }
  );
  if (!result.data) throw new Error(result.error ?? 'تعذّر تحميل التطبيق.');
  return result.data;
}

export async function updateMcpConnection(
  connectionId: string,
  patch: McpConnectionUpdate
): Promise<McpConnectionActionResult> {
  return write(`/api/me/mcp/connections/${encodeURIComponent(connectionId)}`, 'PATCH', patch);
}

export async function disconnectMcpConnection(
  connectionId: string
): Promise<McpConnectionActionResult> {
  return write(`/api/me/mcp/connections/${encodeURIComponent(connectionId)}`, 'DELETE');
}

export async function setMcpConnectionTool(
  connectionId: string,
  input: McpConnectionToolUpdate
): Promise<McpConnectionActionResult> {
  return write(`/api/me/mcp/connections/${encodeURIComponent(connectionId)}/tools`, 'PATCH', input);
}

/**
 * Starts a connection.
 *
 * An OAuth row answers the provider's consent URL; a row that needs no
 * credential, or a key the member just typed, is connected on the server and
 * answers the connection (#1269).
 *
 * Throws the server's own sentence when it refuses: a plan at its cap, a blocked
 * row, a missing key and an unreachable server have their sentences written where
 * the decision is made.
 */
export type McpStartResult =
  { kind: 'authorize'; authorizeUrl: string } | { kind: 'connected'; connectionId: string };

export async function startMcpConnection(
  registryName: string,
  options: { apiKey?: string } = {}
): Promise<McpStartResult> {
  const result = await request<{ success: boolean; data?: McpStartResult }>(
    '/api/mcp/marketplace/connections/start',
    {
      method: 'POST',
      body: JSON.stringify({
        registryName,
        ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      }),
    }
  );
  if (!result.data) throw new Error('تعذّر بدء الربط. حاول من جديد.');
  return result.data;
}

/** Replaces the key a live `api_key` connection holds (#1269). */
export async function replaceMcpConnectionKey(
  connectionId: string,
  apiKey: string
): Promise<McpConnectionActionResult> {
  return write(`/api/me/mcp/connections/${encodeURIComponent(connectionId)}`, 'PATCH', {
    apiKey,
  });
}

async function write(
  url: string,
  method: 'PATCH' | 'DELETE',
  body?: unknown
): Promise<McpConnectionActionResult> {
  try {
    return await request<McpConnectionActionResult>(url, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}
