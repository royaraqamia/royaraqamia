import type {
  AgentToolGrantListResult,
  AgentToolGrantResult,
} from '@/shared/contracts/agent-tool-grants';
import { request } from '@/frontend/transport/http';

/**
 * The member's assistant tool grants (ADR-0180, #1438).
 *
 * A failed read is thrown like every account view's getter: "no grants" and
 * "we could not tell you" must not look the same on a trust surface. A grant or
 * revocation answers the server's sentence, which the view draws.
 */

export async function getAgentToolGrants(): Promise<AgentToolGrantListResult> {
  return request<AgentToolGrantListResult>('/api/account/assistant/grants', {
    cache: 'no-store',
  });
}

export async function grantAgentTool(toolId: string): Promise<AgentToolGrantResult> {
  return write('/api/account/assistant/grants', {
    method: 'POST',
    body: JSON.stringify({ toolId }),
  });
}

export async function revokeAgentTool(id: string): Promise<AgentToolGrantResult> {
  return write(`/api/account/assistant/grants/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

async function write(
  url: string,
  options: { method: 'POST' | 'DELETE'; body?: string }
): Promise<AgentToolGrantResult> {
  try {
    return await request<AgentToolGrantResult>(url, {
      method: options.method,
      ...(options.body ? { body: options.body } : {}),
    });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}
